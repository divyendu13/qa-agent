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
    // Match:  ✓  1 [chromium] › file.spec.js:10:3 › Suite › test name (123ms)
    const passLine = line.match(/[✓+]\s+\d*\s*\[.*?\].*?›\s+(.+?)\s+\((\d+)ms\)/);
    const failLine = line.match(/[✗×]\s+\d*\s*\[.*?\].*?›\s+(.+?)\s+\((\d+)ms\)/);

    if (passLine) {
      tests.push({ title: passLine[1].trim(), status: 'passed', duration: parseInt(passLine[2]), error: null });
    } else if (failLine) {
      tests.push({ title: failLine[1].trim(), status: 'failed', duration: parseInt(failLine[2]), error: null });
    }
  });

  // Capture error messages for failed tests
  lines.forEach((line, i) => {
    if (line.includes('Error:') || line.includes('Timeout')) {
      const failedTest = tests.find(t => t.status === 'failed' && !t.error);
      if (failedTest) failedTest.error = line.trim().slice(0, 200);
    }
  });

  const passedMatch = output.match(/(\d+)\s+passed/);
  const failedMatch = output.match(/(\d+)\s+failed/);
  const passed = parseInt(passedMatch?.[1] || tests.filter(t => t.status === 'passed').length);
  const failed = parseInt(failedMatch?.[1] || tests.filter(t => t.status === 'failed').length);

  return { passed, failed, total: passed + failed, tests, rawOutput: output.slice(0, 3000) };
}