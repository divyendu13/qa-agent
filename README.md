# QA-Agent 🤖

> An autonomous AI agent that browses a web app, generates Playwright tests, runs them, triages failures, scans for OWASP security vulnerabilities, checks WCAG accessibility, and runs k6 load tests — all from a single command.

[![CI](https://github.com/divyendu13/qa-agent/actions/workflows/qa-agent.yml/badge.svg)](https://github.com/divyendu13/qa-agent/actions/workflows/qa-agent.yml)
[![Live Report](https://img.shields.io/badge/live%20report-netlify-00C7B7)](https://qa-agent-report.netlify.app/)
[![Node](https://img.shields.io/badge/node-22.x-brightgreen)](https://nodejs.org)
[![Playwright](https://img.shields.io/badge/playwright-1.x-blue)](https://playwright.dev)
[![k6](https://img.shields.io/badge/load-k6-7D64FF)](https://k6.io)
[![OWASP](https://img.shields.io/badge/security-OWASP%20Top%2010-red)](https://owasp.org/Top10/)
[![WCAG](https://img.shields.io/badge/accessibility-WCAG%202.1%20AA-purple)](https://www.w3.org/WAI/WCAG21/quickref/)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow)](LICENSE)

---

## Live report

Every CI run auto-deploys the full quality report to Netlify:

**[qa-agent-report.netlify.app](https://qa-agent-report.netlify.app/)**

No download. No zip. Click and see the full report — functional results, OWASP findings, WCAG violations, k6 load metrics — all in one page.

---

## What it does

Most test automation tools need a human to write the tests. QA-Agent doesn't.

Give it a URL. It figures out the rest.

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐     ┌─────────────┐
│  Browse app │ ──▶ │ Claude reads │ ──▶ │ Writes and runs  │ ──▶ │  Triages    │
│  via        │     │ the page,    │     │ Playwright tests  │     │  failures   │
│  Playwright │     │ plans tests  │     │ autonomously      │     │  with AI    │
└─────────────┘     └──────────────┘     └──────────────────┘     └─────────────┘
                                                                          │
                    ┌─────────────────────────────────────────────────────┘
                    ▼
          ┌─────────────────────────────────────────────────┐
          │  Unified quality report                          │
          │  ✓ Functional test results + triage              │
          │  ✓ OWASP Top 10 security findings + AI narrative │
          │  ✓ WCAG 2.1 AA accessibility violations          │
          │  ✓ k6 load metrics + regression detection        │
          └─────────────────────────────────────────────────┘
```

---

## Demo

> Autonomous agent run against [TodoMVC](https://demo.playwright.dev/todomvc) — zero human-written tests

```bash
$ node src/agent.js --url https://demo.playwright.dev/todomvc --mode full

╔════════════════════════════════════╗
║         QA-Agent v1.0.0            ║
╚════════════════════════════════════╝
  Target : https://demo.playwright.dev/todomvc
  Mode   : full
  Max    : 10 steps

── Step 1 ──────────────────────────
[agent] decided: browse — need to read the app first
[browser] navigated to https://demo.playwright.dev/todomvc
[agent] Found 5 testable actions: add todos, edit todos, complete todos...

── Step 2 ──────────────────────────
[agent] decided: generate — page analyzed, ready to write tests
[generate] test file written to tests/generated/agent-generated.spec.js

── Step 3 ──────────────────────────
[agent] decided: run — tests generated, need to execute them
[agent] Tests run: 3 passed, 0 failed out of 3 total

── Step 4 ──────────────────────────
[agent] decided: triage — checking for failures
[triage] all tests passed — no triage needed

── Step 5 ──────────────────────────
[agent] decided: security — run OWASP ZAP scan
[security] passive scan complete
[agent] Found 0 high/critical, 3 medium, 1 low severity issues

── Step 6 ──────────────────────────
[agent] decided: a11y — run accessibility scan
[a11y] found 1 violation — color-contrast (SERIOUS, wcag2aa)

── Step 7 ──────────────────────────
[agent] decided: load — run k6 performance baseline
[load] p95=9ms | avg=9ms | errors=0% | rps=9.8 | total=200

── Step 8 ──────────────────────────
[agent] decided: done — all skills complete

════════════════════════════════════
  QA-Agent run complete — score: 96
════════════════════════════════════
  Report : https://qa-agent-report.netlify.app
```

---

## Architecture

```
qa-agent/
├── src/
│   ├── agent.js              # Main orchestrator — ReAct loop
│   ├── llm.js                # AWS Bedrock (Claude) wrapper + retry logic
│   └── skills/
│       ├── browse.js         # Playwright browser skill
│       ├── generate.js       # AI test generation skill
│       ├── runner.js         # Playwright test runner + result parser
│       ├── triage.js         # AI failure triage skill
│       ├── security.js       # OWASP ZAP integration skill
│       ├── accessibility.js  # axe-core WCAG skill
│       ├── load-test.js      # k6 load test skill
│       └── reporter.js       # Unified HTML report generator
├── tests/
│   ├── generated/            # AI-generated Playwright test files
│   └── load/                 # AI-generated k6 load scripts
├── reports/                  # HTML reports, JSON summaries, screenshots
├── .github/
│   └── workflows/
│       └── qa-agent.yml      # GitHub Actions CI — runs on every push/PR
├── docker-compose.yml        # ZAP daemon for security scanning
└── playwright.config.js
```

### How the agent thinks — ReAct loop

```
Reason  →  Act  →  Observe  →  Loop
  │            │         │
  │       call skill   read result
  │            │         │
  └────────────┴─────────┘
      until task complete
```

The LLM orchestrates everything. Each skill is a tool Claude can call. It decides the order, handles failures, and produces the final report — no hardcoded test scripts, no human in the loop.

---

## Tech stack

| Layer | Technology |
|---|---|
| LLM | Claude 3.5 Sonnet via AWS Bedrock (APAC cross-region) |
| Browser automation | Playwright |
| Test runner | @playwright/test |
| Security scanning | OWASP ZAP (Docker) |
| Accessibility | axe-core |
| Load testing | k6 |
| CI/CD | GitHub Actions |
| Report hosting | Netlify (auto-deploy on every run) |
| Infrastructure | Docker, Docker Compose |
| Runtime | Node.js 22 |

---

## Quickstart

### Prerequisites

- Node.js 22+
- Docker (for ZAP security scanning)
- AWS account with Bedrock access (Claude 3.5 Sonnet)
- k6 (`brew install k6` on Mac)

### 1. Clone and install

```bash
git clone https://github.com/divyendu13/qa-agent.git
cd qa-agent
npm install
npx playwright install chromium
```

### 2. Configure credentials

```bash
cp .env.example .env
```

Edit `.env`:

```env
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=ap-south-1
ZAP_API_KEY=qaagent123
ZAP_PROXY_URL=http://localhost:8080
```

### 3. Start ZAP (for security scanning)

```bash
docker compose up -d
```

### 4. Run the agent

```bash
# Functional tests only (no Docker needed)
node src/agent.js --url https://your-app.com --mode functional

# Full run — functional + security + accessibility + load
node src/agent.js --url https://your-app.com --mode full
```

### 5. View the report

Open `reports/qa-report-*.html` in your browser, or view the latest CI report live at **[qa-agent-report.netlify.app](https://qa-agent-report.netlify.app/)**

---

## CI/CD pipeline

The GitHub Actions pipeline runs the full agent on every push and PR. The HTML report is auto-deployed to Netlify and linked in the Actions job summary.

```
Every push / PR:
  ✓ browse → generate → run → triage    (~2 min)
  ✓ security passive scan via ZAP        (~1 min)
  ✓ a11y axe-core WCAG 2.1 AA scan      (~30 sec)
  ✓ load test k6 baseline               (~30 sec)
  ✓ HTML report deployed to Netlify
  ✓ Quality gate — blocks on critical findings

Nightly at 2am IST:
  Same pipeline — catches overnight regressions
```

---

## OWASP Top 10 coverage

| ID | Vulnerability | Detection |
|---|---|---|
| A01:2021 | Broken access control | LLM + Playwright IDOR probing |
| A02:2021 | Cryptographic failures | ZAP passive — HTTP, weak ciphers |
| A03:2021 | Injection (XSS, SQLi) | ZAP active scan |
| A04:2021 | Insecure design | LLM flow analysis |
| A05:2021 | Security misconfiguration | ZAP passive — missing headers |
| A06:2021 | Vulnerable components | LLM CVE cross-reference |
| A07:2021 | Auth & session failures | ZAP active — session tokens |
| A08:2021 | Software integrity failures | LLM — unsigned scripts |
| A09:2021 | Logging failures | Agent-triggered error probing |
| A10:2021 | SSRF | ZAP active + LLM payload crafting |

---

## The AI security analyst layer

Raw ZAP output tells you what was found. The LLM tells you why it matters.

```json
{
  "owaspId": "A05:2021",
  "title": "Missing Content-Security-Policy header",
  "riskNarrative": "Without a CSP header, an attacker who finds an XSS vector
                    can inject arbitrary scripts that steal session tokens.",
  "exploitability": "Medium — requires a separate XSS entry point",
  "remediation": "Add Content-Security-Policy: default-src 'self' to all responses",
  "severity": "medium"
}
```

---

## Build log

| Day | Milestone | Status |
|---|---|---|
| Day 1 | AWS Bedrock + Claude API working | ✅ |
| Day 2 | Playwright browse skill — agent navigates live app | ✅ |
| Day 3 | AI test generation — tests passing on first run | ✅ |
| Day 4 | Failure triage — AI root cause + severity | ✅ |
| Day 5 | ReAct orchestrator — one command, autonomous pipeline | ✅ |
| Day 6 | OWASP ZAP security skill — active scan + AI narratives | ✅ |
| Day 7 | axe-core a11y + k6 load baseline — full 5-type coverage | ✅ |
| Day 8 | Unified HTML report — quality gate + score cards | ✅ |
| Day 9 | GitHub Actions CI + Netlify live deploy | ✅ |
| Day 10 | v1.0.0 release | ✅ |

---

## Author

**Divyendu Shukla** — Staff Software Engineer in Test
[divyendushukla.in](https://divyendushukla.in) · [LinkedIn](https://linkedin.com/in/divyendushukla) · [GitHub](https://github.com/divyendu13)

---

## License

MIT — see [LICENSE](LICENSE)
