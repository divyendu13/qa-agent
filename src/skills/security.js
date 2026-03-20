import { sendMessage } from '../llm.js';
import { chromium } from 'playwright';

const ZAP_BASE = process.env.ZAP_PROXY_URL || 'http://localhost:8080';
const ZAP_API_KEY = process.env.ZAP_API_KEY || 'qaagent123';

// ── ZAP API helpers ──────────────────────────────────

async function zapGet(path) {
  const url = `${ZAP_BASE}${path}&apikey=${ZAP_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ZAP API error: ${res.status} on ${path}`);
  return res.json();
}

async function waitForZap(maxWaitMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      await zapGet('/JSON/core/view/version/?');
      console.log('[security] ZAP is ready');
      return true;
    } catch {
      console.log('[security] waiting for ZAP to start...');
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  throw new Error('ZAP did not start within timeout');
}

async function waitForPassiveScan() {
  console.log('[security] waiting for passive scan to complete...');
  while (true) {
    const data = await zapGet('/JSON/pscan/view/recordsToScan/?');
    const remaining = parseInt(data.recordsToScan || '0');
    if (remaining === 0) break;
    console.log(`[security] passive scan: ${remaining} records remaining...`);
    await new Promise(r => setTimeout(r, 2000));
  }
  console.log('[security] passive scan complete');
}

async function waitForActiveScan(scanId) {
  console.log('[security] running active scan...');
  while (true) {
    const data = await zapGet(`/JSON/ascan/view/status/?scanId=${scanId}`);
    const progress = parseInt(data.status || '0');
    console.log(`[security] active scan progress: ${progress}%`);
    if (progress >= 100) break;
    await new Promise(r => setTimeout(r, 3000));
  }
  console.log('[security] active scan complete');
}

// ── Main security scan ───────────────────────────────

export async function runSecurityScan({ targetUrl, mode = 'passive' }) {
  console.log(`[security] starting ${mode} scan on ${targetUrl}`);

  // 1. Verify ZAP is up
  await waitForZap();

  // 2. Clear previous session
  await zapGet('/JSON/core/action/newSession/?name=qa-agent&overwrite=true');
  console.log('[security] ZAP session cleared');

  // 3. Launch Playwright browser through ZAP proxy
  console.log('[security] launching browser through ZAP proxy...');
  const browser = await chromium.launch({
    headless: true,
    args: [
      `--proxy-server=localhost:8080`,
      '--ignore-certificate-errors',
      '--disable-web-security'
    ]
  });

  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  // 4. Browse the app — ZAP records every request passively
  try {
    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 15000 });
    console.log('[security] browsed target — ZAP recording traffic');

    // Interact with the app so ZAP sees more surface area
    const inputVisible = await page.locator('input').first().isVisible().catch(() => false);
    if (inputVisible) {
      await page.locator('input').first().fill('test-security-probe');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1000);
    }

    await page.waitForTimeout(2000);
  } catch (err) {
    console.log(`[security] browse warning: ${err.message}`);
  } finally {
    await browser.close();
  }

  // 5. Wait for passive scan
  await waitForPassiveScan();

  // 6. Run active scan if requested
  if (mode === 'active') {
    const scanData = await zapGet(`/JSON/ascan/action/scan/?url=${encodeURIComponent(targetUrl)}&recurse=true`);
    await waitForActiveScan(scanData.scan);
  }

  // 7. Fetch all alerts
  const alertData = await zapGet(`/JSON/core/view/alerts/?baseurl=${encodeURIComponent(targetUrl)}`);
  const rawAlerts = alertData.alerts || [];
  console.log(`[security] found ${rawAlerts.length} raw alert(s)`);

  if (rawAlerts.length === 0) {
    return {
      scanMode: mode,
      targetUrl,
      alertCount: 0,
      findings: [],
      summary: 'No alerts found — clean scan'
    };
  }

  // 8. Deduplicate alerts by name
  const seen = new Set();
  const uniqueAlerts = rawAlerts.filter(a => {
    if (seen.has(a.name)) return false;
    seen.add(a.name);
    return true;
  });

    // 9. LLM enrichment — the AI security analyst layer
    const topAlerts = uniqueAlerts
        .sort((a, b) => {
            const order = ['High', 'Medium', 'Low', 'Informational'];
            return order.indexOf(a.risk) - order.indexOf(b.risk);
        })
        .slice(0, 8);

    const findings = await enrichWithLLM(topAlerts, targetUrl);


  return {
    scanMode: mode,
    targetUrl,
    alertCount: rawAlerts.length,
    uniqueCount: uniqueAlerts.length,
    findings,
    summary: `Found ${findings.filter(f => f.severity === 'high' || f.severity === 'critical').length} high/critical, ${findings.filter(f => f.severity === 'medium').length} medium, ${findings.filter(f => f.severity === 'low').length} low severity issues`
  };
}

