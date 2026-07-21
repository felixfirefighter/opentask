import type { AuthenticatedActor, SessionIdentity } from "@/shared/auth/actor";
import { AuthenticationRequiredError } from "@/shared/auth/actor";
import type { Database, DatabaseTransaction } from "@/shared/db/client";
import { ApplicationError } from "@/shared/http/application-error";
import type { Clock } from "@/shared/time/clock";

import { createDemoDatasetSeeder, createInboxBootstrapPort, DEMO_FOCUS_TASK_ID } from "@/modules/tasks";

import type { DemoDatasetSeeder, DemoEntryResult, InboxBootstrapPort } from "./contracts";
import {
  defaultPreferenceDocument,
  preferenceDocumentSchema,
  preferenceSchemaVersion,
  userPreferencesPatchSchema,
  type UserPreferences,
  type UserPreferencesPatch,
} from "./preferences-contract";
import type { AuthRuntimeConfig } from "../infrastructure/auth-runtime-config";
import { createAuthenticationGateway } from "../infrastructure/authentication-gateway";
import { createDemoEntryLimiter } from "../infrastructure/demo-entry-limiter";
import { createPreferencesRepository } from "../infrastructure/preferences-repository";
import type { StoredPreferences } from "../infrastructure/preferences-repository";
import { isDemoAccountEmail } from "../infrastructure/demo-account-policy";

export function createIdentityApplication({
  database,
  clock,
  authRuntime,
  inboxPort = createInboxBootstrapPort(database, clock),
  demoSeeder = createDefaultDemoSeeder(database),
}: {
  database: Database;
  clock: Clock;
  authRuntime: AuthRuntimeConfig;
  inboxPort?: InboxBootstrapPort;
  demoSeeder?: DemoDatasetSeeder;
}) {
  const preferencesRepository = createPreferencesRepository(clock);

  async function bootstrapAccount(userId: string, existingTransaction?: DatabaseTransaction): Promise<void> {
    const bootstrap = async (transaction: DatabaseTransaction) => {
      await preferencesRepository.ensureDefaults(transaction, userId, {
        schemaVersion: preferenceSchemaVersion,
        preferences: defaultPreferenceDocument,
      });
      await inboxPort.ensureInbox(userId, transaction);
    };

    if (existingTransaction) await bootstrap(existingTransaction);
    else await database.transaction(bootstrap);
  }

  const authentication = createAuthenticationGateway({
    database,
    runtime: authRuntime,
    onAccountAvailable: bootstrapAccount,
  });
  const demoEntryLimiter = createDemoEntryLimiter(database, clock);

  async function getOptionalSessionIdentity(headers: Headers): Promise<SessionIdentity | null> {
    const identity = await authentication.findSession(headers);
    if (identity) await bootstrapAccount(identity.actor.userId);
    return identity;
  }

  async function resolveActor(headers: Headers): Promise<AuthenticatedActor> {
    const identity = await getOptionalSessionIdentity(headers);
    if (!identity) throw new AuthenticationRequiredError();
    return identity.actor;
  }

  async function getUserPreferences(actor: AuthenticatedActor): Promise<UserPreferences> {
    const stored = await preferencesRepository.findByUserId(database, actor.userId);
    if (!stored) throw new Error("The authenticated account does not have preferences.");
    return mapPreferences(stored);
  }

  async function updateUserPreferences(
    actor: AuthenticatedActor,
    expectedVersion: number,
    patchInput: UserPreferencesPatch,
  ): Promise<UserPreferences> {
    const patch = userPreferencesPatchSchema.parse(patchInput);

    return database.transaction(async (transaction) => {
      const stored = await preferencesRepository.findByUserId(transaction, actor.userId);
      if (!stored) throw new Error("The authenticated account does not have preferences.");
      const current = mapPreferences(stored);

      if (current.version !== expectedVersion) throw preferenceConflict();
      const document = preferenceDocumentSchema.parse({
        timezone: patch.timezone ?? current.timezone,
        weekStart: patch.weekStart ?? current.weekStart,
        hourCycle: patch.hourCycle ?? current.hourCycle,
        theme: patch.theme ?? current.theme,
        reducedMotion: patch.reducedMotion ?? current.reducedMotion,
      });
      const updated = await preferencesRepository.update(
        transaction,
        actor.userId,
        expectedVersion,
        document,
        preferenceSchemaVersion,
      );
      if (!updated) throw preferenceConflict();
      return mapPreferences(updated);
    });
  }

  async function enterDemo(headers: Headers): Promise<DemoEntryResult> {
    const clientAddress = authentication.findClientAddress(headers) ?? "unknown-client";
    if (!(await demoEntryLimiter.consume(clientAddress))) {
      throw new ApplicationError("RATE_LIMITED", "Try the demo again in about an hour.");
    }

    const current = await authentication.findSession(headers);
    if (current && isDemoAccountEmail(current.email)) {
      await bootstrapAccount(current.actor.userId);
      await resetDemoWorkspace(current.actor.userId);
      return { actor: current.actor, mode: "reset", setCookieHeaders: [] };
    }

    const created = await authentication.createDemoAccount(headers);
    await bootstrapAccount(created.identity.actor.userId);
    await resetDemoWorkspace(created.identity.actor.userId);
    return {
      actor: created.identity.actor,
      mode: "created",
      setCookieHeaders: created.setCookieHeaders,
    };
  }

  async function resetDemoWorkspace(userId: string): Promise<void> {
    const resetAt = clock.now();
    await database.transaction(async (transaction) => {
      const resetPreferences = await preferencesRepository.resetToDefaults(
        transaction,
        userId,
        {
          schemaVersion: preferenceSchemaVersion,
          preferences: defaultPreferenceDocument,
        },
        resetAt,
      );
      if (!resetPreferences) throw new Error("Demo reset requires canonical user preferences.");
      await demoSeeder.reset(userId, resetAt, transaction);
    });
  }

  return {
    bootstrapAccount,
    enterDemo,
    getOptionalSessionIdentity,
    getUserPreferences,
    handleAuthRequest: authentication.handle,
    resolveActor,
    security: authentication.security,
    updateUserPreferences,
  };
}

