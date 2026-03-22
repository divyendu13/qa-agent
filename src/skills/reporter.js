// src/skills/reporter.js
import fs from 'fs';
import path from 'path';

export function generateHtmlReport(agentRun) {
  const {
    url, mode, timestamp, steps,
    testResults, triage,
    securityResult, a11yResult, loadResult
  } = agentRun;

  const ts = new Date(timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  // ── Compute summary scores ───────────────────────
  const functional = {
    passed: testResults?.passed || 0,
    failed: testResults?.failed || 0,
    total:  testResults?.total  || 0,
    score:  testResults?.total  ? Math.round((testResults.passed / testResults.total) * 100) : 0
  };

  const security = {
    critical: (securityResult?.findings || []).filter(f => f.severity === 'critical').length,
    high:     (securityResult?.findings || []).filter(f => f.severity === 'high').length,
    medium:   (securityResult?.findings || []).filter(f => f.severity === 'medium').length,
    low:      (securityResult?.findings || []).filter(f => f.severity === 'low').length,
    total:    securityResult?.uniqueCount || 0,
    score:    securityResult ? (securityResult.findings?.filter(f => ['critical','high'].includes(f.severity)).length === 0 ? 100 : 40) : null
  };

  const a11y = {
    critical: (a11yResult?.findings || []).filter(f => f.impact === 'critical').length,
    serious:  (a11yResult?.findings || []).filter(f => f.impact === 'serious').length,
    moderate: (a11yResult?.findings || []).filter(f => f.impact === 'moderate').length,
    total:    a11yResult?.violationCount || 0,
    score:    a11yResult ? (a11yResult.violationCount === 0 ? 100 : Math.max(0, 100 - (a11yResult.violationCount * 15))) : null
  };

  const load = {
    p95:       loadResult?.metrics?.p95 || null,
    avg:       loadResult?.metrics?.avg || null,
    errorRate: loadResult?.metrics?.errorRate || null,
    rps:       loadResult?.metrics?.rps || null,
    total:     loadResult?.metrics?.totalRequests || null,
    passed:    loadResult?.metrics?.thresholdsPassed,
    regression: loadResult?.regression?.hasRegression || false,
    score:     loadResult ? (loadResult.metrics?.thresholdsPassed && !loadResult.regression?.hasRegression ? 100 : 50) : null
  };

  const overallScore = Math.round(
    [functional.score, security.score, a11y.score, load.score]
      .filter(s => s !== null)
      .reduce((a, b) => a + b, 0) /
    [functional.score, security.score, a11y.score, load.score]
      .filter(s => s !== null).length
  );

  // ── Quality gate ─────────────────────────────────
  const qualityGate = {
    passed: security.critical === 0 && security.high === 0 &&
            a11y.critical === 0 && functional.failed === 0 &&
            !load.regression,
    reasons: []
  };
  if (security.critical > 0 || security.high > 0) qualityGate.reasons.push(`${security.critical + security.high} critical/high security findings`);
  if (a11y.critical > 0) qualityGate.reasons.push(`${a11y.critical} critical accessibility violations`);
  if (functional.failed > 0) qualityGate.reasons.push(`${functional.failed} failing tests`);
  if (load.regression) qualityGate.reasons.push('performance regression detected');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>QA-Agent Report — ${new URL(url).hostname}</title>
<style>
  :root {
    --green: #1D9E75; --green-light: #E1F5EE; --green-dark: #085041;
    --red: #E24B4A; --red-light: #FCEBEB; --red-dark: #791F1F;
    --amber: #BA7517; --amber-light: #FAEEDA; --amber-dark: #633806;
    --blue: #185FA5; --blue-light: #E6F1FB; --blue-dark: #0C447C;
    --purple: #534AB7; --purple-light: #EEEDFE; --purple-dark: #3C3489;
    --gray: #5F5E5A; --gray-light: #F1EFE8; --gray-dark: #2C2C2A;
    --text: #1a1a1a; --text-muted: #6b6b6b; --border: #e5e5e5;
    --bg: #f8f8f6; --card: #ffffff;
    --radius: 10px; --radius-sm: 6px;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); font-size: 14px; line-height: 1.6; }
  a { color: var(--blue); text-decoration: none; }

  /* Layout */
  .container { max-width: 1100px; margin: 0 auto; padding: 2rem 1.5rem; }

  /* Header */
  .report-header { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 2rem; margin-bottom: 1.5rem; }
  .report-header h1 { font-size: 22px; font-weight: 600; margin-bottom: 4px; }
  .report-header .meta { font-size: 13px; color: var(--text-muted); display: flex; gap: 1.5rem; flex-wrap: wrap; margin-top: 8px; }
  .report-header .meta span::before { content: ''; margin-right: 4px; }

  /* Quality gate */
  .gate { padding: 14px 18px; border-radius: var(--radius-sm); margin-bottom: 1.5rem; display: flex; align-items: center; gap: 12px; font-weight: 500; }
  .gate.pass { background: var(--green-light); color: var(--green-dark); border: 1px solid #9FE1CB; }
  .gate.fail { background: var(--red-light); color: var(--red-dark); border: 1px solid #F7C1C1; }
  .gate-icon { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; flex-shrink: 0; }
  .gate.pass .gate-icon { background: var(--green); color: white; }
  .gate.fail .gate-icon { background: var(--red); color: white; }
  .gate-reasons { font-size: 12px; font-weight: 400; margin-top: 2px; }

  /* Score cards */
  .scores { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 1.5rem; }
  .score-card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 1.25rem; text-align: center; }
  .score-card .label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); margin-bottom: 8px; }
  .score-num { font-size: 36px; font-weight: 700; line-height: 1; margin-bottom: 4px; }
  .score-sub { font-size: 12px; color: var(--text-muted); }
  .score-green { color: var(--green); }
  .score-amber { color: var(--amber); }
  .score-red   { color: var(--red); }
  .score-blue  { color: var(--blue); }

  /* Steps timeline */
  .section { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); margin-bottom: 1.5rem; overflow: hidden; }
  .section-header { padding: 1rem 1.25rem; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 10px; }
  .section-title { font-size: 15px; font-weight: 600; }
  .section-badge { font-size: 11px; padding: 2px 10px; border-radius: 10px; }
  .section-body { padding: 1.25rem; }

  .timeline { display: flex; flex-direction: column; gap: 8px; }
  .step { display: flex; align-items: flex-start; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--border); }
  .step:last-child { border-bottom: none; }
  .step-num { width: 24px; height: 24px; border-radius: 50%; background: var(--blue-light); color: var(--blue-dark); font-size: 11px; font-weight: 600; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px; }
  .step-skill { font-size: 12px; font-weight: 600; color: var(--blue); min-width: 80px; margin-top: 2px; }
  .step-reason { font-size: 13px; color: var(--text); flex: 1; }
  .step-result { font-size: 12px; color: var(--text-muted); margin-top: 2px; }

  /* Test results table */
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; padding: 8px 12px; background: var(--gray-light); font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); border-bottom: 1px solid var(--border); }
  td { padding: 10px 12px; border-bottom: 1px solid var(--border); vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: var(--bg); }
  .pill { display: inline-block; font-size: 11px; padding: 2px 9px; border-radius: 10px; font-weight: 500; }
  .pill-pass     { background: var(--green-light); color: var(--green-dark); }
  .pill-fail     { background: var(--red-light);   color: var(--red-dark); }
  .pill-critical { background: #FCEBEB; color: #791F1F; }
  .pill-high     { background: #FAEEDA; color: #633806; }
  .pill-medium   { background: #FFF3CD; color: #856404; }
  .pill-low      { background: var(--green-light); color: var(--green-dark); }
  .pill-info     { background: var(--gray-light);  color: var(--gray-dark); }
  .pill-serious  { background: #FAEEDA; color: #633806; }
  .pill-moderate { background: #FFF3CD; color: #856404; }
  .pill-minor    { background: var(--gray-light);  color: var(--gray-dark); }

  /* Metric cards */
  .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin-bottom: 1rem; }
  .metric { background: var(--bg); border-radius: var(--radius-sm); padding: 12px; text-align: center; }
  .metric-val { font-size: 24px; font-weight: 700; color: var(--text); }
  .metric-lbl { font-size: 11px; color: var(--text-muted); margin-top: 2px; }

  /* Triage */
  .triage-card { background: var(--amber-light); border: 1px solid #FAC775; border-radius: var(--radius-sm); padding: 14px; margin-bottom: 10px; }
  .triage-title { font-weight: 600; margin-bottom: 6px; color: var(--amber-dark); }
  .triage-row { display: flex; gap: 8px; font-size: 12px; margin-top: 4px; }
  .triage-label { color: var(--text-muted); min-width: 90px; }
  .triage-val { color: var(--text); flex: 1; }

  /* Footer */
  .footer { text-align: center; font-size: 12px; color: var(--text-muted); padding: 2rem 0 1rem; }

  /* Responsive */
  @media (max-width: 600px) {
    .scores { grid-template-columns: repeat(2, 1fr); }
    .metrics-grid { grid-template-columns: repeat(2, 1fr); }
  }
</style>
</head>
<body>
<div class="container">

  <!-- Header -->
  <div class="report-header">
    <h1>QA-Agent quality report</h1>
    <div style="font-size:13px;color:var(--text-muted);margin-top:4px">
      <a href="${url}" target="_blank">${url}</a>
    </div>
    <div class="meta">
      <span>Generated: ${ts}</span>
      <span>Mode: ${mode}</span>
      <span>Steps: ${steps?.length || 0}</span>
      <span>Powered by Claude via AWS Bedrock</span>
    </div>
  </div>

  <!-- Quality gate -->
  <div class="gate ${qualityGate.passed ? 'pass' : 'fail'}">
    <div class="gate-icon">${qualityGate.passed ? '✓' : '✗'}</div>
    <div>
      <div>Quality gate: ${qualityGate.passed ? 'PASSED — safe to merge' : 'FAILED — do not merge'}</div>
      ${!qualityGate.passed ? `<div class="gate-reasons">Blocking: ${qualityGate.reasons.join(' · ')}</div>` : ''}
    </div>
  </div>

  <!-- Score cards -->
  <div class="scores">
    <div class="score-card">
      <div class="label">Overall</div>
      <div class="score-num ${overallScore >= 80 ? 'score-green' : overallScore >= 60 ? 'score-amber' : 'score-red'}">${overallScore}</div>
      <div class="score-sub">quality score</div>
    </div>
    <div class="score-card">
      <div class="label">Functional</div>
      <div class="score-num ${functional.score === 100 ? 'score-green' : functional.score >= 70 ? 'score-amber' : 'score-red'}">${functional.passed}<span style="font-size:18px;font-weight:400">/${functional.total}</span></div>
      <div class="score-sub">tests passing</div>
    </div>
    <div class="score-card">
      <div class="label">Security</div>
      <div class="score-num ${security.critical + security.high === 0 ? 'score-green' : 'score-red'}">${security.total}</div>
      <div class="score-sub">${security.critical + security.high} critical/high</div>
    </div>
    <div class="score-card">
      <div class="label">Accessibility</div>
      <div class="score-num ${a11y.critical === 0 && a11y.serious === 0 ? 'score-green' : a11y.critical === 0 ? 'score-amber' : 'score-red'}">${a11y.total}</div>
      <div class="score-sub">${a11y.critical} critical, ${a11y.serious} serious</div>
    </div>
    <div class="score-card">
      <div class="label">Performance</div>
      <div class="score-num ${load.p95 ? (load.p95 < 500 ? 'score-green' : load.p95 < 1500 ? 'score-amber' : 'score-red') : 'score-blue'}">${load.p95 ? load.p95 + '<span style="font-size:16px">ms</span>' : 'n/a'}</div>
      <div class="score-sub">p95 response time</div>
    </div>
  </div>

  <!-- Agent steps timeline -->
  <div class="section">
    <div class="section-header">
      <div class="section-title">Agent execution trace</div>
      <span class="section-badge pill pill-pass">${steps?.length || 0} steps</span>
    </div>
    <div class="section-body">
      <div class="timeline">
        ${(steps || []).map(s => `
        <div class="step">
          <div class="step-num">${s.step}</div>
          <div style="flex:1">
            <div style="display:flex;align-items:center;gap:8px">
              <span class="step-skill">${s.skill}</span>
              <span class="pill pill-${s.status === 'success' ? 'pass' : 'fail'}">${s.status}</span>
            </div>
            <div class="step-reason">${s.reason}</div>
            <div class="step-result">${s.summary || ''}</div>
          </div>
        </div>`).join('')}
      </div>
    </div>
  </div>

  <!-- Functional tests -->
  <div class="section">
    <div class="section-header">
      <div class="section-title">Functional tests</div>
      <span class="section-badge pill ${functional.failed === 0 ? 'pill-pass' : 'pill-fail'}">${functional.passed}/${functional.total} passing</span>
    </div>
    <div class="section-body">
      ${testResults?.tests?.length ? `
      <table>
        <thead><tr><th>Test</th><th>Status</th><th>Duration</th></tr></thead>
        <tbody>
          ${testResults.tests.map(t => `
          <tr>
            <td>${t.title}</td>
            <td><span class="pill pill-${t.status === 'passed' ? 'pass' : 'fail'}">${t.status}</span></td>
            <td>${t.duration ? t.duration + 'ms' : '—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>` : '<div style="color:var(--text-muted);font-size:13px">No test results available</div>'}

      ${triage && !triage.allPassed && triage.failures?.length ? `
      <div style="margin-top:1rem">
        <div style="font-size:13px;font-weight:600;margin-bottom:8px;color:var(--amber-dark)">Failure triage</div>
        ${triage.failures.map(f => `
        <div class="triage-card">
          <div class="triage-title">${f.testName}</div>
          <div class="triage-row"><span class="triage-label">Severity</span><span class="triage-val"><span class="pill pill-${f.severity}">${f.severity?.toUpperCase()}</span></span></div>
          <div class="triage-row"><span class="triage-label">Category</span><span class="triage-val">${f.category}</span></div>
          <div class="triage-row"><span class="triage-label">Root cause</span><span class="triage-val">${f.rootCause}</span></div>
          <div class="triage-row"><span class="triage-label">Suggested fix</span><span class="triage-val">${f.suggestedFix}</span></div>
        </div>`).join('')}
      </div>` : ''}
    </div>
  </div>

  <!-- Security -->
  <div class="section">
    <div class="section-header">
      <div class="section-title">Security — OWASP Top 10</div>
      <span class="section-badge pill ${security.critical + security.high === 0 ? 'pill-pass' : 'pill-fail'}">${security.total} findings</span>
    </div>
    <div class="section-body">
      ${securityResult?.findings?.length ? `
      <table>
        <thead><tr><th>Finding</th><th>OWASP</th><th>Severity</th><th>Remediation</th></tr></thead>
        <tbody>
          ${securityResult.findings.map(f => `
          <tr>
            <td>
              <div style="font-weight:500">${f.alertName || f.name || 'Unknown'}</div>
              <div style="font-size:12px;color:var(--text-muted);margin-top:2px">${(f.riskNarrative || f.description || '').slice(0, 120)}${(f.riskNarrative || f.description || '').length > 120 ? '…' : ''}</div>
            </td>
            <td style="white-space:nowrap"><span style="font-size:12px">${f.owaspId || '—'}</span></td>
            <td><span class="pill pill-${f.severity || 'info'}">${(f.severity || 'info').toUpperCase()}</span></td>
            <td style="font-size:12px">${(f.remediation || f.solution || '—').slice(0, 100)}${(f.remediation || f.solution || '').length > 100 ? '…' : ''}</td>
          </tr>`).join('')}
        </tbody>
      </table>` : '<div style="color:var(--text-muted);font-size:13px">Security scan not run or no findings</div>'}
    </div>
  </div>

  <!-- Accessibility -->
  <div class="section">
    <div class="section-header">
      <div class="section-title">Accessibility — WCAG 2.1 AA</div>
      <span class="section-badge pill ${a11y.total === 0 ? 'pill-pass' : a11y.critical === 0 ? 'pill-high' : 'pill-fail'}">${a11y.total} violations</span>
    </div>
    <div class="section-body">
      ${a11yResult?.findings?.length ? `
      <table>
        <thead><tr><th>Violation</th><th>WCAG</th><th>Impact</th><th>Affects</th><th>Priority</th></tr></thead>
        <tbody>
          ${a11yResult.findings.map(f => `
          <tr>
            <td>
              <div style="font-weight:500;font-family:monospace;font-size:12px">${f.id}</div>
              <div style="font-size:12px;color:var(--text-muted);margin-top:2px">${(f.plainEnglish || f.description || '').slice(0, 120)}</div>
            </td>
            <td style="font-size:12px;white-space:nowrap">${f.wcagCriteria || '—'}</td>
            <td><span class="pill pill-${f.impact}">${(f.impact || '—').toUpperCase()}</span></td>
            <td style="font-size:12px">${f.affectedUsers || '—'}</td>
            <td style="font-size:12px">${f.priority || '—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>` : '<div style="color:var(--text-muted);font-size:13px">No WCAG violations found</div>'}
    </div>
  </div>

  <!-- Load test -->
  <div class="section">
    <div class="section-header">
      <div class="section-title">Performance — k6 load test</div>
      <span class="section-badge pill ${load.regression ? 'pill-fail' : 'pill-pass'}">${load.regression ? 'regression' : load.p95 ? 'baseline saved' : 'not run'}</span>
    </div>
    <div class="section-body">
      ${loadResult ? `
      <div class="metrics-grid">
        <div class="metric"><div class="metric-val">${load.p95 ? load.p95 + 'ms' : 'n/a'}</div><div class="metric-lbl">p95 response</div></div>
        <div class="metric"><div class="metric-val">${load.avg ? load.avg + 'ms' : 'n/a'}</div><div class="metric-lbl">avg response</div></div>
        <div class="metric"><div class="metric-val">${load.errorRate !== null ? load.errorRate + '%' : 'n/a'}</div><div class="metric-lbl">error rate</div></div>
        <div class="metric"><div class="metric-val">${load.rps || 'n/a'}</div><div class="metric-lbl">req/sec</div></div>
        <div class="metric"><div class="metric-val">${load.total || 'n/a'}</div><div class="metric-lbl">total requests</div></div>
        <div class="metric"><div class="metric-val">${loadResult.config?.vus || '—'}</div><div class="metric-lbl">virtual users</div></div>
      </div>
      <div style="font-size:13px;padding:8px 12px;border-radius:var(--radius-sm);background:${load.regression ? 'var(--red-light)' : 'var(--green-light)'};color:${load.regression ? 'var(--red-dark)' : 'var(--green-dark)'}">
        ${load.regression ? '⚠ Performance regression detected vs baseline' : '✓ No regression vs baseline'}
      </div>
      ${load.regression && loadResult.regression?.details?.length ? `
      <ul style="margin-top:8px;font-size:12px;color:var(--red-dark);padding-left:1.2rem">
        ${loadResult.regression.details.map(d => `<li>${d}</li>`).join('')}
      </ul>` : ''}
      ` : '<div style="color:var(--text-muted);font-size:13px">Load test not run</div>'}
    </div>
  </div>

  <div class="footer">
    Generated by <strong>QA-Agent</strong> — autonomous quality engineering powered by Claude (AWS Bedrock) · <a href="https://github.com/divyendu13/qa-agent">github.com/divyendu13/qa-agent</a>
  </div>

</div>
</body>
</html>`;

  const filename = `qa-report-${Date.now()}.html`;
  const outputPath = path.join('reports', filename);
  fs.mkdirSync('reports', { recursive: true });
  fs.writeFileSync(outputPath, html, 'utf8');
  console.log(`[reporter] HTML report saved to ${outputPath}`);
  return outputPath;
}