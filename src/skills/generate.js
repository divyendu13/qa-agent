import fs from 'fs';
import path from 'path';
import { sendMessage } from '../llm.js';

export async function generateTestFile({ pageDescription, testableActions, url, filename = 'generated.spec.js' }) {

  const systemPrompt = `You are an expert Playwright test automation engineer.
You will be given a description of a web page and a list of testable actions.
Your job is to write a complete, runnable Playwright test file in JavaScript.

Rules:
- Use @playwright/test imports only — import { test, expect } from '@playwright/test'
- ALWAYS use test.describe() — never bare describe() which is not valid in Playwright
- ALWAYS use test.beforeEach() — never bare beforeEach()
- Use page.locator() for all element selection
- This is a TodoMVC app — use these EXACT selectors which are known to work:
    input field: .new-todo
    todo items:  .todo-list li label
    complete checkbox: .todo-list li .toggle
    delete button: .todo-list li .destroy
- Every test must have a clear descriptive name
- Add expect assertions after every action
- Do NOT use data-testid selectors for this app — it does not have them
- Do NOT use arbitrary timeouts
- Return ONLY the raw JavaScript code — no markdown, no explanation, no code fences`;

  const userMessage = `Generate a complete Playwright test file for this web page.

URL: ${url}
PAGE DESCRIPTION: ${pageDescription}
THINGS TO TEST:
${testableActions.map((a, i) => `${i + 1}. ${a}`).join('\n')}

Write tests that cover all the testable actions listed above.
Return only the raw JavaScript code.`;

  console.log('[generate] asking Claude to write test file...');
  const code = await sendMessage(systemPrompt, userMessage);

  // Clean any accidental markdown fences
  const cleaned = code
    .replace(/```javascript\n?/g, '')
    .replace(/```js\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();

  // Write to disk
  const outputPath = path.join('tests', 'generated', filename);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, cleaned, 'utf8');

  console.log(`[generate] test file written to ${outputPath}`);
  return { outputPath, code: cleaned };
}