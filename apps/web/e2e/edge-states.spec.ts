import { test, expect } from "@playwright/test";

test("renders an explicit empty-search state", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder("Search symbol or company").fill("NOT-A-SYMBOL");
  await expect(page.getByText("No matching symbols")).toBeVisible();
});

test("renders invalid-symbol and historical-failure states", async ({ page }) => {
  await page.goto("/stock/NOT-A-SYMBOL");
  await expect(page.getByText("Instrument unavailable")).toBeVisible();
  await page.route("**/api/historical/TCS?range=1D", (route) => route.abort());
  await page.goto("/stock/TCS");
  await expect(page.getByText("Historical data unavailable")).toBeVisible();
});

test("renders market-closed messaging with a stale snapshot", async ({ page }) => {
  await page.addInitScript(() => {
    window.WebSocket = class { readyState = 1; addEventListener() {} send() {} close() {} } as unknown as typeof WebSocket;
  });
  await page.goto("/");
  await expect(page.getByText("Market closed", { exact: true })).toBeVisible();
  await expect(page.getByText("Prices below show the latest available snapshot.")).toBeVisible();
});

test("renders a visually distinct offline state", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(500);
  await page.context().setOffline(true);
  await expect(page.getByRole("banner").getByText("Backend offline")).toBeVisible({ timeout: 3000 });
});
