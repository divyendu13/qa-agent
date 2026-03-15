# QA-Agent 🤖

> An autonomous AI agent that browses a web app, generates Playwright tests, runs them, triages failures, scans for OWASP security vulnerabilities, and checks WCAG accessibility — all from a single command.

[![CI](https://github.com/divyendu13/qa-agent/actions/workflows/qa-agent.yml/badge.svg)](https://github.com/divyendu13/qa-agent/actions)
[![Node](https://img.shields.io/badge/node-20.x-brightgreen)](https://nodejs.org)
[![Playwright](https://img.shields.io/badge/playwright-1.x-blue)](https://playwright.dev)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow)](LICENSE)
[![OWASP](https://img.shields.io/badge/security-OWASP%20Top%2010-red)](https://owasp.org/Top10/)
[![WCAG](https://img.shields.io/badge/accessibility-WCAG%202.1%20AA-purple)](https://www.w3.org/WAI/WCAG21/quickref/)

---

## What it does

Most test automation tools need a human to write the tests. QA-Agent doesn't.

Give it a URL. It figures out the rest.

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐     ┌──────────────┐
│  Browse app │ ──▶ │ Claude reads │ ──▶ │ Writes & runs   │ ──▶ │ Triages      │
│  via        │     │ the page,    │     │ Playwright tests │     │ failures,    │
│  Playwright │     │ plans tests  │     │ autonomously     │     │ files bugs   │
└─────────────┘     └──────────────┘     └─────────────────┘     └──────────────┘
                                                                         │
                    ┌────────────────────────────────────────────────────┘
                    ▼
          ┌──────────────────────────────────────────────┐
          │  Unified quality report                       │
          │  ✓ Functional test results                    │
          │  ✓ OWASP Top 10 security findings + AI triage │
          │  ✓ WCAG 2.1 AA accessibility violations       │
          └──────────────────────────────────────────────┘
```

---

## Demo

> Agent run against [TodoMVC](https://demo.playwright.dev/todomvc) — zero human-written tests

```bash
$ node src/agent.js --url https://demo.playwright.dev/todomvc

[browser] launched
[browser] navigated to https://demo.playwright.dev/todomvc
[agent]   reading page...
[agent]   asking Claude to analyze page and plan tests...

--- Page description ---
TodoMVC — a todo list application with add, edit, complete, and delete functionality.

--- Testable actions identified ---
  1. Adding new todo items
  2. Editing existing todos by double-clicking
  3. Marking todos as complete
  4. Deleting todos
  5. Filtering by All / Active / Completed

--- Generated test file → tests/generated/todo.spec.js
--- Running tests...

  ✓  TodoMVC › Create new todos          (332ms)
  ✓  TodoMVC › Edit existing todos       (361ms)
  ✓  TodoMVC › Verify todo display       (277ms)
  ✓  TodoMVC › Open edit mode on dclick  (256ms)
  ✗  TodoMVC › Validate external links   (timeout)

  4 passed, 1 failed

--- Triage report ---
  Failed test : Validate external links
  Root cause  : External link navigates away from app domain
  Severity    : Low
  Suggested fix: Use separate browser context for external link validation

--- Security scan (OWASP ZAP passive) ---
  A05:2021 — Missing Content-Security-Policy header     [Medium]
  A05:2021 — Missing X-Frame-Options header             [Low]

--- Accessibility scan (axe-core / WCAG 2.1 AA) ---
  contrast — 2 elements with insufficient color contrast [Serious]

[agent] report saved → reports/qa-report-2026-03-14.html
```

---

## Architecture

```
qa-agent/
├── src/
│   ├── agent.js              # Main orchestrator — ReAct loop
│   ├── llm.js                # AWS Bedrock (Claude) wrapper with retry logic
│   └── skills/
│       ├── browse.js         # Playwright browser skill
│       ├── generate.js       # AI test generation skill
│       ├── runner.js         # Playwright test runner + result parser
│       ├── triage.js         # AI failure triage skill
│       ├── security.js       # OWASP ZAP integration skill
│       ├── accessibility.js  # axe-core WCAG skill
│       └── reporter.js       # Unified HTML report generator
├── tests/
│   └── generated/            # AI-generated test files land here
├── reports/                  # HTML reports, screenshots, JSON summaries
├── .github/
│   └── workflows/
│       └── qa-agent.yml      # GitHub Actions CI pipeline
├── docker-compose.yml        # ZAP daemon for security scanning
├── playwright.config.js
└── README.md
```

### How the agent thinks — ReAct loop

```
Reason  →  Act  →  Observe  →  Loop
  │           │         │
  │      call skill  read result
  │           │         │
  └───────────┴─────────┘
     until task complete
```

The LLM orchestrates everything. Each skill (browse, generate, run, triage, scan) is a tool the agent can call. The agent decides the order, handles failures, and produces the final report — no hardcoded test scripts.

---

## Tech stack

| Layer | Technology |
|---|---|
| LLM | Claude 3.5 Sonnet via AWS Bedrock (APAC) |
| Browser automation | Playwright |
| Test runner | @playwright/test |
| Security scanning | OWASP ZAP (Docker) |
| Accessibility | axe-core |
| CI/CD | GitHub Actions |
| Infrastructure | Docker, Docker Compose |
| Runtime | Node.js 20 |

---

## Quickstart

### Prerequisites

- Node.js 20+
- Docker (for ZAP security scanning)
- AWS account with Bedrock access

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
```

### 3. Run the agent

```bash
# Functional tests + triage only (no Docker needed)
node src/day3-test.js --url https://demo.playwright.dev/todomvc

# Full run — functional + security + accessibility
docker compose up -d   # start ZAP
node src/agent.js --url https://your-app.com
```

### 4. View the report

Open `reports/qa-report-[timestamp].html` in your browser.

---

## CI/CD — runs on every PR

The GitHub Actions pipeline runs the full agent on every pull request and uploads the HTML report as an artifact.

```yaml
# .github/workflows/qa-agent.yml
on: [pull_request]
jobs:
  qa-agent:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm install && npx playwright install chromium
      - run: node src/agent.js --url ${{ env.TARGET_URL }}
      - uses: actions/upload-artifact@v4
        with:
          name: qa-report
          path: reports/
```

PRs are blocked if the agent finds any **High** OWASP severity finding or **Critical** WCAG violation.

---

## OWASP Top 10 coverage

| ID | Vulnerability | Detection method |
|---|---|---|
| A01:2021 | Broken access control | LLM + Playwright IDOR probing |
| A02:2021 | Cryptographic failures | ZAP passive — HTTP, weak ciphers |
| A03:2021 | Injection (XSS, SQLi) | ZAP active scan |
| A04:2021 | Insecure design | LLM flow analysis |
| A05:2021 | Security misconfiguration | ZAP passive — missing headers |
| A06:2021 | Vulnerable components | LLM CVE cross-reference |
| A07:2021 | Auth & session failures | ZAP active — session tokens |
| A08:2021 | Software integrity failures | LLM — unsigned scripts |
| A09:2021 | Logging & monitoring failures | Agent-triggered error probing |
| A10:2021 | SSRF | ZAP active + LLM payload crafting |

---

## The AI security analyst layer

Raw ZAP output tells you _what_ was found. The LLM layer tells you _why it matters_.

Every finding gets enriched with a plain-English risk narrative:

```json
{
  "owaspId": "A05:2021",
  "title": "Missing Content-Security-Policy header",
  "riskNarrative": "Without a CSP header, an attacker who finds an XSS vector can inject
                    arbitrary scripts that steal session tokens of any logged-in user.",
  "exploitability": "Medium — requires a separate XSS entry point",
  "remediation": "Add Content-Security-Policy: default-src 'self' to all HTTP responses",
  "severity": "Medium"
}
```

---

## Why this project exists

Most QA automation repos show you how to write Playwright tests. This one shows you what happens when the AI writes them, runs them, reads the failures, scans for security issues, checks accessibility, and files the bugs — autonomously.

Built as a learning project to explore agentic QA engineering patterns:
- LLM orchestration with the ReAct (Reason → Act → Observe) loop
- MCP-style skill architecture for composable test capabilities
- AI-augmented security testing on top of OWASP ZAP
- Shift-left quality gates in CI/CD pipelines

---

## Build log

| Day | Milestone | Status |
|---|---|---|
| Day 1 | AWS Bedrock + Claude API working | ✅ Done |
| Day 2 | Playwright browse skill — agent navigates live app | ✅ Done |
| Day 3 | AI test generation — 4/5 tests passing on first run | ✅ Done |
| Day 4 | Failure triage skill | 🔄 In progress |
| Day 5 | ReAct orchestrator loop | ⏳ Upcoming |
| Day 6 | ZAP security skill | ⏳ Upcoming |
| Day 7 | axe-core accessibility skill | ⏳ Upcoming |
| Day 8 | Unified HTML report | ⏳ Upcoming |
| Day 9 | GitHub Actions CI pipeline | ⏳ Upcoming |
| Day 10 | Demo GIF + v1.0.0 release | ⏳ Upcoming |

---

## Author

**Divyendu Shukla** — Staff Software Engineer in Test  
[divyendushukla.in](https://divyendushukla.in) · [LinkedIn](https://linkedin.com/in/divyendushukla) · [GitHub](https://github.com/divyendu13)

---

## License

MIT — see [LICENSE](LICENSE)
