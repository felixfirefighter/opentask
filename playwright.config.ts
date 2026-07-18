import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3107",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm exec next dev --port 3107",
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
