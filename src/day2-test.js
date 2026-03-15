// src/day2-test.js — runs the full Day 2 flow
import { launchBrowser, navigateTo, getPageContent, takeScreenshot, performAction, closeBrowser } from './skills/browse.js';
import { analyzePageAndPlan } from './llm.js';
import fs from 'fs';

const TARGET_URL = 'https://demo.playwright.dev/todomvc';

async function run() {
  console.log('\n=== QA Agent — Day 2 ===\n');

  // 1. Launch browser and navigate
  await launchBrowser({ headless: true });
  await navigateTo(TARGET_URL);

  // 2. Get initial page content
  console.log('[agent] reading page...');
  const pageContent = await getPageContent();

  // 3. Ask LLM to analyze and plan
  console.log('[agent] asking Claude to analyze page and plan actions...\n');
  const plan = await analyzePageAndPlan(pageContent);

  console.log('--- PAGE DESCRIPTION ---');
  console.log(plan.pageDescription);
  console.log('\n--- TESTABLE ACTIONS IDENTIFIED ---');
  plan.testableActions.forEach((a, i) => console.log(`  ${i + 1}. ${a}`));
  console.log('\n--- PLANNED ACTIONS ---');
  console.log(JSON.stringify(plan.nextActions, null, 2));

  // 4. Execute the planned actions
  console.log('\n[agent] executing planned actions...\n');
  for (const action of plan.nextActions) {
    try {
      await performAction(action);
      await new Promise(r => setTimeout(r, 500)); // small pause between actions
    } catch (err) {
      console.log(`[agent] action failed (${action.type} on ${action.selector}): ${err.message}`);
    }
  }

  // 5. Screenshot the result
  fs.mkdirSync('reports', { recursive: true });
  const screenshotPath = await takeScreenshot('day2-result.png');

  // 6. Get final page state
  const finalState = await getPageContent();
  console.log('\n--- FINAL PAGE STATE ---');
  console.log(finalState.text.slice(0, 500));

  await closeBrowser();
  console.log(`\n[agent] done. Screenshot saved to ${screenshotPath}`);
}

run().catch(console.error);