function createDefaultDemoSeeder(database: Database): DemoDatasetSeeder {
  return {
    async reset(userId: string, resetAt: Date, existingTransaction?: DatabaseTransaction): Promise<void> {
      const resetClock: Clock = { now: () => resetAt };
      // Load cross-module demo adapters only when demo entry runs. A static identity ->
      // assistant import would close the assistant -> planning -> identity runtime cycle
      // and prevent ordinary manual planning routes from starting.
      const [
        { createDemoProposalResetter },
        { createDemoHabitSeeder, DEMO_FOCUS_HABIT_ID },
        { createDemoFocusSeeder },
      ] = await Promise.all([
        import("@/modules/assistant"),
        import("@/modules/habits"),
        import("@/modules/focus"),
      ]);
      const proposals = createDemoProposalResetter({ database });
      const tasks = createDemoDatasetSeeder({ database, clock: resetClock });
      const habits = createDemoHabitSeeder({ database, clock: resetClock });
      const focus = createDemoFocusSeeder({
        links: { taskId: DEMO_FOCUS_TASK_ID, habitId: DEMO_FOCUS_HABIT_ID },
      });
      const reset = async (transaction: DatabaseTransaction) => {
        await proposals.reset(userId, transaction);
        await focus.clear(userId, transaction);
        await tasks.reset(userId, transaction);
        await habits.reset(userId, transaction);
        await focus.seed(userId, resetAt, transaction);
      };

      if (existingTransaction) await reset(existingTransaction);
      else await database.transaction(reset);
    },
  };
}

function mapPreferences(stored: StoredPreferences): UserPreferences {
  if (stored.schemaVersion !== preferenceSchemaVersion) {
    throw new Error(`Unsupported user preferences schema version: ${stored.schemaVersion}`);
  }
  return {
    schemaVersion: preferenceSchemaVersion,
    version: stored.version,
    ...preferenceDocumentSchema.parse(stored.preferences),
  };
}

function preferenceConflict() {
  return new ApplicationError(
    "CONFLICT",
    "Settings changed elsewhere. Review the latest saved values before trying again.",
  );
}
