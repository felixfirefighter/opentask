import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { Database } from "@/shared/db/client";
import type { Clock } from "@/shared/time/clock";
import { ianaTimeZoneSchema } from "@/shared/validation/time-zone";

import {
  focusHistoryPageSchema,
  focusHistoryQuerySchema,
  focusLinkSearchInputSchema,
  focusSummarySchema,
  type FocusHistoryItemDto,
  type FocusHistoryPage,
  type FocusHistoryQuery,
  type FocusLinkSearchInput,
  type FocusLinkValidators,
  type FocusOwnedLink,
  type FocusSummary,
  type FocusTimerSnapshot,
} from "./contracts";
import {
  decodeFocusHistoryCursor,
  encodeFocusHistoryCursor,
  focusHistoryAfter,
} from "./focus-history-cursor";
import { resolveFocusSessionLink } from "./focus-link-validation";
import { mapFocusSession, mapFocusTimerSnapshot, storedFocusSession } from "./focus-mapper";
import { createPostgresFocusReadSnapshot, type FocusReadSnapshot } from "./focus-read-snapshot";
import { createFocusSummaryWindow, deriveFocusSummaryFromDailyTotals } from "../domain/focus-summary-policy";
import { createFocusSessionRepository } from "../infrastructure/focus-session-repository";

type FocusSessionRepository = ReturnType<typeof createFocusSessionRepository>;
export type FocusReadApplicationRepository = Pick<
  FocusSessionRepository,
  "findCompletedFocusAnchor" | "findUnfinished" | "listCompletedFocus" | "sumCompletedFocusByLocalDate"
>;

export type UserFocusTimezoneResolver = (actor: AuthenticatedActor) => Promise<string>;

export function createFocusReadApplication({
  database,
  clock,
  links,
  resolveUserTimezone,
  snapshot = createPostgresFocusReadSnapshot(database),
  sessions = createFocusSessionRepository(database),
}: Readonly<{
  database: Database;
  clock: Clock;
  links: FocusLinkValidators;
  resolveUserTimezone: UserFocusTimezoneResolver;
  snapshot?: FocusReadSnapshot;
  sessions?: FocusReadApplicationRepository;
}>) {
  return {
    async getActiveFocusSession(actor: AuthenticatedActor): Promise<FocusTimerSnapshot | null> {
      return snapshot.run(async (transaction) => {
        const row = await sessions.findUnfinished(actor.userId, transaction);
        if (!row) return null;
        const session = storedFocusSession(row);
        const link = await resolveFocusSessionLink(actor, session, links, transaction);
        return mapFocusTimerSnapshot(session, clock.now(), link);
      });
    },

    async getFocusSummary(actor: AuthenticatedActor): Promise<FocusSummary> {
      const timezone = ianaTimeZoneSchema.parse(await resolveUserTimezone(actor));
      return snapshot.run(async (transaction) => {
        const window = createFocusSummaryWindow(timezone, clock.now());
        const rows = await sessions.sumCompletedFocusByLocalDate(
          actor.userId,
          timezone,
          { startAt: window.startAt, endAt: window.endAt },
          transaction,
        );
        return focusSummarySchema.parse(deriveFocusSummaryFromDailyTotals(rows, window));
      });
    },

    async listRecentFocusSessions(
      actor: AuthenticatedActor,
      rawQuery: FocusHistoryQuery = {},
    ): Promise<FocusHistoryPage> {
      const query = focusHistoryQuerySchema.parse(rawQuery);
      const cursor = decodeFocusHistoryCursor(query.cursor, actor.userId);

      return snapshot.run(async (transaction) => {
        const anchor = cursor
          ? await sessions.findCompletedFocusAnchor(actor.userId, cursor.id, transaction)
          : null;
        const after = focusHistoryAfter(cursor, anchor);
        const rows = await sessions.listCompletedFocus(
          actor.userId,
          { limit: query.limit + 1, ...(after ? { after } : {}) },
          transaction,
        );
        const pageRows = rows.slice(0, query.limit);
        const taskIds = uniqueIds(pageRows.map(({ taskId }) => taskId));
        const habitIds = uniqueIds(pageRows.map(({ habitId }) => habitId));
        const taskLinks = await links.task.readOwnedMany(actor, taskIds, transaction);
        const habitLinks = await links.habit.readOwnedMany(actor, habitIds, transaction);
        const linksByKey = new Map(
          [...taskLinks, ...habitLinks].map((link) => [`${link.kind}:${link.id}`, link]),
        );
        const items = pageRows.map((row) => historyItem(row, linksByKey));
        const last = items.at(-1)?.session;
        const nextCursor =
          rows.length > query.limit && last?.endedAt
            ? encodeFocusHistoryCursor({
                version: 1,
                userId: actor.userId,
                endedAt: last.endedAt,
                id: last.id,
              })
            : null;
        return focusHistoryPageSchema.parse({ items, nextCursor });
      });
    },

    async searchFocusLinks(
      actor: AuthenticatedActor,
      rawInput: FocusLinkSearchInput,
    ): Promise<readonly FocusOwnedLink[]> {
      const input = focusLinkSearchInputSchema.parse(rawInput);
      const [tasks, habits] = await Promise.all([
        links.task.searchOwned(actor, input),
        links.habit.searchOwned(actor, input),
      ]);
      return [...tasks, ...habits]
        .filter((link) => link.available && link.label !== null)
        .sort(compareFocusLinks)
        .slice(0, input.limit);
    },
  } as const;
}

function historyItem(
  row: Parameters<typeof storedFocusSession>[0],
  linksByKey: ReadonlyMap<string, FocusOwnedLink>,
): FocusHistoryItemDto {
  const session = mapFocusSession(storedFocusSession(row));
  const selection = session.taskId
    ? { kind: "task" as const, id: session.taskId }
    : session.habitId
      ? { kind: "habit" as const, id: session.habitId }
      : null;
  if (selection === null) return { session, link: null };

  const owned = linksByKey.get(`${selection.kind}:${selection.id}`);
  const available = owned?.available === true && owned.label !== null;
  return {
    session,
    link: {
      ...selection,
      label: available ? owned.label : null,
      availability: available ? "available" : "unavailable",
    },
  };
}

function uniqueIds(values: readonly (string | null)[]): string[] {
  return [...new Set(values.filter((value): value is string => value !== null))];
}

function compareFocusLinks(left: FocusOwnedLink, right: FocusOwnedLink): number {
  const leftLabel = left.label?.toLowerCase() ?? "";
  const rightLabel = right.label?.toLowerCase() ?? "";
  if (leftLabel < rightLabel) return -1;
  if (leftLabel > rightLabel) return 1;
  if (left.kind !== right.kind) return left.kind === "task" ? -1 : 1;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

export type FocusReadApplication = ReturnType<typeof createFocusReadApplication>;
