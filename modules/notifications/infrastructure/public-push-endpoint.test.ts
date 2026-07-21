import type { LookupAddress, LookupOptions } from "node:dns";
import type { Agent } from "node:https";

import { describe, expect, it, vi } from "vitest";

import { createPublicPushEgressGuard, UnsafePushEndpointError } from "./public-push-endpoint";

describe("public push endpoint egress guard", () => {
  it.each([
    "https://localhost/push",
    "https://service.localhost/push",
    "https://0.0.0.0/push",
    "https://127.0.0.1/push",
    "https://10.1.2.3/push",
    "https://100.64.0.1/push",
    "https://169.254.169.254/push",
    "https://172.31.1.2/push",
    "https://192.168.1.2/push",
    "https://198.51.100.4/push",
    "https://224.0.0.1/push",
    "https://[::1]/push",
    "https://[fe80::1]/push",
    "https://[fc00::1]/push",
    "https://[2001:db8::1]/push",
    "https://[2002:c0a8:1::]/push",
    "https://[3fff::1]/push",
    "https://[::ffff:127.0.0.1]/push",
    "https://[::ffff:169.254.169.254]/push",
  ])("rejects a local, private, link-local, or reserved literal: %s", async (endpoint) => {
    const resolver = vi.fn(async () => [{ address: "93.184.216.34", family: 4 }] as const);
    await expect(createPublicPushEgressGuard(resolver).assertEndpoint(endpoint)).rejects.toBeInstanceOf(
      UnsafePushEndpointError,
    );
    expect(resolver).not.toHaveBeenCalled();
  });

  it("validates every DNS result rather than selecting only a public first address", async () => {
    const guard = createPublicPushEgressGuard(async () => [
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
      { address: "10.20.30.40", family: 4 },
    ]);
    await expect(guard.assertEndpoint("https://push.example.test/secret")).rejects.toBeInstanceOf(
      UnsafePushEndpointError,
    );
  });

  it("accepts arbitrary public IPv4 and IPv6 push-service addresses", async () => {
    const guard = createPublicPushEgressGuard(async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
    ]);
    await expect(guard.assertEndpoint("https://push.example.test/secret")).resolves.toBeUndefined();
  });

  it("revalidates DNS inside the HTTPS agent to block rebinding after preflight", async () => {
    let resolution = 0;
    const guard = createPublicPushEgressGuard(async () => {
      resolution += 1;
      return resolution === 1
        ? [{ address: "93.184.216.34", family: 4 }]
        : [{ address: "127.0.0.1", family: 4 }];
    });
    await guard.assertEndpoint("https://push.example.test/secret");
    await expect(agentLookup(guard.agent, "push.example.test")).rejects.toMatchObject({
      code: "UNSAFE_PUSH_ENDPOINT",
    });
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
