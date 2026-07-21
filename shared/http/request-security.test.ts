import { describe, expect, it } from "vitest";

import { assertTrustedJsonMutation, readBoundedJson } from "./request-security";

const origin = "https://tasks.example.test";
const policy = { trustedOrigins: [origin] } as const;

describe("trusted JSON mutation boundary", () => {
  it("accepts a bounded same-origin JSON request", async () => {
    const request = mutationRequest("{}", {
      origin,
      "sec-fetch-site": "same-origin",
    });

    expect(() => assertTrustedJsonMutation(request, policy)).not.toThrow();
    await expect(readBoundedJson(request, 32)).resolves.toEqual({});

    const patch = mutationRequest("{}", { origin }, "PATCH");
    expect(() => assertTrustedJsonMutation(patch, policy, "PATCH")).not.toThrow();
    expect(() => assertTrustedJsonMutation(patch, policy)).toThrow(
      expect.objectContaining({ code: "VALIDATION_FAILED" }),
    );

    const remove = mutationRequest("{}", { origin }, "DELETE");
    expect(() => assertTrustedJsonMutation(remove, policy, "DELETE")).not.toThrow();
  });

  it("rejects missing, untrusted, and cross-site origins", () => {
    expect(() => assertTrustedJsonMutation(mutationRequest("{}"), policy)).toThrow(
      expect.objectContaining({ code: "FORBIDDEN" }),
    );
    expect(() =>
      assertTrustedJsonMutation(mutationRequest("{}", { origin: "https://attacker.example" }), policy),
    ).toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
    expect(() =>
      assertTrustedJsonMutation(mutationRequest("{}", { origin, "sec-fetch-site": "cross-site" }), policy),
    ).toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
  });

  it("rejects non-JSON and oversized request bodies", async () => {
    const form = new Request(`${origin}/api/v1/demo`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", origin },
      body: "demo=true",
    });
    expect(() => assertTrustedJsonMutation(form, policy)).toThrow(
      expect.objectContaining({ code: "VALIDATION_FAILED" }),
    );
    await expect(readBoundedJson(mutationRequest('{"long":true}', { origin }), 4)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    await expect(readBoundedJson(mutationRequest("{", { origin }), 32)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });

  it("accepts only the explicitly listed loopback scheme and port", () => {
    const loopbackPolicy = {
      trustedOrigins: ["http://localhost:3000", "http://127.0.0.1:3000"],
    } as const;

    expect(() =>
      assertTrustedJsonMutation(
        mutationRequest("{}", {
          origin: "http://127.0.0.1:3000",
          "sec-fetch-site": "same-origin",
        }),
        loopbackPolicy,
      ),
    ).not.toThrow();

    for (const untrustedOrigin of [
      "http://127.0.0.1:3001",
      "https://127.0.0.1:3000",
      "http://localhost.example:3000",
      "http://localhost:3000/not-an-origin",
    ]) {
      expect(() =>
        assertTrustedJsonMutation(
          mutationRequest("{}", { origin: untrustedOrigin, "sec-fetch-site": "same-origin" }),
          loopbackPolicy,
        ),
      ).toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
    }
  });

  it.each([
    '{"expectedVersion":1,"__proto__":{"polluted":true}}',
    '{"expectedVersion":1,"patch":{"title":"Safe","__proto__":{"polluted":true}}}',
  ])("rejects unsafe JSON property names at every depth", async (body) => {
    await expect(readBoundedJson(mutationRequest(body, { origin }), 256)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    expect(Object.prototype).not.toHaveProperty("polluted");
  });

  it.each([undefined, "1"])(
    "cancels an incrementally read body at the limit when content-length is %s",
    async (contentLength) => {
      let pulls = 0;
      let cancelled = false;
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          pulls += 1;
          if (pulls > 10) controller.close();
          else controller.enqueue(new Uint8Array(1024));
        },
        cancel() {
          cancelled = true;
        },
      });
      const headers: Record<string, string> = { "content-type": "application/json", origin };
      if (contentLength) headers["content-length"] = contentLength;
      const request = new Request(`${origin}/api/v1/demo`, {
        method: "POST",
        headers,
        body,
        duplex: "half",
      } as RequestInit & { duplex: "half" });

      await expect(readBoundedJson(request, 64)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
      await Promise.resolve();
      expect(cancelled).toBe(true);
      expect(pulls).toBeLessThan(11);
    },
  );
});

function mutationRequest(
  body: string,
  headers: Record<string, string> = {},
  method: "DELETE" | "PATCH" | "POST" = "POST",
) {
  return new Request(`${origin}/api/v1/demo`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}
