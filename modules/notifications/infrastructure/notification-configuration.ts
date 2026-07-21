export type ReminderWorkerMode = "enabled" | "disabled" | "unconfigured";

export type VapidConfiguration = Readonly<{
  subject: string;
  publicKey: string;
  privateKey: string;
}>;

export type SubscriptionEncryptionConfiguration = Readonly<{
  activeKeyVersion: number;
  keys: ReadonlyMap<number, Buffer>;
}>;

export type NotificationConfiguration = Readonly<{
  workerMode: ReminderWorkerMode;
  vapid: VapidConfiguration | null;
  subscriptionEncryption: SubscriptionEncryptionConfiguration | null;
}>;

export class NotificationConfigurationError extends Error {
  readonly fields: readonly string[];

  constructor(fields: readonly string[]) {
    super(`Invalid notification environment: ${fields.join(", ")}`);
    this.name = "NotificationConfigurationError";
    this.fields = fields;
  }
}

let cachedConfiguration: NotificationConfiguration | undefined;

export function parseNotificationConfiguration(
  source: Readonly<Record<string, string | undefined>>,
): NotificationConfiguration {
  const fields = new Set<string>();
  const workerMode = parseWorkerMode(source.REMINDER_WORKER_MODE, fields);
  const vapid = parseVapidConfiguration(source, fields);
  const subscriptionEncryption = parseEncryptionConfiguration(source, fields);

  if (fields.size > 0) {
    throw new NotificationConfigurationError([...fields].sort());
  }

  return { workerMode, vapid, subscriptionEncryption };
}

export function getNotificationConfiguration(): NotificationConfiguration {
  cachedConfiguration ??= parseNotificationConfiguration(process.env);
  return cachedConfiguration;
}

function parseWorkerMode(value: string | undefined, fields: Set<string>): ReminderWorkerMode {
  const present = emptyToUndefined(value);
  if (present === undefined) return "unconfigured";
  if (present === "enabled" || present === "disabled") return present;
  fields.add("REMINDER_WORKER_MODE");
  return "unconfigured";
}

function parseVapidConfiguration(
  source: Readonly<Record<string, string | undefined>>,
  fields: Set<string>,
): VapidConfiguration | null {
  const subject = emptyToUndefined(source.WEB_PUSH_VAPID_SUBJECT);
  const publicKey = emptyToUndefined(source.WEB_PUSH_VAPID_PUBLIC_KEY);
  const privateKey = emptyToUndefined(source.WEB_PUSH_VAPID_PRIVATE_KEY);
  const presentCount = [subject, publicKey, privateKey].filter((value) => value !== undefined).length;

  if (presentCount === 0) return null;
  if (subject && !isValidVapidSubject(subject)) fields.add("WEB_PUSH_VAPID_SUBJECT");
  if (publicKey && (!isCanonicalBase64UrlKey(publicKey, 65) || decodeBase64Url(publicKey)?.[0] !== 4)) {
    fields.add("WEB_PUSH_VAPID_PUBLIC_KEY");
  }
  if (privateKey && !isCanonicalBase64UrlKey(privateKey, 32)) {
    fields.add("WEB_PUSH_VAPID_PRIVATE_KEY");
  }
  if (presentCount !== 3) {
    if (!subject) fields.add("WEB_PUSH_VAPID_SUBJECT");
    if (!publicKey) fields.add("WEB_PUSH_VAPID_PUBLIC_KEY");
    if (!privateKey) fields.add("WEB_PUSH_VAPID_PRIVATE_KEY");
    return null;
  }

  return { subject: subject!, publicKey: publicKey!, privateKey: privateKey! };
}

function parseEncryptionConfiguration(
  source: Readonly<Record<string, string | undefined>>,
  fields: Set<string>,
): SubscriptionEncryptionConfiguration | null {
  const activeText = emptyToUndefined(source.PUSH_SUBSCRIPTION_ACTIVE_KEY_VERSION);
  const keyringText = emptyToUndefined(source.PUSH_SUBSCRIPTION_ENCRYPTION_KEYS);

  if (activeText === undefined && keyringText === undefined) return null;
  if (activeText === undefined) fields.add("PUSH_SUBSCRIPTION_ACTIVE_KEY_VERSION");
  if (keyringText === undefined) fields.add("PUSH_SUBSCRIPTION_ENCRYPTION_KEYS");
  if (activeText === undefined || keyringText === undefined) return null;

  const activeKeyVersion = parseKeyVersion(activeText);
  if (activeKeyVersion === null) fields.add("PUSH_SUBSCRIPTION_ACTIVE_KEY_VERSION");

  const keys = new Map<number, Buffer>();
  let malformedKeyring = false;
  for (const entry of keyringText.split(",")) {
    const match = /^(0|[1-9][0-9]*):([A-Za-z0-9_-]{43})$/u.exec(entry);
    if (!match) {
      malformedKeyring = true;
      continue;
    }
    const version = parseKeyVersion(match[1]!);
    const key = decodeBase64Url(match[2]!);
    if (
      version === null ||
      !key ||
      key.length !== 32 ||
      key.toString("base64url") !== match[2] ||
      keys.has(version)
    ) {
      malformedKeyring = true;
      continue;
    }
    keys.set(version, key);
  }

  if (keys.size === 0 || malformedKeyring) fields.add("PUSH_SUBSCRIPTION_ENCRYPTION_KEYS");
  if (activeKeyVersion !== null && !keys.has(activeKeyVersion)) {
    fields.add("PUSH_SUBSCRIPTION_ACTIVE_KEY_VERSION");
  }

  if (activeKeyVersion === null) return null;
  return { activeKeyVersion, keys };
}

function isValidVapidSubject(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" ||
      (parsed.protocol === "mailto:" && parsed.pathname.length > 0 && !/\s/u.test(parsed.pathname))
    );
  } catch {
    return false;
  }
}

function isCanonicalBase64UrlKey(value: string, byteLength: number): boolean {
  const decoded = decodeBase64Url(value);
  return decoded?.length === byteLength && decoded.toString("base64url") === value;
}

function decodeBase64Url(value: string): Buffer | null {
  try {
    return Buffer.from(value, "base64url");
  } catch {
    return null;
  }
}

function parseKeyVersion(value: string): number | null {
  if (!/^(0|[1-9][0-9]*)$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 2_147_483_647 ? parsed : null;
}

function emptyToUndefined(value: string | undefined): string | undefined {
  return value === undefined || value === "" ? undefined : value;
}
