import { expect, test } from "@playwright/test";

test("liveness and database readiness are safe and healthy", async ({ request }) => {
  const live = await request.get("/api/health/live");
  expect(live.status()).toBe(200);
  await expect(live.json()).resolves.toEqual({ status: "ok" });

  const ready = await request.get("/api/health/ready");
  expect(ready.status()).toBe(200);
  await expect(ready.json()).resolves.toEqual({ status: "ready" });
});
