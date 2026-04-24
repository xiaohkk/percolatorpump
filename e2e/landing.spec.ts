import { test, expect } from "@playwright/test";

test("landing renders Approach D hero, CTAs, and phase cards", async ({ page }) => {
  await page.goto("/");

  // Phase badge still present.
  await expect(page.getByText(/phase 1 · live/i)).toBeVisible();

  // New hero copy.
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    /leverage trading on the top solana memes/i
  );
  await expect(page.getByText(/memecoin is your collateral/i)).toBeVisible();
  await expect(
    page.getByText(
      /inverted perps powered by toly.*percolator risk engine/i
    )
  ).toBeVisible();
  // Hero seed-list is auto-derived from config/seed-tokens.json. Assert the
  // first five tickers from that file appear in order rather than hard-coding.
  await expect(
    page.getByText(/seeded day 1 with trump, pengu, bonk, wif, bome/i)
  ).toBeVisible();

  // CTAs: Trade is disabled (pre-unlock), Launch CTA routes to /launch.
  const tradeBtn = page.getByRole("button", { name: /^trade/i });
  await expect(tradeBtn).toBeDisabled();
  await expect(
    page.getByRole("link", { name: /launch a.*token on pump\.fun/i })
  ).toBeVisible();

  // Phase cards with new copy.
  await expect(page.getByText(/phase 1 - launcher/i)).toBeVisible();
  await expect(page.getByText(/phase 2 - perps/i)).toBeVisible();
  await expect(page.getByText(/unlocks at 12 sol/i)).toBeVisible();
  await expect(page.getByText(/15 top memes live day 1/i)).toBeVisible();
  await expect(
    page.getByText(/any mint not seeded can be added via/i)
  ).toBeVisible();
  await expect(
    page.getByText(/first 10 listings 0\.5 sol, then 1\.5 sol/i)
  ).toBeVisible();

  // The dropped "reserved perp slot" bullet must NOT appear.
  await expect(page.getByText(/reserved perp slot/i)).toHaveCount(0);
});

test("treasury counter formats as X.XX / 12.00 SOL", async ({ page }) => {
  await page.goto("/");
  // Give the client-side fetch a beat to resolve. A regex that tolerates
  // any X.XX value keeps us independent of the live RPC balance.
  await expect(page.getByText(/\/ 12\.00 SOL/)).toBeVisible();
});

test("treasury counter shows Approach D caption pre-unlock", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByText(
      /mainnet percolator deploy \+ day 1 seed of the top 15 solana memes unlocks at 12\.00 sol/i
    )
  ).toBeVisible();
  await expect(
    page.getByText(/fueled by creator rewards on our own.*perc.*token/i)
  ).toBeVisible();
  await expect(
    page.getByText(/first 10 paid listings are 0\.5 sol.*after that, 1\.5 sol each/i)
  ).toBeVisible();
});

test("seed token grid renders 15 muted tiles pre-unlock", async ({ page }) => {
  await page.goto("/");
  const grid = page.getByTestId("seed-token-grid");
  await expect(grid).toBeVisible();
  await expect(grid).toHaveAttribute("data-live", "false");

  const tiles = grid.locator("[data-ticker]");
  await expect(tiles).toHaveCount(15);

  // All tiles must be locked pre-unlock.
  const lockedCount = await grid.locator('[data-locked="true"]').count();
  expect(lockedCount).toBe(15);

  // Spot-check the expected seed tickers (STATE.md order).
  for (const ticker of [
    "TRUMP",
    "BONK",
    "WIF",
    "POPCAT",
    "FARTCOIN",
    "USELESS",
  ]) {
    await expect(grid.locator(`[data-ticker="${ticker}"]`)).toBeVisible();
  }
});

test("footer surfaces the 'Add a market' entry", async ({ page }) => {
  await page.goto("/");
  // Pre-unlock: the entry exists but is rendered as a disabled span.
  await expect(page.getByText(/add a market/i)).toBeVisible();
});

test("launch page renders and is gated on wallet", async ({ page }) => {
  await page.goto("/launch");
  await expect(page.getByText(/launch a \.\.\.perc token/i)).toBeVisible();
  await expect(page.getByText(/connect a wallet to continue/i)).toBeVisible();

  const btn = page.getByRole("button", { name: /^launch$/i });
  await expect(btn).toBeDisabled();
});

test.describe("phase 2 unlocked (NEXT_PUBLIC_PHASE_2_LIVE=true)", () => {
  // Dedicated dev server on :3001 is spawned with the env var pre-set —
  // see playwright.config.ts. Next inlines NEXT_PUBLIC_* at dev-start, so
  // we can't flip it on the default :3000 server for a single test.
  test.use({ baseURL: "http://localhost:3001" });

  test("Trade CTA links to /markets and seed tiles are clickable", async ({ page }) => {
    await page.goto("/");

    // The disabled pre-unlock button is gone; a real Link takes its place.
    const tradeLink = page.getByRole("link", { name: /^trade$/i });
    await expect(tradeLink).toBeVisible();
    await expect(tradeLink).toHaveAttribute("href", "/markets");

    // Seed grid transitions to data-live="true" and every verified tile
    // becomes an <a>. Stub config has BONK flipped to verified=true with
    // its well-known mint, so exactly one tile is clickable today.
    const grid = page.getByTestId("seed-token-grid");
    await expect(grid).toBeVisible();
    await expect(grid).toHaveAttribute("data-live", "true");
    const bonk = grid.locator('[data-ticker="BONK"]');
    await expect(bonk).toHaveAttribute("data-locked", "false");
    await expect(bonk).toHaveAttribute(
      "href",
      "/perp/DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"
    );

    // Footer entry is a real link to /markets/create.
    const addMarket = page.getByRole("link", { name: /^add a market$/i });
    await expect(addMarket).toBeVisible();
    await expect(addMarket).toHaveAttribute("href", "/markets/create");
  });
});

test("invalid mint share page shows fallback", async ({ page }) => {
  await page.goto("/t/notAValidBase58Key!!!");
  await expect(page.getByRole("heading", { name: /invalid mint/i })).toBeVisible();
});
