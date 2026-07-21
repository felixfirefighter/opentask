import { Temporal } from "temporal-polyfill";

import {
  assertRecurrenceRule,
  type IsoWeekday,
  type RecurrenceEnd,
  type RecurrencePreset,
  type RecurrenceRule,
} from "./recurrence-policy";
import {
  assertRecurrenceEligibility,
  recurrenceAnchorLocalDate,
  type RecurrenceScheduleAnchor,
} from "./recurrence-time-policy";

export const CANONICAL_RRULE_MIN_LENGTH = 1;
export const CANONICAL_RRULE_MAX_LENGTH = 512;

const weekdayTokens = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
const allowedProperties = new Set([
  "FREQ",
  "INTERVAL",
  "WKST",
  "BYDAY",
  "BYMONTH",
  "BYMONTHDAY",
  "COUNT",
  "UNTIL",
]);

export function serializeRecurrenceRule(rule: RecurrenceRule, anchor: RecurrenceScheduleAnchor): string {
  assertRecurrenceEligibility(rule, anchor);
  const anchorDate = Temporal.PlainDate.from(recurrenceAnchorLocalDate(anchor));
  const properties = [`FREQ=${frequencyFor(rule.preset)}`, `INTERVAL=${rule.preset.interval}`];

  if (rule.preset.kind === "weekdays") {
    properties.push("WKST=MO", "BYDAY=MO,TU,WE,TH,FR");
  } else if (rule.preset.kind === "weekly") {
    properties.push(
      "WKST=MO",
      `BYDAY=${rule.preset.weekdays.map((weekday) => weekdayTokens[weekday - 1]).join(",")}`,
    );
  } else if (rule.preset.kind === "monthly") {
    properties.push(`BYMONTHDAY=${anchorDate.day}`);
  } else if (rule.preset.kind === "yearly") {
    properties.push(`BYMONTH=${anchorDate.month}`, `BYMONTHDAY=${anchorDate.day}`);
  }

  if (rule.end.kind === "count") properties.push(`COUNT=${rule.end.count}`);
  if (rule.end.kind === "until") properties.push(`UNTIL=${rule.end.untilDate.replaceAll("-", "")}`);

  const serialized = properties.join(";");
  assertCanonicalEnvelope(serialized);
  return serialized;
}

export function parseRecurrenceRule(serialized: string, anchor: RecurrenceScheduleAnchor): RecurrenceRule {
  assertCanonicalEnvelope(serialized);
  const properties = parseProperties(serialized);
  const interval = parseIntegerProperty(properties, "INTERVAL");
  const frequency = requireProperty(properties, "FREQ");
  const anchorDate = Temporal.PlainDate.from(recurrenceAnchorLocalDate(anchor));

  let preset: RecurrencePreset;
  if (frequency === "DAILY") {
    assertOnlyProperties(properties, ["FREQ", "INTERVAL", "COUNT", "UNTIL"]);
    preset = { kind: "daily", interval };
  } else if (frequency === "WEEKLY") {
    assertOnlyProperties(properties, ["FREQ", "INTERVAL", "WKST", "BYDAY", "COUNT", "UNTIL"]);
    if (requireProperty(properties, "WKST") !== "MO") {
      throw new RangeError("Canonical weekly recurrence must start its week on Monday.");
    }
    const weekdays = parseWeekdays(requireProperty(properties, "BYDAY"));
    preset =
      weekdays.every((weekday, index) => weekday === index + 1) && weekdays.length === 5
        ? { kind: "weekdays", interval }
        : { kind: "weekly", interval, weekdays };
  } else if (frequency === "MONTHLY") {
    assertOnlyProperties(properties, ["FREQ", "INTERVAL", "BYMONTHDAY", "COUNT", "UNTIL"]);
    if (parseIntegerProperty(properties, "BYMONTHDAY") !== anchorDate.day) {
      throw new RangeError("Monthly recurrence must use the schedule anchor day.");
    }
    preset = { kind: "monthly", interval };
  } else if (frequency === "YEARLY") {
    assertOnlyProperties(properties, ["FREQ", "INTERVAL", "BYMONTH", "BYMONTHDAY", "COUNT", "UNTIL"]);
    if (
      parseIntegerProperty(properties, "BYMONTH") !== anchorDate.month ||
      parseIntegerProperty(properties, "BYMONTHDAY") !== anchorDate.day
    ) {
      throw new RangeError("Yearly recurrence must use the schedule anchor month and day.");
    }
    preset = { kind: "yearly", interval };
  } else {
    throw new RangeError("The recurrence frequency is unsupported.");
  }

  const end = parseEnd(properties);
  const rule = { preset, end } satisfies RecurrenceRule;
  assertRecurrenceRule(rule);
  assertRecurrenceEligibility(rule, anchor);
  if (serializeRecurrenceRule(rule, anchor) !== serialized) {
    throw new RangeError("The recurrence rule is not in canonical form.");
  }
  return rule;
}

