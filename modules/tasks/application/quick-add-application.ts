import { en, type ParsedComponents, type ParsedResult } from "chrono-node";

import type { Clock } from "@/shared/time/clock";

import {
  quickAddParseResultSchema,
  quickAddRequestSchema,
  type QuickAddParseResult,
  type QuickAddRequest,
  type TaskScheduleValue,
} from "./contracts";
import { addLocalDays } from "../domain/schedule/schedule-bounds";
import {
  localDateFromFields,
  localDateTimeFromFields,
  resolveLocalDateTime,
  timezoneOffsetMinutesAt,
  type LocalDateTimeResolution,
} from "../domain/schedule/zoned-date-time";

type QuickAddWarning = "dst_gap_shifted_later" | "dst_fold_earlier_instance";

export function createQuickAddApplication({ clock }: { clock: Clock }) {
  return {
    parseQuickAdd(rawInput: QuickAddRequest): QuickAddParseResult {
      const input = quickAddRequestSchema.parse(rawInput);
      const reference = clock.now();
      const timezoneOffset = timezoneOffsetMinutesAt(reference, input.timezone);
      const results = en.casual
        .parse(input.text, { instant: reference, timezone: timezoneOffset }, { forwardDate: true })
        .slice(0, 8);
      return quickAddParseResultSchema.parse({
        sourceText: input.text,
        suggestions: results.map((result) => mapSuggestion(result, input.timezone)),
      });
    },
  } as const;
}

function mapSuggestion(result: ParsedResult, timezone: string) {
  const hasTime = hasExplicitTime(result.start) || (result.end ? hasExplicitTime(result.end) : false);
  const warnings = new Set<QuickAddWarning>();
  const schedule = hasTime
    ? timedSuggestion(result, timezone, warnings)
    : allDaySuggestion(result.start, result.end);
  return {
    recognizedText: result.text,
    startIndex: result.index,
    endIndex: result.index + result.text.length,
    schedule,
    warnings: [...warnings],
  };
}

function allDaySuggestion(start: ParsedComponents, end: ParsedComponents | undefined): TaskScheduleValue {
  const startDate = localDate(start);
  const finalRecognizedDate = end ? localDate(end) : startDate;
  return { kind: "all_day", startDate, endDate: addLocalDays(finalRecognizedDate, 1) };
}

function timedSuggestion(
  result: ParsedResult,
  timezone: string,
  warnings: Set<QuickAddWarning>,
): TaskScheduleValue {
  const startAt = resolveSuggestedInstant(localDateTime(result.start), timezone, warnings);
  const endAt = result.end ? resolveSuggestedInstant(localDateTime(result.end), timezone, warnings) : startAt;
  return { kind: "timed", startAt, endAt, timezone };
}

function resolveSuggestedInstant(
  localDateTimeValue: string,
  timezone: string,
  warnings: Set<QuickAddWarning>,
): string {
  const resolution = resolveLocalDateTime(localDateTimeValue, timezone);
  if (resolution.kind === "exact") return resolution.instant;
  warnings.add(warningFor(resolution));
  return resolution.kind === "gap" ? resolution.laterInstant : resolution.earlierInstant;
}

function warningFor(resolution: Exclude<LocalDateTimeResolution, { kind: "exact" }>): QuickAddWarning {
  return resolution.kind === "gap" ? "dst_gap_shifted_later" : "dst_fold_earlier_instance";
}

function localDate(components: ParsedComponents): string {
  return localDateFromFields({
    year: requiredComponent(components, "year"),
    month: requiredComponent(components, "month"),
    day: requiredComponent(components, "day"),
  });
}

function localDateTime(components: ParsedComponents): string {
  return localDateTimeFromFields({
    year: requiredComponent(components, "year"),
    month: requiredComponent(components, "month"),
    day: requiredComponent(components, "day"),
    hour: requiredComponent(components, "hour"),
    minute: requiredComponent(components, "minute"),
    second: requiredComponent(components, "second"),
    millisecond: requiredComponent(components, "millisecond"),
  });
}

function requiredComponent(
  components: ParsedComponents,
  name: Parameters<ParsedComponents["get"]>[0],
): number {
  const value = components.get(name);
  if (value === null) throw new Error(`Chrono omitted the required ${name} component.`);
  return value;
}

function hasExplicitTime(components: ParsedComponents): boolean {
  return ["hour", "minute", "second", "meridiem"].some((name) =>
    components.isCertain(name as Parameters<ParsedComponents["isCertain"]>[0]),
  );
}
