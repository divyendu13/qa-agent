import { test, expect } from '@playwright/test';

test.describe('TodoMVC app', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('https://demo.playwright.dev/todomvc');
  });

  test('should add a new todo', async ({ page }) => {
    await page.locator('.new-todo').fill('New todo');
    await page.locator('.new-todo').press('Enter');
    await expect(page.locator('.todo-list li label')).toHaveText('New todo');
  });

  test('should double-click to edit a todo', async ({ page }) => {
    await page.locator('.new-todo').fill('Existing todo');
    await page.locator('.new-todo').press('Enter');
    await page.locator('.todo-list li label').dblclick();
    await expect(page.locator('.todo-list li .edit')).toBeVisible();
    await page.locator('.todo-list li .edit').fill('Edited todo');
    await page.locator('.todo-list li .edit').press('Enter');
    await expect(page.locator('.todo-list li label')).toHaveText('Edited todo');
  });

  test('should complete a todo', async ({ page }) => {
    await page.locator('.new-todo').fill('Completed todo');
    await page.locator('.new-todo').press('Enter');
    await page.locator('.todo-list li .toggle').click();
    await expect(page.locator('.todo-list li')).toHaveClass('completed');
  });

  test('should delete a todo', async ({ page }) => {
    await page.locator('.new-todo').fill('Todo to delete');
    await page.locator('.new-todo').press('Enter');
    await page.locator('.todo-list li .destroy').click();
    await expect(page.locator('.todo-list li')).not.toBeVisible();
  });
});