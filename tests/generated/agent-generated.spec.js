import { test, expect } from '@playwright/test';

test.describe('TodoMVC app', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('https://demo.playwright.dev/todomvc');
  });

  test('should double-click to edit a todo', async ({ page }) => {
    // Add a new todo
    await page.locator('.new-todo').fill('Learn Playwright');
    await page.locator('.new-todo').press('Enter');
    expect(page.locator('.todo-list li label')).toHaveText('Learn Playwright');

    // Double-click to edit a todo
    await page.locator('.todo-list li label').first().dblclick();
    await page.locator('.todo-list li .edit').first().fill('Learn Playwright Test Automation');
    await page.locator('.todo-list li .edit').first().press('Enter');
    expect(page.locator('.todo-list li label')).toHaveText('Learn Playwright Test Automation');
  });
});