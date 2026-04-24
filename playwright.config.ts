import { defineConfig, devices } from "@playwright/test";

/**
 * Two dev servers run in parallel:
 *   - port 3000: default, `NEXT_PUBLIC_PHASE_2_LIVE` left at whatever
 *     .env.local says (typically false). Used by every pre/during-unlock
 *     spec.
 *   - port 3001: same codebase, but started with
 *     `NEXT_PUBLIC_PHASE_2_LIVE=true`. Specs that need the post-unlock
 *     landing wiring override `baseURL` to hit this one.
 *
 * Next.js inlines `NEXT_PUBLIC_*` at dev-start time, so the only way to
 * test the post-unlock branch is a dedicated process with the env pre-set.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // 1 retry locally too — with dual dev servers, first-compile cold
  // starts for heavy pages (/launch, /markets) can exceed the 30s
  // per-test timeout once per shard. CI gets 2 retries.
  retries: process.env.CI ? 2 : 1,
  // Two Next dev servers share this box's CPU (see webServer below).
  // Cap workers so a 4-worker default doesn't collide with next-dev's own
  // compile workers and push simple `fill`/`setInputFiles` past the 30s
  // per-test timeout under load.
  workers: process.env.CI ? 1 : 2,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "pnpm dev",
      url: "http://localhost:3000",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command:
        "NEXT_PUBLIC_PHASE_2_LIVE=true pnpm dev --port 3001",
      url: "http://localhost:3001",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
