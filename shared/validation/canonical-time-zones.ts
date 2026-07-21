import { generatedTimeZones } from "./canonical-time-zones.generated";

/**
 * Canonical timezone spellings accepted by both application and persistence validation.
 * Regenerate the adjacent artifact only when the pinned Node/ICU timezone data changes.
 */
export const CANONICAL_IANA_TIME_ZONES: readonly string[] = Object.freeze([...generatedTimeZones.timeZones]);

const canonicalTimeZoneSet: ReadonlySet<string> = new Set(CANONICAL_IANA_TIME_ZONES);

export function isCanonicalIanaTimeZone(value: string): boolean {
  return canonicalTimeZoneSet.has(value);
}
