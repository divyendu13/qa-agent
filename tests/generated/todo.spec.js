import { test, expect } from '@playwright/test';

test.describe('TodoMVC tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('https://demo.playwright.dev/todomvc/');
  });

  test('Add new todos', async ({ page }) => {
    await page.locator('.new-todo').fill('Buy milk');
    await page.keyboard.press('Enter');
    expect(page.locator('.todo-list li label')).toHaveText('Buy milk');

    await page.locator('.new-todo').fill('Clean the house');
    await page.keyboard.press('Enter');
    expect(page.locator('.todo-list li')).toHaveCount(2);
    expect(page.locator('.todo-list li label')).toHaveText(['Buy milk', 'Clean the house']);
  });

  test('Edit existing todos', async ({ page }) => {
    await page.locator('.new-todo').fill('Learn Playwright');
    await page.keyboard.press('Enter');

    await page.locator('.todo-list li label').first().dblclick();
    await page.locator('.todo-list li .edit').first().fill('Learn Playwright with Playwright');
    await page.keyboard.press('Enter');

    expect(page.locator('.todo-list li label')).toHaveText('Learn Playwright with Playwright');
  });

  test('Verify double-click opens todo for editing', async ({ page }) => {
    await page.locator('.new-todo').fill('Finish the report');
    await page.keyboard.press('Enter');

    await page.locator('.todo-list li label').first().dblclick();
    expect(page.locator('.todo-list li .edit')).toBeVisible();
  });

  test('Verify "Created by" and "Part of" links', async ({ page }) => {
    await expect(page.locator('a[href="http://todomvc.com/"]')).toHaveAttribute('href', 'http://todomvc.com/');
    await expect(page.locator('a[href="https://github.com/tastejs/todomvc"]')).toHaveAttribute('href', 'https://github.com/tastejs/todomvc');
  });
  
  test('intentional failure — wrong selector', async ({ page }) => {
    await page.locator('.non-existent-input-xyz').fill('This will fail');
    await page.locator('.non-existent-input-xyz').press('Enter');
    await expect(page.locator('.broken-selector-abc')).toHaveText('This will fail');
  });
});