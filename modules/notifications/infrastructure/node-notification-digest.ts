import { createHash } from "node:crypto";

export type NodeNotificationDigest = Readonly<{
  sha256Bytes(value: string): Uint8Array;
  sha256Hex(value: string): string;
}>;

export function createNodeNotificationDigest(): NodeNotificationDigest {
  return {
    sha256Bytes(value) {
      return createHash("sha256").update(value, "utf8").digest();
    },
    sha256Hex(value) {
      return createHash("sha256").update(value, "utf8").digest("hex");
    },
  };
}
