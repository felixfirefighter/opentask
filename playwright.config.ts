import { defineConfig, devices } from "@playwright/test";

const plannerFixtureMode = process.env.PLAYWRIGHT_PLANNER_FIXTURE === "1";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3107",
    locale: "en-SG",
    timezoneId: "Asia/Singapore",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm exec next dev --webpack --port 3107",
    env: {
      BETTER_AUTH_SECRET: "opentask-playwright-only-auth-secret-000000000000000000",
      BETTER_AUTH_URL: "http://127.0.0.1:3107",
      OPENAI_API_KEY: plannerFixtureMode ? "opentask-playwright-fixture-key" : "",
    },
    url: "http://127.0.0.1:3107",
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "tablet-chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1024, height: 768 } },
    },
    {
      name: "touch-tablet-chromium",
      use: { ...devices["Desktop Chrome"], hasTouch: true, viewport: { width: 1024, height: 768 } },
    },
    {
      name: "mobile-chromium",
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium",
        deviceScaleFactor: 1,
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "boundary-768-chromium",
      testMatch: /design-contract\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } },
    },
    {
      name: "boundary-320-chromium",
      testMatch: /design-contract\.spec\.ts/,
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium",
        deviceScaleFactor: 1,
        viewport: { width: 320, height: 568 },
      },
    },
  ],
});