function frequencyFor(preset: RecurrencePreset): "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY" {
  if (preset.kind === "daily") return "DAILY";
  if (preset.kind === "weekdays" || preset.kind === "weekly") return "WEEKLY";
  if (preset.kind === "monthly") return "MONTHLY";
  return "YEARLY";
}

function parseEnd(properties: ReadonlyMap<string, string>): RecurrenceEnd {
  const count = properties.get("COUNT");
  const until = properties.get("UNTIL");
  if (count !== undefined && until !== undefined) {
    throw new RangeError("A recurrence cannot have both count and until ending modes.");
  }
  if (count !== undefined) return { kind: "count", count: parseDecimalInteger(count, "COUNT") };
  if (until === undefined) return { kind: "never" };
  if (!/^\d{8}$/.test(until)) throw new RangeError("UNTIL must use YYYYMMDD format.");
  return { kind: "until", untilDate: `${until.slice(0, 4)}-${until.slice(4, 6)}-${until.slice(6)}` };
}

function parseProperties(serialized: string): ReadonlyMap<string, string> {
  const properties = new Map<string, string>();
  for (const field of serialized.split(";")) {
    const separator = field.indexOf("=");
    if (separator <= 0 || separator === field.length - 1 || field.indexOf("=", separator + 1) !== -1) {
      throw new RangeError("The recurrence rule contains a malformed property.");
    }
    const name = field.slice(0, separator);
    const value = field.slice(separator + 1);
    if (!allowedProperties.has(name)) throw new RangeError(`Unsupported recurrence property: ${name}.`);
    if (properties.has(name)) throw new RangeError(`Duplicate recurrence property: ${name}.`);
    properties.set(name, value);
  }
  return properties;
}

function parseWeekdays(value: string): readonly IsoWeekday[] {
  const tokens = value.split(",");
  const weekdays = tokens.map((token) => {
    const index = weekdayTokens.indexOf(token as (typeof weekdayTokens)[number]);
    if (index < 0) throw new RangeError("BYDAY contains an unsupported weekday.");
    return (index + 1) as IsoWeekday;
  });
  for (let index = 1; index < weekdays.length; index += 1) {
    if (weekdays[index]! <= weekdays[index - 1]!) {
      throw new RangeError("BYDAY weekdays must be unique and in ISO order.");
    }
  }
  if (weekdays.length === 0) throw new RangeError("BYDAY must contain at least one weekday.");
  return weekdays;
}

function parseIntegerProperty(properties: ReadonlyMap<string, string>, name: string): number {
  return parseDecimalInteger(requireProperty(properties, name), name);
}

function parseDecimalInteger(value: string, name: string): number {
  if (!/^[1-9]\d*$/.test(value)) throw new RangeError(`${name} must be a positive decimal integer.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new RangeError(`${name} is too large.`);
  return parsed;
}

function requireProperty(properties: ReadonlyMap<string, string>, name: string): string {
  const value = properties.get(name);
  if (value === undefined) throw new RangeError(`The recurrence rule is missing ${name}.`);
  return value;
}

function assertOnlyProperties(properties: ReadonlyMap<string, string>, names: readonly string[]): void {
  const expected = new Set(names);
  for (const name of properties.keys()) {
    if (!expected.has(name)) throw new RangeError(`${name} is not valid for this recurrence frequency.`);
  }
}

function assertCanonicalEnvelope(serialized: string): void {
  if (serialized.length < CANONICAL_RRULE_MIN_LENGTH || serialized.length > CANONICAL_RRULE_MAX_LENGTH) {
    throw new RangeError("The canonical recurrence rule must contain 1 to 512 characters.");
  }
  if (!/^[A-Z0-9,;=]+$/.test(serialized)) {
    throw new RangeError("The canonical recurrence rule must be an uppercase ASCII property list.");
  }
  if (serialized.startsWith("RRULE:") || serialized.includes("DTSTART")) {
    throw new RangeError("The canonical recurrence rule cannot contain a prefix or DTSTART.");
  }
}
