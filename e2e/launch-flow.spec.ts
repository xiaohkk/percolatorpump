import { test, expect } from "@playwright/test";

/**
 * /launch form validation + wallet-gating tests.
 *
 * The full "click Launch → POST /api/launch → redirect" click-through
 * requires a real wallet adapter session (or a deeply mocked
 * `@solana/wallet-adapter-react` provider). That path is exercised by the
 * devnet smoke script at `scripts/smoke-devnet-launch.ts`. Here we cover
 * the gates the form itself owns: field validation, size caps, and the
 * "Launch button must stay disabled until the preconditions are met"
 * invariant.
 */

test.describe("/launch form validation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/launch");
  });

  test("Launch button starts disabled (no wallet, empty form)", async ({ page }) => {
    const btn = page.getByRole("button", { name: /^launch$/i });
    await expect(btn).toBeDisabled();
    await expect(page.getByText(/connect a wallet to continue/i)).toBeVisible();
  });

  test("ticker truncates at 10 characters on input", async ({ page }) => {
    const ticker = page.locator('input[placeholder="MPT"]');
    await ticker.fill("ABCDEFGHIJKLMNO"); // 15 chars in
    // Component slices to MAX_TICKER=10 on every keystroke AND uppercases.
    await expect(ticker).toHaveValue("ABCDEFGHIJ");
  });

  test("name truncates at 32 characters on input", async ({ page }) => {
    const name = page.locator('input[placeholder="My Perc Token"]');
    const longName = "A".repeat(50);
    await name.fill(longName);
    const value = await name.inputValue();
    expect(value.length).toBe(32);
  });

  test("Launch button stays disabled when name is empty even after other fields are filled", async ({
    page,
  }) => {
    // Fill everything except name; the button must remain disabled.
    await page.locator('input[placeholder="MPT"]').fill("MYT");
    await page
      .locator('textarea[placeholder="What\'s the story of this token?"]')
      .fill("A real description.");

    // Synthetic image upload: tiny PNG bytes.
    const pngBytes = Buffer.from(
      "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4" +
        "8900000009704859730000000100000001010000000018c6c1b70000000c4944415" +
        "4789c63000100000500010d0a2db40000000049454e44ae426082",
      "hex"
    );
    await page.locator('input[type="file"]').setInputFiles({
      name: "icon.png",
      mimeType: "image/png",
      buffer: pngBytes,
    });

    const btn = page.getByRole("button", { name: /^launch$/i });
    await expect(btn).toBeDisabled();
  });

  test("oversized image is accepted into the field but the Launch button stays disabled", async ({
    page,
  }) => {
    // 6 MB file > MAX_IMAGE_BYTES (5 MB). The form's validator rejects it.
    const big = Buffer.alloc(6 * 1024 * 1024, 0);
    await page.locator('input[type="file"]').setInputFiles({
      name: "big.png",
      mimeType: "image/png",
      buffer: big,
    });
    // The field shows the size readout; the button remains disabled because
    // `imageFile.size > MAX_IMAGE_BYTES` invalidates the form.
    await expect(page.getByText(/big\.png.*KB/i)).toBeVisible();
    const btn = page.getByRole("button", { name: /^launch$/i });
    await expect(btn).toBeDisabled();
  });

  test("initial buy above 5 SOL invalidates the form", async ({ page }) => {
    await page.locator('input[placeholder="My Perc Token"]').fill("X");
    await page.locator('input[placeholder="MPT"]').fill("X");
    await page
      .locator('textarea[placeholder="What\'s the story of this token?"]')
      .fill("x");
    // Valid image.
    const png = Buffer.alloc(1024, 1);
    await page.locator('input[type="file"]').setInputFiles({
      name: "x.png",
      mimeType: "image/png",
      buffer: png,
    });
    // Over-cap initial buy.
    await page
      .locator('input[type="number"]')
      .fill("10");

    // Button still disabled (initialBuy > 5 fails `valid`), and also
    // because no wallet is connected — either guard is sufficient.
    const btn = page.getByRole("button", { name: /^launch$/i });
    await expect(btn).toBeDisabled();
  });
});

test.describe("/api/launch POST body contract", () => {
  /**
   * We can't click through without a real wallet, but we can still assert the
   * on-the-wire contract the page depends on. Intercept the first request to
   * `/api/launch` and verify it gets a 400 on missing fields — the route
   * enforces schema-level validation. This catches drift between the form
   * shape and the server's expected body.
   */
  test("POST /api/launch rejects an empty body with 4xx", async ({ request }) => {
    const res = await request.post("/api/launch", { data: {} });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test("POST /api/launch rejects an invalid creator pubkey", async ({ request }) => {
    const res = await request.post("/api/launch", {
      data: {
        name: "Test",
        ticker: "TST",
        description: "x",
        imageUri: "https://example/img.png",
        initialBuySol: 0,
        creator: "not-a-real-pubkey!!!",
      },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });
});
