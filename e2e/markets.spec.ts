import { test, expect } from "@playwright/test";

test.describe("/markets discover page", () => {
  test("renders the header + filters + markets table (or empty state)", async ({
    page,
  }) => {
    await page.goto("/markets");
    await expect(
      page.getByRole("heading", { name: /^markets$/i })
    ).toBeVisible();
    await expect(page.getByTestId("market-table")).toBeVisible();
    await expect(
      page.getByRole("link", { name: /\+ add a market/i })
    ).toHaveAttribute("href", "/markets/create");
  });

  test("all / seeded / paid filters exist and are clickable", async ({
    page,
  }) => {
    await page.goto("/markets");
    await expect(page.getByRole("button", { name: /^all$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^seeded$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^paid$/i })).toBeVisible();
    await page.getByRole("button", { name: /^seeded$/i }).click();
    // No assertion on row count — a freshly-deployed program returns zero
    // slabs, which is the expected baseline for this integration.
  });
});

test.describe("/portfolio page", () => {
  test("no-wallet state prompts a connection", async ({ page }) => {
    await page.goto("/portfolio");
    await expect(
      page.getByText(/connect a wallet to see your open positions/i)
    ).toBeVisible();
  });
});
