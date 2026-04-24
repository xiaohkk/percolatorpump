import { test, expect } from "@playwright/test";

/**
 * Tests for `/t/[mint]` — the post-launch share page.
 *
 * We don't launch a real token here. Instead we visit a known-valid base58
 * pubkey whose metadata RPC lookup will 404/empty, and verify the page still
 * renders its skeleton with the mint preserved. The resolved path runs in
 * the devnet smoke script.
 */

// A real, valid Solana pubkey that is (almost certainly) not a token mint.
// Any valid base58 key of the right length passes `PublicKey` construction,
// so the page takes the "skeleton" branch after RPC lookup returns nothing.
const PLACEHOLDER_MINT = "So11111111111111111111111111111111111111112";

test.describe("/t/[mint] share page", () => {
  test("renders the skeleton (mint + perp badge + price badge) for a known pubkey", async ({
    page,
  }) => {
    await page.goto(`/t/${PLACEHOLDER_MINT}`);

    // Mint field.
    await expect(page.getByText(/mint/i).first()).toBeVisible();
    await expect(page.getByText(PLACEHOLDER_MINT.slice(0, 8))).toBeVisible();

    // Perp badge (task #6 + beyond: copy will change post-#17 deploy, but
    // the element lives here unconditionally).
    await expect(page.getByText(/perp:.*phase 2/i)).toBeVisible();

    // Action row is present. "Trade on pump.fun" always renders.
    await expect(
      page.getByRole("link", { name: /trade on pump\.fun/i })
    ).toHaveAttribute("href", `https://pump.fun/coin/${PLACEHOLDER_MINT}`);

    // Copy-mint button is present as a button (client component).
    await expect(
      page.getByRole("button", { name: /copy mint address/i })
    ).toBeVisible();
  });

  test("OG meta tags are present and reference the mint", async ({ page }) => {
    // Fetch the raw HTML so we can assert on <meta> tags without relying on
    // browser-rendered invisibility.
    const response = await page.goto(`/t/${PLACEHOLDER_MINT}`);
    const html = await response!.text();

    // Core meta tags — the share page's generateMetadata() must emit OG + twitter.
    expect(html).toMatch(/<meta[^>]+property="og:title"[^>]*>/);
    expect(html).toMatch(/<meta[^>]+property="og:description"[^>]*>/);
    expect(html).toMatch(/<meta[^>]+property="og:type"[^>]+content="website"/);
    expect(html).toMatch(/<meta[^>]+name="twitter:card"[^>]*>/);
    expect(html).toMatch(/<meta[^>]+name="twitter:title"[^>]*>/);

    // The title (in <title> or og:title) must reference the mint prefix.
    const shortMint = PLACEHOLDER_MINT.slice(0, 4);
    expect(html).toContain(shortMint);
  });

  test("copy-mint-button writes the mint to the clipboard and flashes 'copied'", async ({
    page,
    context,
  }) => {
    // Grant clipboard access so navigator.clipboard.writeText works.
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    await page.goto(`/t/${PLACEHOLDER_MINT}`);
    const btn = page.getByRole("button", { name: /copy mint address/i });
    await btn.click();

    // The button flashes "copied" for 1.5s.
    await expect(
      page.getByRole("button", { name: /^copied$/i })
    ).toBeVisible({ timeout: 2_000 });

    // Clipboard should now hold the mint.
    const value = await page.evaluate(() => navigator.clipboard.readText());
    expect(value).toBe(PLACEHOLDER_MINT);
  });

  test("invalid mint renders the fallback", async ({ page }) => {
    await page.goto("/t/not-a-real-base58-mint-address!!!");
    await expect(
      page.getByRole("heading", { name: /invalid mint/i })
    ).toBeVisible();
  });
});
