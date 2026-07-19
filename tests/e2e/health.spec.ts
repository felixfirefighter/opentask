import { expect, test } from "@playwright/test";

test("liveness and database readiness are safe and healthy", async ({ request }) => {
  const live = await request.get("/api/health/live");
  expect(live.status()).toBe(200);
  await expect(live.json()).resolves.toEqual({ status: "ok" });
  expectSecurityHeaders(live.headers());

  const ready = await request.get("/api/health/ready");
  expect(ready.status()).toBe(200);
  await expect(ready.json()).resolves.toEqual({ status: "ready" });
  expectSecurityHeaders(ready.headers());
});

function expectSecurityHeaders(headers: Record<string, string>) {
  expect(headers["content-security-policy"]).toContain("default-src 'self'");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
  expect(headers["permissions-policy"]).toBe("camera=(), microphone=(), geolocation=(), browsing-topics=()");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["strict-transport-security"]).toBe("max-age=31536000");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
}
