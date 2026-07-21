import { z } from "zod";

import { isCanonicalIanaTimeZone } from "./canonical-time-zones";

export const ianaTimeZoneSchema = z
  .string()
  .min(1)
  .max(128)
  .refine(isCanonicalIanaTimeZone, "Choose a canonical IANA timezone such as Asia/Singapore.");
