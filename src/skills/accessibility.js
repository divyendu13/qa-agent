// src/skills/accessibility.js
import { chromium } from 'playwright';
import { sendMessage } from '../llm.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

export async function runAccessibilityScan({ targetUrl }) {
  console.log(`[a11y] scanning ${targetUrl}`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 15000 });

    // Inject axe-core and run
    const axePath = require.resolve('axe-core');
    await page.addScriptTag({ path: axePath });

    const results = await page.evaluate(async () => {
      return await window.axe.run(document, {
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
        }
      });
    });

    await browser.close();

    const violations = results.violations.map(v => ({
      id: v.id,
      impact: v.impact,
      description: v.description,
      wcagCriteria: v.tags.filter(t => t.startsWith('wcag')).join(', '),
      affectedCount: v.nodes.length,
      affectedElements: v.nodes.slice(0, 3).map(n => ({
        html: n.html?.slice(0, 100),
        failureSummary: n.failureSummary?.slice(0, 150)
      }))
    }));

    console.log(`[a11y] found ${violations.length} violation(s)`);

    if (violations.length === 0) {
      return {
        targetUrl,
        violationCount: 0,
        violations: [],
        findings: [],
        summary: 'No WCAG violations found — clean accessibility scan'
      };
    }

    // LLM enrichment
    const findings = await enrichA11yWithLLM(violations, targetUrl);

    const critical = findings.filter(f => f.impact === 'critical').length;
    const serious  = findings.filter(f => f.impact === 'serious').length;

    return {
      targetUrl,
      violationCount: violations.length,
      violations,
      findings,
      summary: `Found ${critical} critical, ${serious} serious, ${findings.length - critical - serious} other WCAG violations`
    };

  } catch (err) {
    await browser.close();
    throw err;
  }
}

async function enrichA11yWithLLM(violations, targetUrl) {
  console.log('[a11y] enriching violations with Claude...');

  const systemPrompt = `You are a WCAG accessibility expert.
You will be given axe-core accessibility violations from a web page.
For each violation, provide expert analysis.

Return ONLY a valid JSON array — no markdown, no explanation, start with [ end with ].
Each object must have exactly these fields:
{
  "id": "axe rule id",
  "impact": "critical | serious | moderate | minor",
  "wcagCriteria": "e.g. wcag2aa, wcag1.1.1",
  "plainEnglish": "what this means for a real user — be specific",
  "affectedUsers": "which users are affected e.g. screen reader users, keyboard-only users",
  "remediation": "specific code fix with example if possible",
  "priority": "fix immediately | fix soon | fix when possible"
}`;

  const userMessage = `Analyze these WCAG violations for ${targetUrl}.

VIOLATIONS:
${JSON.stringify(violations.map(v => ({
    id: v.id,
    impact: v.impact,
    description: v.description,
    wcagCriteria: v.wcagCriteria,
    affectedCount: v.affectedCount,
    sample: v.affectedElements[0]
  })), null, 2)}

Return a JSON array with one analysis object per violation.`;

  const raw = await sendMessage(systemPrompt, userMessage);
  const jsonMatch = raw.match(/\[[\s\S]*\]/);

  if (!jsonMatch) {
    console.log('[a11y] LLM enrichment parse error — returning raw violations');
    return violations.map(v => ({
      id: v.id,
      impact: v.impact,
      wcagCriteria: v.wcagCriteria,
      plainEnglish: v.description,
      affectedUsers: 'Users with disabilities',
      remediation: 'Review and fix manually',
      priority: v.impact === 'critical' ? 'fix immediately' : 'fix soon'
    }));
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch(e) {
    console.log('[a11y] JSON parse failed on enrichment');
    return [];
  }
}

export function formatA11yReport(a11yResult) {
  const lines = ['\n--- Accessibility scan report ---'];

  if (!a11yResult || a11yResult.violationCount === 0) {
    lines.push('  No WCAG violations found');
    return lines.join('\n');
  }

  lines.push(`  Standard  : WCAG 2.1 AA`);
  lines.push(`  Violations: ${a11yResult.violationCount}`);
  lines.push(`  Summary   : ${a11yResult.summary}\n`);

  const order = ['critical','serious','moderate','minor'];
  const sorted = [...(a11yResult.findings || [])].sort(
    (a,b) => order.indexOf(a.impact) - order.indexOf(b.impact)
  );

  sorted.forEach((f, i) => {
    const icon = {critical:'🔴',serious:'🟠',moderate:'🟡',minor:'🟢'}[f.impact] || '⚪';
    lines.push(`  Violation ${i+1}: ${f.id}`);
    lines.push(`  ${icon} ${f.impact?.toUpperCase()} — ${f.wcagCriteria}`);
    lines.push(`  Impact    : ${f.plainEnglish}`);
    lines.push(`  Affects   : ${f.affectedUsers}`);
    lines.push(`  Fix       : ${f.remediation}`);
    lines.push(`  Priority  : ${f.priority}`);
    lines.push('');
  });

  return lines.join('\n');
}