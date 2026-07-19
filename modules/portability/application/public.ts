import { getDatabase } from "@/shared/db/client";

import { createPortabilityApplication, createPostgresExportSnapshot } from "./export-application";

let application: ReturnType<typeof createPortabilityApplication> | undefined;

export function getPortabilityApplication() {
  application ??= createPortabilityApplication({ snapshot: createPostgresExportSnapshot(getDatabase()) });
  return application;
}
