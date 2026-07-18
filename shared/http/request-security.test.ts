import { describe, expect, it } from "vitest";

import { assertTrustedJsonMutation, readBoundedJson } from "./request-security";

const origin = "https://tasks.example.test";

describe("trusted JSON mutation boundary", () => {
  it("accepts a bounded same-origin JSON request", async () => {
    const request = mutationRequest("{}", {
      origin,
      "sec-fetch-site": "same-origin",
    });

    expect(() => assertTrustedJsonMutation(request, origin)).not.toThrow();
    await expect(readBoundedJson(request, 32)).resolves.toEqual({});

    const patch = mutationRequest("{}", { origin }, "PATCH");
    expect(() => assertTrustedJsonMutation(patch, origin, "PATCH")).not.toThrow();
    expect(() => assertTrustedJsonMutation(patch, origin)).toThrow(
      expect.objectContaining({ code: "VALIDATION_FAILED" }),
    );
  });

  it("rejects missing, untrusted, and cross-site origins", () => {
    expect(() => assertTrustedJsonMutation(mutationRequest("{}"), origin)).toThrow(
      expect.objectContaining({ code: "FORBIDDEN" }),
    );
    expect(() =>
      assertTrustedJsonMutation(mutationRequest("{}", { origin: "https://attacker.example" }), origin),
    ).toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
    expect(() =>
      assertTrustedJsonMutation(mutationRequest("{}", { origin, "sec-fetch-site": "cross-site" }), origin),
    ).toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
  });

  it("rejects non-JSON and oversized request bodies", async () => {
    const form = new Request(`${origin}/api/v1/demo`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", origin },
      body: "demo=true",
    });
    expect(() => assertTrustedJsonMutation(form, origin)).toThrow(
      expect.objectContaining({ code: "VALIDATION_FAILED" }),
    );
    await expect(readBoundedJson(mutationRequest('{"long":true}', { origin }), 4)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    await expect(readBoundedJson(mutationRequest("{", { origin }), 32)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
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
  method: "PATCH" | "POST" = "POST",
) {
  return new Request(`${origin}/api/v1/demo`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}
