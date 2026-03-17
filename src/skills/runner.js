// src/skills/runner.js
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';

const execAsync = promisify(exec);

export async function runTests(specFile) {
  console.log(`[runner] running tests: ${specFile}`);

  try {
    const { stdout, stderr } = await execAsync(
      `npx playwright test ${specFile} --reporter=list`,
      { timeout: 60000, env: { ...process.env, FORCE_COLOR: '0' } }
    );
    return parseTextResults(stdout + stderr);

  } catch (err) {
    const output = (err.stdout || '') + (err.stderr || '');

    // Only treat as collection error if tests never started at all
    const isSyntaxError = output.includes('SyntaxError') ||
                          output.includes('ERR_MODULE_NOT_FOUND') ||
                          (output.includes('Error') && !output.includes('passed') && !output.includes('failed'));

    if (isSyntaxError) {
      const errorLine = output.split('\n')
        .find(l => l.includes('SyntaxError') || l.includes('ERR_MODULE')) || 'Syntax/import error';
      console.log(`[runner] collection error: ${errorLine}`);
      return { passed: 0, failed: 0, total: 0, collectionError: errorLine, tests: [], rawOutput: output };
    }

    // Tests ran but some failed — that's normal
    return parseTextResults(output);
  }
}

function parseTextResults(output) {
  const tests = [];
  const lines = output.split('\n');

  lines.forEach(line => {
    // Matches:  ✓  1 tests/generated/file.spec.js:8:3 › Suite › Test name (540ms)
    // Matches:  ✘  3 tests/generated/file.spec.js:24:3 › Suite › Test name (1.4s)
    const match = line.match(/^\s+([✓✘])\s+\d+\s+\S+\s+›\s+(.+?)\s+\([\d.]+(?:ms|s)\)/);
    if (!match) return;

    const passed = match[1] === '✓';
    const fullTitle = match[2].trim();

    // Strip "retry #N" lines — don't double count
    if (fullTitle.includes('retry #')) return;

    // Strip suite prefix — keep only the test name after last ›
    const parts = fullTitle.split('›');
    const title = parts[parts.length - 1].trim();

    tests.push({
      title,
      status: passed ? 'passed' : 'failed',
      duration: 0,
      error: null
    });
  });

  // Attach error messages to failed tests
  let currentFailed = null;
  lines.forEach(line => {
    const failMatch = line.match(/^\s+\d+\)\s+.+›\s+(.+)$/);
    if (failMatch) {
      const title = failMatch[1].trim().split('›').pop().trim();
      currentFailed = tests.find(t => t.status === 'failed' && t.title === title);
    }
    if (currentFailed && line.trim().startsWith('Error:')) {
      currentFailed.error = line.trim().slice(0, 200);
      currentFailed = null;
    }
  });

  const passed = tests.filter(t => t.status === 'passed').length;
  const failed = tests.filter(t => t.status === 'failed').length;

  return { passed, failed, total: passed + failed, tests, rawOutput: output.slice(0, 3000) };
}