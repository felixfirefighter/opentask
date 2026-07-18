import { z } from "zod";

const supportedTimeZones = new Set(Intl.supportedValuesOf("timeZone"));

export const ianaTimeZoneSchema = z
  .string()
  .min(1)
  .max(128)
  .refine(
    (value) => value === "UTC" || supportedTimeZones.has(value),
    "Choose a canonical IANA timezone such as Asia/Singapore.",
  );
