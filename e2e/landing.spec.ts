import { test, expect } from "@playwright/test";

test("landing renders hero, treasury counter, and phase cards", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText(/phase 1 · live/i)).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/launch a/i);
  await expect(page.getByRole("link", { name: /launch a token/i })).toBeVisible();

  // Treasury counter card present
  await expect(page.getByText(/TREASURY/i)).toBeVisible();

  // Phase cards
  await expect(page.getByText(/phase 1 - launcher/i)).toBeVisible();
  await expect(page.getByText(/phase 2 - perps/i)).toBeVisible();
});

test("launch page renders and is gated on wallet", async ({ page }) => {
  await page.goto("/launch");
  await expect(page.getByText(/launch a \.\.\.perc token/i)).toBeVisible();
  await expect(page.getByText(/connect a wallet to continue/i)).toBeVisible();

  // The launch button should be disabled without a wallet + form inputs
  const btn = page.getByRole("button", { name: /^launch$/i });
  await expect(btn).toBeDisabled();
});

test("invalid mint share page shows fallback", async ({ page }) => {
  await page.goto("/t/notAValidBase58Key!!!");
  await expect(page.getByRole("heading", { name: /invalid mint/i })).toBeVisible();
});
