import { entityIdSchema, idempotencyKeyHeaderSchema } from "./contracts";

export function parseTaskApiResourceId(value: unknown): string {
  return entityIdSchema.parse(value);
}

export function parseTaskApiCreateKey(value: unknown): string {
  return idempotencyKeyHeaderSchema.parse(value);
}
