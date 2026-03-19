import { test, expect } from '@playwright/test';

test.describe('TodoMVC tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('https://demo.playwright.dev/todomvc/');
  });

  test('Should add a new todo', async ({ page }) => {
    const newTodo = 'Buy milk';
    await page.locator('.new-todo').fill(newTodo);
    await page.locator('.new-todo').press('Enter');
    await expect(page.locator('.todo-list li label')).toHaveText(newTodo);
  });

  test('Should complete a todo', async ({ page }) => {
    const newTodo = 'Finish Playwright tests';
    await page.locator('.new-todo').fill(newTodo);
    await page.locator('.new-todo').press('Enter');
    await page.locator('.todo-list li .toggle').click();
    await expect(page.locator('.todo-list li.completed label')).toHaveText(newTodo);
  });

  test('Should edit a todo', async ({ page }) => {
    const newTodo = 'Learn Playwright';
    await page.locator('.new-todo').fill(newTodo);
    await page.locator('.new-todo').press('Enter');
    await page.dblclick('.todo-list li label');
    await page.locator('.todo-list li .edit').fill('Mastered Playwright');
    await page.locator('.todo-list li .edit').press('Enter');
    await expect(page.locator('.todo-list li label')).toHaveText('Mastered Playwright');
  });

  test('Should delete a todo', async ({ page }) => {
    const newTodo = 'Clean the house';
    await page.locator('.new-todo').fill(newTodo);
    await page.locator('.new-todo').press('Enter');
    await page.hover('.todo-list li');
    await page.locator('.todo-list li .destroy').click();
    await expect(page.locator('.todo-list li')).not.toBeVisible();
  });

  test('Should navigate to the real TodoMVC site', async ({ page }) => {
    await page.locator('a[href="http://todomvc.com/"]').click();
    await expect(page).toHaveURL('http://todomvc.com/');
  });

  test('Should navigate to Remo H. Jansen\'s GitHub', async ({ page }) => {
    await page.locator('a[href="https://github.com/remojansen"]').click();
    await expect(page).toHaveURL('https://github.com/remojansen');
  });
});