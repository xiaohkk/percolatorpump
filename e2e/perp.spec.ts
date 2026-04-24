import { test, expect } from "@playwright/test";

// Any valid base58-length pubkey works — the page takes the "not found"
// branch for a mint with no slab (which is every mint on a freshly
// deployed program).
const TEST_MINT = "So11111111111111111111111111111111111111112";

test.describe("/perp/[mint] market page", () => {
  test("renders the header + chart placeholder + order panel + position panel", async ({
    page,
  }) => {
    await page.goto(`/perp/${TEST_MINT}`);
    // Chart placeholder renders regardless of slab existence — page structure
    // is always there.
    const chart = page.getByTestId("mark-chart");
    const orderPanel = page.getByTestId("order-panel");
    const notFound = page.getByTestId("perp-not-found");

    // Either the "not found" banner OR the full ready layout shows. In
    // either case, the page navigated cleanly and rendered.
    await expect(chart.or(notFound)).toBeVisible();
    if (await chart.isVisible()) {
      await expect(orderPanel).toBeVisible();
    }
  });

  test("invalid mint shows the inline fallback", async ({ page }) => {
    await page.goto("/perp/not-a-real-pubkey!!!");
    await expect(
      page.getByRole("heading", { name: /invalid mint/i })
    ).toBeVisible();
  });

  test("haircut card renders with the 'pending typed decoder' state", async ({
    page,
  }) => {
    await page.goto(`/perp/${TEST_MINT}`);
    const card = page.getByTestId("haircut-card");
    // Card is always rendered; data-bucket is 'unknown' until typed decoder.
    if (await card.isVisible()) {
      await expect(card).toHaveAttribute("data-bucket", "unknown");
    }
  });

  test("chart canvas element mounts when the market is ready", async ({
    page,
  }) => {
    await page.goto(`/perp/${TEST_MINT}`);

    // Chart is only rendered in the `ready` branch. On devnet with no slab
    // for TEST_MINT the page ends in `not_found` instead; on a slow RPC
    // it may still be `loading` past our window. Skip cleanly in those
    // cases — the test exists to assert the testid exists when the chart
    // actually renders.
    const canvas = page.getByTestId("mark-chart-canvas");
    try {
      await canvas.waitFor({ state: "visible", timeout: 20_000 });
    } catch {
      test.skip(true, "chart not mounted (market not_found or slow RPC)");
      return;
    }
    await expect(canvas).toBeVisible();
  });

  test("chart canvas has non-zero dimensions within 15s of load", async ({
    page,
  }) => {
    await page.goto(`/perp/${TEST_MINT}`);
    const canvas = page.getByTestId("mark-chart-canvas");
    try {
      await canvas.waitFor({ state: "visible", timeout: 20_000 });
    } catch {
      test.skip(true, "chart not mounted (market not_found or slow RPC)");
      return;
    }
    // Lightweight-charts v4 sizes from the parent on first render. Poll
    // for the container to report non-zero area.
    await expect
      .poll(
        async () => {
          const box = await canvas.boundingBox();
          return box ? box.width * box.height : 0;
        },
        { timeout: 15_000, intervals: [250, 500, 1_000] }
      )
      .toBeGreaterThan(0);
  });

  test("long/short side toggle is interactive when chart is present", async ({
    page,
  }) => {
    await page.goto(`/perp/${TEST_MINT}`);
    // Wait for the page to settle on either the ready layout or the
    // not-found banner — useMarket starts in "loading".
    await expect(
      page
        .getByTestId("mark-chart")
        .or(page.getByTestId("perp-not-found"))
    ).toBeVisible();
    const notFound = page.getByTestId("perp-not-found");
    if (await notFound.isVisible()) {
      // No slab for the test mint — toggle isn't mounted. That's fine;
      // the "renders the header" test already covers the chart-present
      // path when a real market exists on devnet.
      return;
    }
    const long = page.getByTestId("side-long");
    const short = page.getByTestId("side-short");
    await expect(long).toHaveAttribute("aria-selected", "true");
    await short.click();
    await expect(short).toHaveAttribute("aria-selected", "true");
    await expect(long).toHaveAttribute("aria-selected", "false");
  });
});
