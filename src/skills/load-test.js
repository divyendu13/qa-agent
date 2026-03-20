// src/skills/load-test.js
import { sendMessage } from '../llm.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

export async function runLoadTest({ targetUrl, vus = 10, duration = '30s' }) {
  console.log(`[load] generating k6 script for ${targetUrl}...`);

  // 1. Ask Claude to generate a k6 script
  const script = await generateK6Script(targetUrl, vus, duration);

  // 2. Write script to disk
  fs.mkdirSync('tests/load', { recursive: true });
  const scriptPath = 'tests/load/agent-load.js';
  fs.writeFileSync(scriptPath, script, 'utf8');
  console.log(`[load] k6 script written to ${scriptPath}`);

  // 3. Run k6
  console.log(`[load] running k6 — ${vus} VUs for ${duration}...`);
  const results = await executeK6(scriptPath);

  // 4. Compare vs baseline
  const regression = checkBaseline(results, targetUrl);

  return {
    targetUrl,
    config: { vus, duration },
    metrics: results,
    regression,
    summary: formatLoadSummary(results, regression)
  };
}

async function generateK6Script(targetUrl, vus, duration) {
  const systemPrompt = `You are a k6 load testing expert.
Generate a k6 load test script for the given URL.
Return ONLY raw JavaScript — no markdown, no explanation, no code fences.

Rules:
- Use k6's http module and check/sleep functions
- Test realistic user flows — GET the page, check response code and body
- Set the exported options with vus and duration from the params
- Add threshold: http_req_duration p(95) < 2000ms
- Add threshold: http_req_failed rate < 0.05
- Use sleep(1) between requests to simulate real users
- Check response status is 200
- Check response body contains expected content`;

  const userMessage = `Generate a k6 load test script for: ${targetUrl}
VUs: ${vus}
Duration: ${duration}

The page is a TodoMVC app. Test loading the main page realistically.
Return only the raw k6 JavaScript code.`;

  const raw = await sendMessage(systemPrompt, userMessage);

  // Clean any markdown fences
  return raw
    .replace(/```javascript\n?/g, '')
    .replace(/```js\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();
}

async function executeK6(scriptPath) {
  const jsonOutputPath = 'reports/k6-results.json';
  fs.mkdirSync('reports', { recursive: true });

  try {
    // k6 v1.x: use --out json and read the results file directly
    const { stdout, stderr } = await execAsync(
      `k6 run --out json=${jsonOutputPath} --quiet ${scriptPath}`,
      { timeout: 120000 }
    );

    // Save raw output for debugging
    const combined = stdout + stderr;
    fs.writeFileSync('reports/k6-raw-output.txt', combined, 'utf8');
    await new Promise(r => setTimeout(r, 1000)); // wait for file flush
    // Try parsing from the JSON output file first
    if (fs.existsSync(jsonOutputPath)) {
      return parseK6JsonFile(jsonOutputPath);
    }

    return parseK6Output(combined);

  } catch (err) {
    const output = (err.stdout || '') + (err.stderr || '');
    fs.writeFileSync('reports/k6-raw-output.txt', output, 'utf8');

    if (fs.existsSync(jsonOutputPath)) {
      return parseK6JsonFile(jsonOutputPath);
    }

    return parseK6Output(output);
  }
}

function parseK6JsonFile(jsonPath) {
  console.log('[load] parsing k6 JSON output file...');

  const metrics = {
    p95: null, p99: null, avg: null,
    errorRate: null, rps: null,
    totalRequests: null, thresholdsPassed: true
  };

  try {
    const lines = fs.readFileSync(jsonPath, 'utf8').trim().split('\n');

    // k6 JSON output is newline-delimited JSON — one object per line
    // We need the Point entries for http_req_duration and http_reqs
    const durationValues = [];
    let requestCount = 0;
    let failedCount = 0;
    let startTime = null;
    let endTime = null;

    lines.forEach(line => {
      if (!line.trim()) return;
      try {
        const entry = JSON.parse(line);

        // Only process metric data points
        if (entry.type !== 'Point') return;

        const metricName = entry.metric;
        const value = entry.data?.value;
        const time = entry.data?.time;

        if (!startTime || time < startTime) startTime = time;
        if (!endTime || time > endTime) endTime = time;

        if (metricName === 'http_req_duration') {
          durationValues.push(value);
        }
        if (metricName === 'http_reqs') {
          requestCount += value;
        }
        if (metricName === 'http_req_failed' && value === 1) {
          failedCount++;
        }
      } catch(e) {}
    });

    // Calculate metrics from collected values
    if (durationValues.length > 0) {
      const sorted = [...durationValues].sort((a, b) => a - b);
      metrics.avg = Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length);
      metrics.p95 = Math.round(sorted[Math.floor(sorted.length * 0.95)]);
      metrics.p99 = Math.round(sorted[Math.floor(sorted.length * 0.99)]);
    }

    if (requestCount > 0) {
      metrics.totalRequests = requestCount;
      metrics.errorRate = parseFloat(((failedCount / requestCount) * 100).toFixed(2));

      // Calculate RPS from time window
      if (startTime && endTime) {
        const durationSecs = (new Date(endTime) - new Date(startTime)) / 1000;
        if (durationSecs > 0) {
          metrics.rps = parseFloat((requestCount / durationSecs).toFixed(1));
        }
      }
    }

    // Check thresholds
    if (metrics.p95 && metrics.p95 > 2000) metrics.thresholdsPassed = false;
    if (metrics.errorRate && metrics.errorRate > 5) metrics.thresholdsPassed = false;

    console.log(`[load] p95=${metrics.p95}ms | avg=${metrics.avg}ms | errors=${metrics.errorRate}% | rps=${metrics.rps} | total=${metrics.totalRequests}`);
    return metrics;

  } catch(e) {
    console.log(`[load] JSON file parse error: ${e.message}`);
    return metrics;
  }
}