// ── LLM enrichment — AI security analyst layer ───────

async function enrichWithLLM(alerts, targetUrl) {
  console.log('[security] enriching alerts with Claude...');

  const systemPrompt = `You are a senior application security engineer.
You will be given raw OWASP ZAP security alerts for a web application.
For each alert, provide a security analysis.

Return ONLY a valid JSON array — no markdown, no explanation, start with [ and end with ].
Each object must have exactly these fields:
{
  "alertName": "name from ZAP",
  "owaspId": "e.g. A05:2021",
  "owaspName": "e.g. Security Misconfiguration",
  "severity": "critical | high | medium | low | info",
  "riskNarrative": "plain English — what could an attacker do with this?",
  "exploitability": "easy | moderate | difficult",
  "remediation": "specific actionable fix",
  "affectedUrl": "the URL where this was found"
}`;

  const userMessage = `Analyze these ZAP security alerts for ${targetUrl}.
Map each to OWASP Top 10 2021 and provide risk analysis.

ALERTS:
${JSON.stringify(alerts.map(a => ({
    name: a.name,
    risk: a.risk,
    description: a.description?.slice(0, 200),
    url: a.url,
    solution: a.solution?.slice(0, 150)
  })), null, 2)}

Return a JSON array with one object per alert.`;

  const raw = await sendMessage(systemPrompt, userMessage);

  // Extract JSON array from response
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.log('[security] LLM enrichment parse error — returning raw alerts');
    return alerts.map(a => ({
      alertName: a.name,
      owaspId: 'Unknown',
      owaspName: 'Unknown',
      severity: a.risk?.toLowerCase() || 'info',
      riskNarrative: a.description?.slice(0, 200) || 'No description',
      exploitability: 'unknown',
      remediation: a.solution?.slice(0, 200) || 'Review manually',
      affectedUrl: a.url
    }));
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch(e) {
    console.log('[security] JSON parse failed on enrichment');
    return [];
  }
}

export function formatSecurityReport(securityResult) {
  const lines = ['\n--- Security scan report ---'];

  if (!securityResult || securityResult.alertCount === 0) {
    lines.push('  No security alerts found');
    return lines.join('\n');
  }

  lines.push(`  Scan mode : ${securityResult.scanMode}`);
  lines.push(`  Total     : ${securityResult.alertCount} alerts (${securityResult.uniqueCount} unique)`);
  lines.push(`  Summary   : ${securityResult.summary}\n`);

  const order = ['critical','high','medium','low','info'];
  const sorted = [...(securityResult.findings || [])].sort(
    (a,b) => order.indexOf(a.severity) - order.indexOf(b.severity)
  );

  sorted.forEach((f, i) => {
    const icon = {critical:'🔴',high:'🟠',medium:'🟡',low:'🟢',info:'⚪'}[f.severity] || '⚪';
    lines.push(`  Finding ${i+1}: ${f.alertName}`);
    lines.push(`  ${icon} ${f.severity.toUpperCase()} — ${f.owaspId} ${f.owaspName}`);
    lines.push(`  Risk      : ${f.riskNarrative}`);
    lines.push(`  Fix       : ${f.remediation}`);
    lines.push('');
  });

  return lines.join('\n');
}