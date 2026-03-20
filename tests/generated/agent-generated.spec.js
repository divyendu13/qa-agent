import { test, expect } from '@playwright/test';

test.describe('TodoMVC tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('https://demo.playwright.dev/todomvc');
  });

  test('should add a new todo', async ({ page }) => {
    await page.locator('.new-todo').fill('Learn Playwright');
    await page.locator('.new-todo').press('Enter');
    await expect(page.locator('.todo-list li label')).toHaveText('Learn Playwright');
  });

  test('should complete a todo', async ({ page }) => {
    await page.locator('.new-todo').fill('Learn Playwright');
    await page.locator('.new-todo').press('Enter');
    await page.locator('.todo-list li .toggle').click();
    await expect(page.locator('.todo-list li.completed label')).toHaveText('Learn Playwright');
  });

  test('should delete a todo', async ({ page }) => {
    await page.locator('.new-todo').fill('Learn Playwright');
    await page.locator('.new-todo').press('Enter');
    await page.locator('.todo-list li .destroy').click();
    await expect(page.locator('.todo-list li')).toHaveCount(0);
  });

  test('should edit a todo', async ({ page }) => {
    await page.locator('.new-todo').fill('Learn Playwright');
    await page.locator('.new-todo').press('Enter');
    await page.locator('.todo-list li label').dblclick();
    await page.locator('.todo-list li .edit').fill('Learned Playwright');
    await page.locator('.todo-list li .edit').press('Enter');
    await expect(page.locator('.todo-list li label')).toHaveText('Learned Playwright');
  });
});