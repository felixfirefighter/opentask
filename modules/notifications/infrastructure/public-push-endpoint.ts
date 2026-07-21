import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from "node:dns";
import { Agent } from "node:https";
import { isIP } from "node:net";

export type PushAddressResolver = (hostname: string) => Promise<readonly LookupAddress[]>;

export class UnsafePushEndpointError extends Error {
  readonly code = "UNSAFE_PUSH_ENDPOINT";

  constructor() {
    super("The push endpoint is not eligible for outbound delivery.");
    this.name = "UnsafePushEndpointError";
  }
}

export function createPublicPushEgressGuard(
  resolver: PushAddressResolver = resolveAllAddresses,
  deadlineSignal?: AbortSignal,
): Readonly<{
  agent: Agent;
  assertEndpoint(endpoint: string): Promise<void>;
}> {
  const resolveSafeAddresses = async (hostname: string): Promise<readonly LookupAddress[]> => {
    throwIfAborted(deadlineSignal);
    const normalizedHostname = normalizeHostname(hostname);
    if (isLocalHostname(normalizedHostname)) throw new UnsafePushEndpointError();

    const literalFamily = isIP(normalizedHostname);
    const addresses = literalFamily
      ? [{ address: normalizedHostname, family: literalFamily }]
      : await resolveBeforeAbort(resolver(normalizedHostname), deadlineSignal);
    throwIfAborted(deadlineSignal);
    if (addresses.length === 0 || addresses.some((address) => !isPublicAddress(address))) {
      throw new UnsafePushEndpointError();
    }
    return addresses;
  };

  const agent = new Agent({
    lookup(hostname, options, callback) {
      void resolveSafeAddresses(hostname).then(
        (addresses) => completeLookup(addresses, options, callback),
        (error: unknown) => callback(asLookupError(error), "", 0),
      );
    },
  });

  return {
    agent,
    async assertEndpoint(endpoint) {
      const url = new URL(endpoint);
      await resolveSafeAddresses(url.hostname);
    },
  };
}

function resolveBeforeAbort<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return operation;
  try {
    signal.throwIfAborted();
  } catch (error) {
    return Promise.reject(error);
  }

  return new Promise((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener("abort", abort);
      reject(signal.reason);
    };
    signal.addEventListener("abort", abort, { once: true });
    void operation.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

function throwIfAborted(signal?: AbortSignal): void {
  signal?.throwIfAborted();
}

function resolveAllAddresses(hostname: string): Promise<readonly LookupAddress[]> {
  return new Promise((resolve, reject) => {
    dnsLookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
      if (error) reject(error);
      else resolve(addresses);
    });
  });
}

function completeLookup(
  addresses: readonly LookupAddress[],
  options: LookupOptions,
  callback: (error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void,
): void {
  const requestedFamily = normalizeFamily(options.family);
  const eligible =
    requestedFamily === 0 ? addresses : addresses.filter(({ family }) => family === requestedFamily);
  if (eligible.length === 0) {
    callback(asLookupError(new Error("No eligible push address was resolved.")), "", 0);
    return;
  }
  if (options.all) callback(null, [...eligible]);
  else callback(null, eligible[0]!.address, eligible[0]!.family);
}

function normalizeFamily(family: LookupOptions["family"]): number {
  if (family === 4 || family === "IPv4") return 4;
  if (family === 6 || family === "IPv6") return 6;
  return 0;
}

function asLookupError(error: unknown): NodeJS.ErrnoException {
  const safe = new Error("Push endpoint address validation failed.") as NodeJS.ErrnoException;
  safe.code = error instanceof UnsafePushEndpointError ? error.code : "EAI_FAIL";
  return safe;
}

function normalizeHostname(hostname: string): string {
  const normalized = hostname
    .toLowerCase()
    .replace(/^\[|\]$/gu, "")
    .replace(/\.$/u, "");
  if (!normalized || normalized.includes("%")) throw new UnsafePushEndpointError();
  return normalized;
}

function isLocalHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname.endsWith(".localhost");
}

function isPublicAddress({ address, family }: LookupAddress): boolean {
  if (family === 4 && isIP(address) === 4) return isPublicIpv4(address);
  if (family === 6 && isIP(address) === 6) return isPublicIpv6(address);
  return false;
}

function isPublicIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false;
  }
  const value = (((octets[0]! * 256 + octets[1]!) * 256 + octets[2]!) * 256 + octets[3]!) >>> 0;
  return !NON_PUBLIC_IPV4_RANGES.some(([base, prefix]) => isIpv4InCidr(value, base, prefix));
}

const NON_PUBLIC_IPV4_RANGES: readonly (readonly [number, number])[] = [
  [0x00000000, 8],
  [0x0a000000, 8],
  [0x64400000, 10],
  [0x7f000000, 8],
  [0xa9fe0000, 16],
  [0xac100000, 12],
  [0xc0000000, 24],
  [0xc0000200, 24],
  [0xc0586300, 24],
  [0xc0a80000, 16],
  [0xc6120000, 15],
  [0xc6336400, 24],
  [0xcb007100, 24],
  [0xe0000000, 4],
  [0xf0000000, 4],
];

function isIpv4InCidr(value: number, base: number, prefix: number): boolean {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) >>> 0 === (base & mask) >>> 0;
}

function isPublicIpv6(address: string): boolean {
  const bytes = parseIpv6(address);
  if (!bytes) return false;
  if (bytes.slice(0, 10).every((byte) => byte === 0) && bytes[10] === 0xff && bytes[11] === 0xff) {
    return isPublicIpv4(bytes.slice(12).join("."));
  }
  const globalUnicast = (bytes[0]! & 0xe0) === 0x20;
  const protocolAssignments = bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2]! <= 0x01;
  const sixToFour = bytes[0] === 0x20 && bytes[1] === 0x02;
  const documentation = bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8;
  const documentationV2 = bytes[0] === 0x3f && (bytes[1]! & 0xf0) === 0xf0;
  return globalUnicast && !protocolAssignments && !sixToFour && !documentation && !documentationV2;
}

function parseIpv6(address: string): number[] | null {
  let source = address.toLowerCase();
  if (source.includes("%")) return null;
  if (source.includes(".")) {
    const separator = source.lastIndexOf(":");
    if (separator < 0) return null;
    const ipv4 = source
      .slice(separator + 1)
      .split(".")
      .map(Number);
    if (ipv4.length !== 4 || ipv4.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
      return null;
    }
    source = `${source.slice(0, separator)}:${((ipv4[0]! << 8) | ipv4[1]!).toString(16)}:${(
      (ipv4[2]! << 8) |
      ipv4[3]!
    ).toString(16)}`;
  }
  const halves = source.split("::");
  if (halves.length > 2) return null;
  const left = parseIpv6Groups(halves[0]!);
  const right = halves.length === 2 ? parseIpv6Groups(halves[1]!) : [];
  if (!left || !right) return null;
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;
  const groups = [...left, ...Array<number>(missing).fill(0), ...right];
  return groups.flatMap((group) => [group >>> 8, group & 0xff]);
}

function parseIpv6Groups(value: string): number[] | null {
  if (!value) return [];
  const groups = value.split(":");
  if (groups.some((group) => !/^[0-9a-f]{1,4}$/u.test(group))) return null;
  return groups.map((group) => Number.parseInt(group, 16));
}
