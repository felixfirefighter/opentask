import { randomUUID } from "node:crypto";

export function createEntityId(): string {
  return randomUUID();
}
