import { Temporal } from "temporal-polyfill";

export type LocalDateTimeResolution =
  | Readonly<{ kind: "exact"; instant: string }>
  | Readonly<{ kind: "gap"; earlierInstant: string; laterInstant: string }>
  | Readonly<{ kind: "fold"; earlierInstant: string; laterInstant: string }>;

export type LocalTimeDisambiguation = "reject" | "earlier" | "later";

export type LocalDateFields = Readonly<{ year: number; month: number; day: number }>;
export type LocalDateTimeFields = LocalDateFields &
  Readonly<{ hour: number; minute: number; second?: number; millisecond?: number }>;

export function localDateFromFields(fields: LocalDateFields): string {
  return Temporal.PlainDate.from(fields, { overflow: "reject" }).toString();
}

export function localDateTimeFromFields(fields: LocalDateTimeFields): string {
  return Temporal.PlainDateTime.from(fields, { overflow: "reject" }).toString();
}

export function resolveLocalDateTime(localDateTime: string, timezone: string): LocalDateTimeResolution {
  const requested = Temporal.PlainDateTime.from(localDateTime);
  const earlier = requested.toZonedDateTime(timezone, { disambiguation: "earlier" });
  const later = requested.toZonedDateTime(timezone, { disambiguation: "later" });
  const earlierMatches = earlier.toPlainDateTime().equals(requested);
  const laterMatches = later.toPlainDateTime().equals(requested);
  const earlierInstant = earlier.toInstant().toString();
  const laterInstant = later.toInstant().toString();

  if (!earlierMatches && !laterMatches) return { kind: "gap", earlierInstant, laterInstant };
  if (earlierInstant !== laterInstant) return { kind: "fold", earlierInstant, laterInstant };
  return { kind: "exact", instant: earlierInstant };
}

export function localDateTimeToInstant(
  localDateTime: string,
  timezone: string,
  disambiguation: LocalTimeDisambiguation = "reject",
): string {
  return Temporal.PlainDateTime.from(localDateTime)
    .toZonedDateTime(timezone, { disambiguation })
    .toInstant()
    .toString();
}

export function localDateStartToInstant(localDate: string, timezone: string): string {
  return Temporal.PlainDate.from(localDate).toZonedDateTime(timezone).toInstant().toString();
}

export function instantToLocalDate(instant: string, timezone: string): string {
  return Temporal.Instant.from(instant).toZonedDateTimeISO(timezone).toPlainDate().toString();
}

export function instantToLocalDateTime(instant: string, timezone: string): string {
  return Temporal.Instant.from(instant).toZonedDateTimeISO(timezone).toPlainDateTime().toString();
}

export function timezoneOffsetMinutesAt(instant: Date, timezone: string): number {
  const offsetNanoseconds = Temporal.Instant.fromEpochMilliseconds(instant.getTime()).toZonedDateTimeISO(
    timezone,
  ).offsetNanoseconds;
  return offsetNanoseconds / 60_000_000_000;
}
