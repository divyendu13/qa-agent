// src/skills/triage.js
import { sendMessage } from '../llm.js';
import fs from 'fs';

export async function triageFailures(testResults, generatedCode) {
  // Nothing to triage if all passed
  if (testResults.failed === 0) {
    console.log('[triage] all tests passed — no triage needed');
    return { failures: [], allPassed: true };
  }

  const failedTests = testResults.tests.filter(t => t.status === 'failed');
  console.log(`[triage] analysing ${failedTests.length} failure(s) with Claude...`);

  const systemPrompt = `You are a senior QA engineer specialising in test failure diagnosis.
You will be given:
1. A failing Playwright test name and error message
2. The full test source code

Your job is to diagnose each failure and return a structured JSON report.

Always return a JSON array in this exact format — no markdown, no explanation:
[
  {
    "testName": "name of the failing test",
    "failureReason": "one sentence — what actually failed",
    "rootCause": "one sentence — WHY it failed (selector wrong, timing, navigation, etc)",
    "category": "one of: selector-mismatch | navigation | timing | assertion | environment | external-dependency",
    "severity": "one of: critical | high | medium | low",
    "suggestedFix": "concrete actionable fix — specific code change if possible",
    "fixedSelector": "if category is selector-mismatch, provide the correct selector here, else null"
  }
]`;

  const userMessage = `Diagnose these test failures.

FAILING TESTS:
${failedTests.map(t => `
Test: "${t.title}"
Error: ${t.error || 'Test failed — no error message captured'}
Duration: ${t.duration}ms
`).join('\n---\n')}

FULL TEST SOURCE CODE:
${generatedCode}

Return a JSON array with one diagnosis object per failing test.`;

  const raw = await sendMessage(systemPrompt, userMessage);
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  let failures = [];
  try {
    failures = JSON.parse(cleaned);
  } catch (e) {
    console.log('[triage] JSON parse error — raw response:', raw.slice(0, 200));
    failures = failedTests.map(t => ({
      testName: t.title,
      failureReason: t.error || 'Unknown failure',
      rootCause: 'Could not parse LLM triage response',
      category: 'unknown',
      severity: 'medium',
      suggestedFix: 'Review test manually',
      fixedSelector: null
    }));
  }

  return { failures, allPassed: false };
}

export async function autoFixSelectors(generatedCodePath, triageReport) {
  // Only attempt fixes for selector-mismatch failures
  const selectorFixes = triageReport.failures.filter(
    f => f.category === 'selector-mismatch' && f.fixedSelector
  );

  if (selectorFixes.length === 0) {
    console.log('[triage] no selector fixes to apply');
    return false;
  }

  console.log(`[triage] applying ${selectorFixes.length} selector fix(es)...`);
  let code = fs.readFileSync(generatedCodePath, 'utf8');

  selectorFixes.forEach(fix => {
    console.log(`[triage]   fixing: ${fix.testName}`);
    console.log(`[triage]   suggested: ${fix.fixedSelector}`);
  });

  // Ask Claude to apply all fixes at once
  const systemPrompt = `You are a Playwright test engineer.
You will be given test source code and a list of selector fixes to apply.
Apply all fixes and return the complete corrected test file.
Return ONLY the raw JavaScript — no markdown, no explanation.`;

  const userMessage = `Fix these selector issues in the test file.

FIXES TO APPLY:
${selectorFixes.map(f => `- In test "${f.testName}": ${f.suggestedFix}`).join('\n')}

CURRENT TEST CODE:
${code}

Return the complete fixed test file.`;

  const fixed = await sendMessage(systemPrompt, userMessage);
  const cleanedFixed = fixed
    .replace(/```javascript\n?/g, '')
    .replace(/```js\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();

  // Write fixed version
  fs.writeFileSync(generatedCodePath, cleanedFixed, 'utf8');
  console.log('[triage] fixed test file written');
  return true;
}

export function formatTriageReport(triageResult, testResults) {
  const lines = [];
  lines.push('\n--- Triage report ---');

  if (triageResult.allPassed) {
    lines.push('  All tests passed — nothing to triage');
    return lines.join('\n');
  }

  triageResult.failures.forEach((f, i) => {
    const severityIcon = {
      critical: '🔴', high: '🟠', medium: '🟡', low: '🟢'
    }[f.severity] || '⚪';

    lines.push(`\n  Failure ${i + 1}: ${f.testName}`);
    lines.push(`  ${severityIcon} Severity    : ${f.severity.toUpperCase()}`);
    lines.push(`  Category    : ${f.category}`);
    lines.push(`  Reason      : ${f.failureReason}`);
    lines.push(`  Root cause  : ${f.rootCause}`);
    lines.push(`  Suggested fix: ${f.suggestedFix}`);
    if (f.fixedSelector) {
      lines.push(`  Fixed selector: ${f.fixedSelector}`);
    }
  });

  return lines.join('\n');
}