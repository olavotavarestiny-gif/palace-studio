import { defineConfig } from "@playwright/test";
import path from "node:path";
const website = path.resolve(process.cwd(), "../palacelounge-site");
const secret = "palace-crm-e2e-only-not-a-real-secret-2026";
export default defineConfig({
  testDir: "./tests/integration",
  outputDir: "./test-results/crm",
  fullyParallel: false,
  workers: 1,
  timeout: 120000,
  use: {
    baseURL: "http://127.0.0.1:3200",
    headless: true,
    reducedMotion: "reduce",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "npm start -- --port 3200",
      url: "http://127.0.0.1:3200/setup",
      reuseExistingServer: false,
      timeout: 120000,
      env: {
        DATA_DIR: path.join(
          process.cwd(),
          "data",
          "crm-e2e",
          String(Date.now()),
        ),
        DATABASE_URL: "",
        ALLOW_EMBEDDED_DB: "1",
        ALLOW_HTTP_LOCAL: "1",
        PUBLIC_URL: "http://127.0.0.1:3200",
        PALACE_RESERVATION_SECRET: secret,
        SETUP_TOKEN: "palace-crm-qa-setup",
      },
    },
    {
      command: `npm --prefix '${website.replace(/'/g, "'\\''")}' start -- --hostname 127.0.0.1 --port 3201`,
      url: "http://127.0.0.1:3201",
      reuseExistingServer: false,
      timeout: 120000,
      env: {
        PALACE_STUDIO_URL: "http://127.0.0.1:3200",
        PALACE_RESERVATION_SECRET: secret,
        PALACE_MENU_FEED_URL: "http://127.0.0.1:3200/api/published-menu",
        NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3201",
        ALLOW_HTTP_LOCAL: "1",
        PALACE_TRUST_PROXY: "0",
      },
    },
  ],
});
