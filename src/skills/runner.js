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

function parseTextResults(output, allPassed) {
  const tests = [];

  // Parse individual test lines from --reporter=list output
  // Format: "    ✓  1 [chromium] › todo.spec.js:10:3 › TodoMVC › add todo (1234ms)"
  const lines = output.split('\n');
  lines.forEach(line => {
    const passMatch = line.match(/✓|passed/);
    const failMatch = line.match(/✗|×|failed|F /);
    const titleMatch = line.match(/›\s+(.+?)\s+\((\d+)ms\)/);

    if (titleMatch) {
      tests.push({
        title: titleMatch[1].trim(),
        status: failMatch ? 'failed' : 'passed',
        duration: parseInt(titleMatch[2]),
        error: null
      });
    }
  });

  // Parse summary line: "5 passed (12s)" or "3 passed, 2 failed"
  const passedMatch = output.match(/(\d+)\s+passed/);
  const failedMatch = output.match(/(\d+)\s+failed/);
  const passed = parseInt(passedMatch?.[1] || 0);
  const failed = parseInt(failedMatch?.[1] || 0);

  return {
    passed,
    failed,
    total: passed + failed,
    tests,
    rawOutput: output.slice(0, 2000) // cap for readability
  };
}