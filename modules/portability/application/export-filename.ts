import { portableInstantSchema } from "./export-contract-primitives";

export function buildUserExportFilename(exportedAt: string): string {
  const instant = portableInstantSchema.parse(exportedAt);
  return `omplish-export-${new Date(instant).toISOString().slice(0, 10)}.json`;
}
