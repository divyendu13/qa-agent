import { test, expect } from '@playwright/test';

test.describe('TodoMVC Demo', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('https://demo.playwright.dev/todomvc/');
  });

  test('Create new todos', async ({ page }) => {
    await page.locator('.new-todo').fill('Buy groceries');
    await page.locator('.new-todo').press('Enter');
    await expect(page.locator('.todo-list li label')).toHaveText('Buy groceries');
  });

  test('Edit existing todos', async ({ page }) => {
    await page.locator('.new-todo').fill('Buy milk');
    await page.locator('.new-todo').press('Enter');
    await page.locator('.todo-list li label').dblclick();
    await page.locator('.todo-list li .edit').fill('Buy almond milk');
    await page.locator('.todo-list li .edit').press('Enter');
    await expect(page.locator('.todo-list li label')).toHaveText('Buy almond milk');
  });

  test('Verify todo display', async ({ page }) => {
    await page.locator('.new-todo').fill('Finish Playwright tutorial');
    await page.locator('.new-todo').press('Enter');
    await expect(page.locator('.todo-list li label')).toHaveText('Finish Playwright tutorial');
  });

  test('Open edit mode on double-click', async ({ page }) => {
    await page.locator('.new-todo').fill('Learn Playwright');
    await page.locator('.new-todo').press('Enter');
    await page.locator('.todo-list li label').dblclick();
    await expect(page.locator('.todo-list li .edit')).toBeVisible();
  });

  test('Verify links', async ({ page }) => {
    await page.click('a[href="http://todomvc.com"]');
    await expect(page).toHaveURL('http://todomvc.com/');
    await page.goBack();
    await page.click('a[href="https://github.com/Microsoft/playwright"]');
    await expect(page).toHaveURL('https://github.com/Microsoft/playwright');
  });
});