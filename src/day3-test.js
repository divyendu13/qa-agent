import { launchBrowser, navigateTo, getPageContent, closeBrowser } from './skills/browse.js';
import { analyzePageAndPlan } from './llm.js';
import { generateTestFile } from './skills/generate.js';
import { runTests } from './skills/runner.js';
import fs from 'fs';

const TARGET_URL = 'https://demo.playwright.dev/todomvc';

async function run() {
  console.log('\n=== QA Agent — Day 3: Test Generation ===\n');

  // ── Phase 1: Browse ──────────────────────────────
  console.log('Phase 1: browsing the app...');
  await launchBrowser({ headless: true });
  await navigateTo(TARGET_URL);
  const pageContent = await getPageContent();
  await closeBrowser();

  // ── Phase 2: Analyze ─────────────────────────────
  console.log('\nPhase 2: analyzing page with Claude...');
  const plan = await analyzePageAndPlan(pageContent);

  console.log('\n--- Page description ---');
  console.log(plan.pageDescription);
  console.log('\n--- Testable actions identified ---');
  plan.testableActions.forEach((a, i) => console.log(`  ${i + 1}. ${a}`));

  // ── Phase 3: Generate ────────────────────────────
  console.log('\nPhase 3: generating Playwright test file...');
  const { outputPath, code } = await generateTestFile({
    pageDescription: plan.pageDescription,
    testableActions: plan.testableActions,
    url: TARGET_URL,
    filename: 'todo.spec.js'
  });

  console.log('\n--- Generated test code preview (first 800 chars) ---');
  console.log(code.slice(0, 800) + '...\n');

  // ── Phase 4: Run ─────────────────────────────────
  console.log('Phase 4: running generated tests...\n');
  const results = await runTests(outputPath);

  console.log('--- Test results ---');
  console.log(`  Total:   ${results.total}`);
  console.log(`  Passed:  ${results.passed}`);
  console.log(`  Failed:  ${results.failed}`);

  if (results.tests.length > 0) {
    console.log('\n--- Per-test breakdown ---');
    results.tests.forEach(t => {
      const icon = t.status === 'passed' ? '✓' : '✗';
      console.log(`  ${icon} ${t.title} (${t.duration}ms)`);
      if (t.error) console.log(`    Error: ${t.error.slice(0, 100)}`);
    });
  }

  // ── Save summary ─────────────────────────────────
  fs.mkdirSync('reports', { recursive: true });
  const summary = {
    timestamp: new Date().toISOString(),
    url: TARGET_URL,
    plan,
    testFile: outputPath,
    results
  };
  fs.writeFileSync('reports/day3-summary.json', JSON.stringify(summary, null, 2));
  console.log('\n[agent] summary saved to reports/day3-summary.json');
  console.log('[agent] day 3 complete.\n');
}

run().catch(console.error);