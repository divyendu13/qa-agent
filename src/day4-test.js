// src/day4-test.js
import { launchBrowser, navigateTo, getPageContent, closeBrowser } from './skills/browse.js';
import { analyzePageAndPlan } from './llm.js';
import { generateTestFile } from './skills/generate.js';
import { runTests } from './skills/runner.js';
import { triageFailures, autoFixSelectors, formatTriageReport } from './skills/triage.js';
import fs from 'fs';

const TARGET_URL = 'https://demo.playwright.dev/todomvc';

async function run() {
  console.log('\n=== QA Agent — Day 4: Failure Triage ===\n');

  // ── Phase 1: Browse ──────────────────────────────
  console.log('Phase 1: browsing the app...');
  await launchBrowser({ headless: true });
  await navigateTo(TARGET_URL);
  const pageContent = await getPageContent();
  await closeBrowser();

  // ── Phase 2: Analyze ─────────────────────────────
  console.log('\nPhase 2: analyzing page...');
  const plan = await analyzePageAndPlan(pageContent);

  // ── Phase 3: Generate ────────────────────────────
  console.log('\nPhase 3: generating tests...');
  const { outputPath, code } = await generateTestFile({
    pageDescription: plan.pageDescription,
    testableActions: plan.testableActions,
    url: TARGET_URL,
    filename: 'todo.spec.js'
  });

  // ── Phase 4: Run (first attempt) ─────────────────
  console.log('\nPhase 4: running tests (attempt 1)...');
  let results = await runTests(outputPath);

  console.log(`\n  Passed: ${results.passed} | Failed: ${results.failed} | Total: ${results.total}`);
  results.tests.forEach(t => {
    const icon = t.status === 'passed' ? '✓' : '✗';
    console.log(`  ${icon} ${t.title} (${t.duration}ms)`);
  });

  // ── Phase 5: Triage ──────────────────────────────
  console.log('\nPhase 5: triaging failures...');
  const triageResult = await triageFailures(results, code);
  console.log(formatTriageReport(triageResult, results));

  // ── Phase 6: Auto-fix + re-run ───────────────────
  if (!triageResult.allPassed) {
    const fixApplied = await autoFixSelectors(outputPath, triageResult);

    if (fixApplied) {
      console.log('\nPhase 6: re-running after auto-fix...');
      const results2 = await runTests(outputPath);

      console.log(`\n  After fix — Passed: ${results2.passed} | Failed: ${results2.failed}`);
      results2.tests.forEach(t => {
        const icon = t.status === 'passed' ? '✓' : '✗';
        console.log(`  ${icon} ${t.title} (${t.duration}ms)`);
      });

      results = results2; // use final results for report
    } else {
      console.log('\nPhase 6: skipped — no auto-fixable selector issues found');
    }
  }

  // ── Save full report ─────────────────────────────
  fs.mkdirSync('reports', { recursive: true });
  const report = {
    timestamp: new Date().toISOString(),
    url: TARGET_URL,
    plan,
    testFile: outputPath,
    results,
    triage: triageResult
  };
  fs.writeFileSync('reports/day4-summary.json', JSON.stringify(report, null, 2));

  console.log('\n[agent] report saved to reports/day4-summary.json');
  console.log('[agent] day 4 complete.\n');
}

run().catch(console.error);