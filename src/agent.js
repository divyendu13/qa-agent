import { decideNextAction, analyzePageAndPlan } from './llm.js';
import { launchBrowser, navigateTo, getPageContent, closeBrowser } from './skills/browse.js';
import { generateTestFile } from './skills/generate.js';
import { runTests } from './skills/runner.js';
import { triageFailures, formatTriageReport } from './skills/triage.js';
import { runSecurityScan, formatSecurityReport } from './skills/security.js';
import fs from 'fs';

// ── Parse CLI args ───────────────────────────────────
const args = process.argv.slice(2);
const getArg = (flag, def) => {
    const i = args.indexOf(flag);
    return i !== -1 && args[i + 1] ? args[i + 1] : def;
};

const TARGET_URL = getArg('--url', 'https://demo.playwright.dev/todomvc');
const MODE = getArg('--mode', 'functional'); // functional | full
const MAX_STEPS = 10; // safety limit — prevent infinite loops

// ── Agent state ──────────────────────────────────────
const agentState = {
    url: TARGET_URL,
    mode: MODE,
    steps: [],
    lastResult: null,
    pageContent: null,
    plan: null,
    generatedFile: null,
    testResults: null,
    triageResult: null,
    securityResult: null,
};

// ── Skill execution map ──────────────────────────────
async function executeSkill(skill, params) {
    switch (skill) {

        case 'browse': {
            console.log('[agent] skill: browse');
            await launchBrowser({ headless: true });
            await navigateTo(agentState.url);
            agentState.pageContent = await getPageContent();
            agentState.plan = await analyzePageAndPlan(agentState.pageContent);
            await closeBrowser();
            const summary = `Browsed ${agentState.url}. Found ${agentState.plan.testableActions.length} testable actions: ${agentState.plan.testableActions.slice(0, 3).join(', ')}`;
            console.log(`[agent] ${summary}`);
            return { status: 'success', summary };
        }

        case 'generate': {
            console.log('[agent] skill: generate');
            if (!agentState.plan) return { status: 'skipped', summary: 'No page plan available — browse first' };
            const { outputPath, code } = await generateTestFile({
                pageDescription: agentState.plan.pageDescription,
                testableActions: agentState.plan.testableActions,
                url: agentState.url,
                filename: 'agent-generated.spec.js'
            });
            agentState.generatedFile = { path: outputPath, code };
            const summary = `Generated test file at ${outputPath}`;
            console.log(`[agent] ${summary}`);
            return { status: 'success', summary };
        }

        case 'run': {
            console.log('[agent] skill: run');
            if (!agentState.generatedFile) return { status: 'skipped', summary: 'No test file — generate first' };
            agentState.testResults = await runTests(agentState.generatedFile.path);
            const summary = `Tests run: ${agentState.testResults.passed} passed, ${agentState.testResults.failed} failed out of ${agentState.testResults.total} total`;
            console.log(`[agent] ${summary}`);
            return { status: 'success', summary };
        }

        case 'triage': {
            console.log('[agent] skill: triage');
            if (!agentState.testResults) return { status: 'skipped', summary: 'No test results — run tests first' };
            agentState.triageResult = await triageFailures(
                agentState.testResults,
                agentState.generatedFile?.code || ''
            );
            const failCount = agentState.triageResult.failures?.length || 0;
            const summary = failCount > 0
                ? `Triaged ${failCount} failure(s). Top issue: ${agentState.triageResult.failures[0]?.rootCause}`
                : 'All tests passed — no triage needed';
            console.log(`[agent] ${summary}`);
            return { status: 'success', summary };
        }

        case 'security': {
            console.log('[agent] skill: security');
            const scanMode = agentState.mode === 'full' ? 'active' : 'passive';
            agentState.securityResult = await runSecurityScan({
                targetUrl: agentState.url,
                mode: scanMode
            });
            const summary = agentState.securityResult.summary;
            console.log(`[agent] ${summary}`);
            return { status: 'success', summary };
        }

        default:
            return { status: 'unknown', summary: `Unknown skill: ${skill}` };
    }
}

// ── Save final report ────────────────────────────────
function saveReport() {
    fs.mkdirSync('reports', { recursive: true });
    const report = {
        timestamp: new Date().toISOString(),
        url: TARGET_URL,
        mode: MODE,
        steps: agentState.steps,
        plan: agentState.plan,
        testResults: agentState.testResults,
        triage: agentState.triageResult,
        security: agentState.securityResult,
    };
    const outPath = `reports/agent-run-${Date.now()}.json`;
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    return outPath;
}

// ── Print final summary ──────────────────────────────
function printSummary() {
    console.log('\n════════════════════════════════════');
    console.log('  QA-Agent run complete');
    console.log('════════════════════════════════════');
    console.log(`  URL    : ${TARGET_URL}`);
    console.log(`  Mode   : ${MODE}`);
    console.log(`  Steps  : ${agentState.steps.length}`);

    if (agentState.testResults) {
        console.log(`  Tests  : ${agentState.testResults.passed} passed, ${agentState.testResults.failed} failed`);
        if (agentState.testResults.tests.length > 0) {
            agentState.testResults.tests.forEach(t => {
                const icon = t.status === 'passed' ? '  ✓' : '  ✗';
                console.log(`${icon}  ${t.title} (${t.duration}ms)`);
            });
        }
    }

    if (agentState.triageResult && !agentState.triageResult.allPassed) {
        console.log(formatTriageReport(agentState.triageResult, agentState.testResults));
    }

    if (agentState.securityResult) {
        console.log(formatSecurityReport(agentState.securityResult));
    }

    console.log('════════════════════════════════════\n');
}

// ── Main ReAct loop ──────────────────────────────────
async function run() {
    console.log('\n╔════════════════════════════════════╗');
    console.log('║         QA-Agent v0.3.0            ║');
    console.log('╚════════════════════════════════════╝');
    console.log(`  Target : ${TARGET_URL}`);
    console.log(`  Mode   : ${MODE}`);
    console.log(`  Max    : ${MAX_STEPS} steps\n`);

    for (let step = 1; step <= MAX_STEPS; step++) {
        console.log(`\n── Step ${step} ──────────────────────────`);

        // Ask Claude what to do next
        const decision = await decideNextAction(agentState);
        console.log(`[agent] decided: ${decision.skill} — ${decision.reason}`);

        // Stop if Claude says done
        if (decision.skill === 'done') {
            console.log('[agent] task complete — exiting loop');
            break;
        }

        // Execute the chosen skill
        const result = await executeSkill(decision.skill, decision.params);

        // Record the step
        agentState.steps.push({
            step,
            skill: decision.skill,
            reason: decision.reason,
            status: result.status,
            summary: result.summary,
        });

        // Update last result for next decision
        agentState.lastResult = result.summary;

        // Safety: if step limit hit
        if (step === MAX_STEPS) {
            console.log('[agent] max steps reached — stopping');
        }
    }

    printSummary();
    const reportPath = saveReport();
    console.log(`[agent] full report saved to ${reportPath}\n`);
}

run().catch(console.error);