function parseK6Output(output) {
  const metrics = {
    p95: null,
    p99: null,
    avg: null,
    errorRate: null,
    rps: null,
    totalRequests: null,
    thresholdsPassed: true
  };

  // Parse k6 summary output
  const p95Match   = output.match(/http_req_duration.*?p\(95\)=(\d+\.?\d*)/);
  const p99Match   = output.match(/http_req_duration.*?p\(99\)=(\d+\.?\d*)/);
  const avgMatch   = output.match(/http_req_duration.*?avg=(\d+\.?\d*)/);
  const errMatch   = output.match(/http_req_failed.*?(\d+\.?\d*)%/);
  const rpsMatch   = output.match(/http_reqs.*?(\d+\.?\d*)\/s/);
  const totalMatch = output.match(/http_reqs\s+(\d+)/);

  if (p95Match)   metrics.p95           = parseFloat(p95Match[1]);
  if (p99Match)   metrics.p99           = parseFloat(p99Match[1]);
  if (avgMatch)   metrics.avg           = parseFloat(avgMatch[1]);
  if (errMatch)   metrics.errorRate     = parseFloat(errMatch[1]);
  if (rpsMatch)   metrics.rps           = parseFloat(rpsMatch[1]);
  if (totalMatch) metrics.totalRequests = parseInt(totalMatch[1]);

  // Check if thresholds failed
  if (output.includes('FAIL') || output.includes('✗')) {
    metrics.thresholdsPassed = false;
  }

  console.log(`[load] p95=${metrics.p95}ms | avg=${metrics.avg}ms | errors=${metrics.errorRate}% | rps=${metrics.rps}`);
  return metrics;
}

function checkBaseline(results, targetUrl) {
  const baselinePath = 'reports/load-baseline.json';
  const key = targetUrl.replace(/[^a-z0-9]/gi, '_');

  // Load existing baseline
  let baseline = {};
  if (fs.existsSync(baselinePath)) {
    try { baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8')); } catch(e) {}
  }

  const regression = { hasRegression: false, details: [] };

  if (baseline[key] && results.p95 && baseline[key].p95) {
    const p95Change = ((results.p95 - baseline[key].p95) / baseline[key].p95) * 100;
    if (p95Change > 20) {
      regression.hasRegression = true;
      regression.details.push(`p95 response time regression: +${p95Change.toFixed(1)}% (was ${baseline[key].p95}ms, now ${results.p95}ms)`);
    }
  }

  // Save/update baseline
  baseline[key] = { p95: results.p95, avg: results.avg, errorRate: results.errorRate, timestamp: new Date().toISOString() };
  fs.mkdirSync('reports', { recursive: true });
  fs.writeFileSync(baselinePath, JSON.stringify(baseline, null, 2));
  console.log(`[load] baseline saved to ${baselinePath}`);

  return regression;
}

function formatLoadSummary(metrics, regression) {
  const parts = [];
  if (metrics.p95)           parts.push(`p95=${metrics.p95}ms`);
  if (metrics.avg)           parts.push(`avg=${metrics.avg}ms`);
  if (metrics.errorRate !== null) parts.push(`errors=${metrics.errorRate}%`);
  if (metrics.rps)           parts.push(`rps=${metrics.rps}`);
  if (regression.hasRegression) parts.push('⚠ REGRESSION DETECTED');
  return parts.join(' | ');
}

export function formatLoadReport(loadResult) {
  const lines = ['\n--- Load test report ---'];

  if (!loadResult) {
    lines.push('  Load test not run');
    return lines.join('\n');
  }

  const m = loadResult.metrics;
  lines.push(`  Target    : ${loadResult.targetUrl}`);
  lines.push(`  Config    : ${loadResult.config.vus} VUs × ${loadResult.config.duration}`);
  lines.push('');
  lines.push(`  p95 response time : ${m.p95 ? m.p95 + 'ms' : 'n/a'}`);
  lines.push(`  p99 response time : ${m.p99 ? m.p99 + 'ms' : 'n/a'}`);
  lines.push(`  Average           : ${m.avg ? m.avg + 'ms' : 'n/a'}`);
  lines.push(`  Error rate        : ${m.errorRate !== null ? m.errorRate + '%' : 'n/a'}`);
  lines.push(`  Requests/sec      : ${m.rps || 'n/a'}`);
  lines.push(`  Total requests    : ${m.totalRequests || 'n/a'}`);
  lines.push(`  Thresholds        : ${m.thresholdsPassed ? '✓ passed' : '✗ failed'}`);

  if (loadResult.regression.hasRegression) {
    lines.push('\n  ⚠ PERFORMANCE REGRESSION DETECTED');
    loadResult.regression.details.forEach(d => lines.push(`  ${d}`));
  } else {
    lines.push('\n  ✓ No performance regression vs baseline');
  }

  return lines.join('\n');
}