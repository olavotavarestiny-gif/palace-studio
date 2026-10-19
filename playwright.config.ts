import { defineConfig } from "@playwright/test";
import path from "node:path";
export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./test-results/menus",
  fullyParallel: false,
  workers: 1,
  timeout: 120000,
  use: {
    baseURL: "http://127.0.0.1:3100",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: process.env.E2E_PRODUCTION
      ? "npm start -- --port 3100"
      : "npm run dev -- --port 3100",
    env: {
      VERCEL: "1",
      DATA_DIR: path.join(process.cwd(), "data", "e2e", String(Date.now())),
      PUBLIC_URL: "http://127.0.0.1:3100",
      ...(process.env.E2E_PRODUCTION
        ? { ALLOW_HTTP_LOCAL: "1", SETUP_TOKEN: "palace-local-qa-setup-token" }
        : {}),
    },
    url: "http://127.0.0.1:3100/setup",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
