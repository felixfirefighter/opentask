import type { LookupAddress, LookupOptions } from "node:dns";
import type { Agent } from "node:https";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createWebPushProvider } from "./web-push-provider";

const configuration = {
  subject: "mailto:operator@example.test",
  publicKey: Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 8)]).toString("base64url"),
  privateKey: Buffer.alloc(32, 7).toString("base64url"),
} as const;
const validInput = {
  endpoint: "https://push.example.test/opaque-secret-endpoint",
  p256dh: Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 2)]).toString("base64url"),
  auth: Buffer.alloc(16, 3).toString("base64url"),
  payload: {
    schemaVersion: 1 as const,
    taskId: "11111111-1111-4111-8111-111111111111",
    deliveryId: "22222222-2222-4222-8222-222222222222",
  },
  ttlSeconds: 300,
  timeoutMs: 10_000,
} as const;
const publicResolver = async () => [{ address: "93.184.216.34", family: 4 }] as const;
type ProviderSender = NonNullable<Parameters<typeof createWebPushProvider>[1]>;

afterEach(() => vi.useRealTimers());

describe("Web Push provider", () => {
  it("uses per-call VAPID, TTL, encoding, and the exact wall-clock timeout", async () => {
    const sender = vi.fn(async () => ({ statusCode: 201, body: "", headers: {} }));
    const provider = createWebPushProvider(configuration, sender, publicResolver);

    await expect(provider.send(validInput)).resolves.toEqual({ kind: "accepted" });
    expect(provider.configured).toBe(true);
    expect(provider.vapidPublicKey).toBe(configuration.publicKey);
    expect(sender).toHaveBeenCalledWith(
      { endpoint: validInput.endpoint, keys: { p256dh: validInput.p256dh, auth: validInput.auth } },
      JSON.stringify(validInput.payload),
      {
        vapidDetails: configuration,
        TTL: 300,
        timeout: 10_000,
        contentEncoding: "aes128gcm",
        agent: expect.anything(),
      },
    );
  });

  it.each([
    [408, { kind: "retryable", code: "provider_http_408" }],
    [429, { kind: "retryable", code: "provider_http_429" }],
    [503, { kind: "retryable", code: "provider_http_503" }],
    [404, { kind: "subscription_gone" }],
    [410, { kind: "subscription_gone" }],
    [400, { kind: "permanent", code: "provider_http_400" }],
  ] as const)("sanitizes an explicit HTTP %s outcome", async (statusCode, expected) => {
    const sender = vi.fn(async () => {
      throw {
        statusCode,
        endpoint: validInput.endpoint,
        headers: { authorization: "raw secret" },
        body: "raw provider body",
      };
    });
    const result = await createWebPushProvider(configuration, sender, publicResolver).send(validInput);
    expect(result).toEqual(expected);
    expect(JSON.stringify(result)).not.toContain("opaque-secret-endpoint");
    expect(JSON.stringify(result)).not.toContain("raw provider body");
  });

  it("classifies a statusless transport result as outcome unknown without leaking it", async () => {
    const sender = vi.fn(async () => {
      throw new Error(`transport failed for ${validInput.endpoint}`);
    });
    const result = await createWebPushProvider(configuration, sender, publicResolver).send(validInput);
    expect(result).toEqual({ kind: "outcome_unknown" });
    expect(JSON.stringify(result)).not.toContain(validInput.endpoint);
  });

  it("returns at the exact wall-clock deadline even if the provider promise remains pending", async () => {
    vi.useFakeTimers();
    const sender = vi.fn(() => new Promise<never>(() => undefined));
    const result = createWebPushProvider(configuration, sender, publicResolver).send(validInput);
    await vi.advanceTimersByTimeAsync(9_999);
    let settled = false;
    void result.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toEqual({ kind: "outcome_unknown" });
  });

  it("starts the wall-clock deadline before a never-resolving DNS preflight", async () => {
    vi.useFakeTimers();
    const resolver = vi.fn(() => new Promise<never>(() => undefined));
    const sender = vi.fn(async () => ({ statusCode: 201, body: "", headers: {} }));
    const result = createWebPushProvider(configuration, sender, resolver).send(validInput);

    await vi.advanceTimersByTimeAsync(9_999);
    expect(sender).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    await expect(result).resolves.toEqual({ kind: "outcome_unknown" });
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(sender).not.toHaveBeenCalled();
  });

  it("never starts the provider sender when DNS preflight resolves after the deadline", async () => {
    vi.useFakeTimers();
    const resolver = vi.fn(
      () =>
        new Promise<readonly LookupAddress[]>((resolve) => {
          setTimeout(() => resolve([{ address: "93.184.216.34", family: 4 }]), 10_001);
        }),
    );
    const sender = vi.fn(async () => ({ statusCode: 201, body: "", headers: {} }));
    const result = createWebPushProvider(configuration, sender, resolver).send(validInput);

    await vi.advanceTimersByTimeAsync(10_000);
    await expect(result).resolves.toEqual({ kind: "outcome_unknown" });
    expect(sender).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(sender).not.toHaveBeenCalled();
  });

  it("cancels a guarded agent resolver that would finish after the shared deadline", async () => {
    vi.useFakeTimers();
    const resolver = vi
      .fn<() => Promise<readonly LookupAddress[]>>()
      .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve([{ address: "93.184.216.34", family: 4 }]), 10_001);
          }),
      );
    const sender = vi.fn<ProviderSender>(() => new Promise<never>(() => undefined));
    const result = createWebPushProvider(configuration, sender, resolver).send(validInput);

    await vi.advanceTimersByTimeAsync(0);
    expect(sender).toHaveBeenCalledTimes(1);
    const agent = sender.mock.calls[0]![2]!.agent as Agent;
    const guardedLookup = agentLookup(agent, "push.example.test");
    const guardedLookupExpectation = expect(guardedLookup).rejects.toMatchObject({ code: "EAI_FAIL" });

    await vi.advanceTimersByTimeAsync(10_000);
    await expect(result).resolves.toEqual({ kind: "outcome_unknown" });
    await guardedLookupExpectation;
    expect(resolver).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1);
    expect(resolver).toHaveBeenCalledTimes(2);
  });

  it("fails locally for malformed subscription material and never calls the provider", async () => {
    const sender = vi.fn(async () => ({ statusCode: 201, body: "", headers: {} }));
    await expect(
      createWebPushProvider(configuration, sender, publicResolver).send({
        ...validInput,
        auth: "not-base64url",
      }),
    ).resolves.toEqual({ kind: "permanent", code: "subscription_material_invalid" });
    expect(sender).not.toHaveBeenCalled();
  });

  it("rejects any extra push-payload content before it reaches the provider", async () => {
    const sender = vi.fn(async () => ({ statusCode: 201, body: "", headers: {} }));
    await expect(
      createWebPushProvider(configuration, sender, publicResolver).send({
        ...validInput,
        payload: { ...validInput.payload, title: "must never leave the server" } as never,
      }),
    ).resolves.toEqual({ kind: "permanent", code: "subscription_material_invalid" });
    expect(sender).not.toHaveBeenCalled();
  });

  it.each([
    "https://localhost/push",
    "https://127.0.0.1/push",
    "https://10.0.0.4/push",
    "https://169.254.169.254/latest/meta-data",
    "https://[::1]/push",
    "https://[::ffff:10.0.0.4]/push",
  ])(
    "blocks a non-public literal endpoint before an injected sender can bypass policy: %s",
    async (endpoint) => {
      const sender = vi.fn(async () => ({ statusCode: 201, body: "", headers: {} }));
      await expect(
        createWebPushProvider(configuration, sender, publicResolver).send({ ...validInput, endpoint }),
      ).resolves.toEqual({ kind: "permanent", code: "subscription_material_invalid" });
      expect(sender).not.toHaveBeenCalled();
    },
  );

  it("blocks a hostname when any resolved address is non-public", async () => {
    const sender = vi.fn(async () => ({ statusCode: 201, body: "", headers: {} }));
    const resolver = async () =>
      [
        { address: "93.184.216.34", family: 4 },
        { address: "192.168.1.20", family: 4 },
      ] as const;
    await expect(createWebPushProvider(configuration, sender, resolver).send(validInput)).resolves.toEqual({
      kind: "permanent",
      code: "subscription_material_invalid",
    });
    expect(sender).not.toHaveBeenCalled();
  });

  it("keeps provider absence as an honest no-call degradation", async () => {
    const sender = vi.fn(async () => ({ statusCode: 201, body: "", headers: {} }));
    const provider = createWebPushProvider(null, sender);
    expect(provider.configured).toBe(false);
    expect(provider.vapidPublicKey).toBeNull();
    await expect(provider.send(validInput)).resolves.toEqual({
      kind: "permanent",
      code: "provider_unconfigured",
    });
    expect(sender).not.toHaveBeenCalled();
  });
});

function agentLookup(
  agent: Agent,
  hostname: string,
  options: LookupOptions = { all: false },
): Promise<string | LookupAddress[]> {
  const lookup = agent.options.lookup;
  if (!lookup) throw new Error("Expected a guarded lookup function.");
  return new Promise((resolve, reject) => {
    lookup(hostname, options, (error, address) => {
      if (error) reject(error);
      else resolve(address);
    });
  });
}
