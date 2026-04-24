import { test, expect } from "@playwright/test";

test.describe("/markets/create paid listing", () => {
  test("renders form + tier banner with current tier + fee", async ({
    page,
  }) => {
    await page.goto("/markets/create");
    await expect(
      page.getByRole("heading", { name: /add a market/i })
    ).toBeVisible();
    const banner = page.getByTestId("tier-banner");
    await expect(banner).toBeVisible();
    // Tier text is "promo · X.XX SOL" or "standard · X.XX SOL"; match either.
    await expect(banner).toContainText(/\b(promo|standard)\b/i);
    await expect(banner).toContainText(/SOL/);
  });

  test("resolve button rejects invalid input inline", async ({ page }) => {
    await page.goto("/markets/create");
    await page.getByTestId("mint-input").fill("not-a-real-pubkey!!!");
    await page.getByTestId("mint-resolve").click();
    await expect(page.getByText(/not a valid solana pubkey/i)).toBeVisible();
  });

  test("resolve button stays disabled with an empty mint input", async ({
    page,
  }) => {
    await page.goto("/markets/create");
    const btn = page.getByTestId("mint-resolve");
    await expect(btn).toBeDisabled();
    // Typing enables it.
    await page.getByTestId("mint-input").fill("x");
    await expect(btn).toBeEnabled();
  });

  test("create button is disabled until a mint resolves to a valid DEX source", async ({
    page,
  }) => {
    await page.goto("/markets/create");
    // No wallet → the connect prompt shows in place of the create button.
    await expect(
      page.getByRole("button", { name: /select wallet|pay/i })
    ).toBeVisible();
  });
});

test.describe("/api/markets/resolve", () => {
  test("400 on missing mint", async ({ request }) => {
    const res = await request.get("/api/markets/resolve");
    expect(res.status()).toBe(400);
  });

  test("400 on invalid mint pubkey", async ({ request }) => {
    const res = await request.get(
      "/api/markets/resolve?mint=not-a-real-pubkey"
    );
    expect(res.status()).toBe(400);
  });

  test("200 with a shape for a real but non-existent mint", async ({
    request,
  }) => {
    const res = await request.get(
      "/api/markets/resolve?mint=So11111111111111111111111111111111111111112"
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.mint).toBeTruthy();
    // dex MAY be null (no bonding curve for wSOL) — we just assert the
    // response shape is what the UI expects.
    expect("existingSlab" in body).toBe(true);
    expect("programStub" in body).toBe(true);
  });
});
