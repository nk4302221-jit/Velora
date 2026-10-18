
import { test, expect } from '@playwright/test';

test('Velora homepage loads successfully', async ({ page }) => {
  const pageErrors = [];

  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });

  const response = await page.goto('http://localhost:5173/');

  expect(response.status()).toBe(200);
  await expect(page.locator('body')).toBeVisible();

  expect(pageErrors).toEqual([]);
});

test('Velora navigation works', async ({ page }) => {
  await page.goto('http://localhost:5173/');

  await expect(page.locator('body')).toBeVisible();

  const links = page.locator('a[href]');
  const linkCount = await links.count();

  expect(linkCount).toBeGreaterThan(0);
});
test('Velora products page loads successfully', async ({ page }) => {
  const response = await page.goto('http://localhost:5173/products');

  expect(response.status()).toBe(200);
  await expect(page.locator('body')).toBeVisible();
});
test('Products page has no JavaScript errors', async ({ page }) => {
  const pageErrors = [];

  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });

  await page.goto('http://localhost:5173/products');

  await expect(page.locator('body')).toBeVisible();
  expect(pageErrors).toEqual([]);
});