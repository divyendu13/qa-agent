import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import 'dotenv/config';

const client = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || 'ap-south-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }
});

export async function decideNextAction(agentState) {
  const systemPrompt = `You are an autonomous QA agent orchestrator.
You have access to these skills:
- browse: navigate a URL and read page content
- generate: write Playwright tests based on page analysis
- run: execute the generated test file
- triage: diagnose test failures and suggest fixes
- security: run OWASP ZAP security scan and get AI-enriched findings
- done: signal that the task is complete

If mode is "full", run all skills including security.
If mode is "functional", skip security and run: browse → generate → run → triage → done.
If mode is "security", run browse and security only, then done.

Given the current agent state, decide the NEXT single action to take.
Return ONLY valid JSON in this exact format — no markdown, no explanation:
{
  "skill": "one of: browse | generate | run | triage | done",
  "reason": "one sentence explaining why",
  "params": {}
}`;

  const userMessage = `Current agent state:
URL: ${agentState.url}
Mode: ${agentState.mode}
Steps completed: ${agentState.steps.map(s => `${s.skill} (${s.status})`).join(' → ') || 'none yet'}
Last result summary: ${agentState.lastResult || 'none'}
Test results so far: ${agentState.testResults ? `${agentState.testResults.passed} passed, ${agentState.testResults.failed} failed` : 'not run yet'}

Decide the next skill to call. If all necessary skills have run successfully, return "done".`;

  const raw = await sendMessage(systemPrompt, userMessage);
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

try {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON found');
  return JSON.parse(jsonMatch[0]);
} catch(e) {
  console.log('[agent] JSON parse error in decideNextAction, defaulting to done');
  return { skill: 'done', reason: 'Parse error — ending loop', params: {} };
}
}

export async function sendMessage(systemPrompt, userMessage, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const payload = {
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      };

      const command = new InvokeModelCommand({
        modelId: 'apac.anthropic.claude-3-haiku-20240307-v1:0', // Haiku — higher rate limits
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(payload)
      });

      const response = await client.send(command);
      const result = JSON.parse(new TextDecoder().decode(response.body));
      return result.content[0].text;

    } catch (err) {
      if (err.name === 'ThrottlingException' && attempt < retries) {
        const wait = attempt * 10000; // 10s, 20s, 30s
        console.log(`[llm] throttled — waiting ${wait / 1000}s before retry ${attempt}/${retries}...`);
        await new Promise(r => setTimeout(r, wait));
      } else {
        throw err;
      }
    }
  }
}

export async function analyzePageAndPlan(pageContent) {
  const trimmedContent = {
    text: pageContent.text.slice(0, 1500),
    interactive: pageContent.interactive.slice(0, 10)
  };

  const systemPrompt = `You are a senior QA engineer operating a browser autonomously.
You will be given the visible text and interactive elements of a web page.

Return ONLY a valid JSON object — no preamble, no explanation, no markdown.
Start your response with { and end with }.

Required format:
{
  "pageDescription": "what you see on the page",
  "testableActions": ["action 1", "action 2", "action 3"],
  "nextActions": [
    { "type": "fill", "selector": "CSS selector", "value": "text to type" },
    { "type": "click", "selector": "CSS selector" },
    { "type": "press", "selector": "CSS selector", "key": "Enter" }
  ]
}`;

  const userMessage = `Analyze this page and return JSON only.

VISIBLE TEXT:
${trimmedContent.text}

INTERACTIVE ELEMENTS (top 10):
${JSON.stringify(trimmedContent.interactive, null, 2)}`;

  const raw = await sendMessage(systemPrompt, userMessage);

  // Robust JSON extraction — finds the first { ... } block in the response
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.log('[llm] no JSON found in response, using fallback plan');
    return {
      pageDescription: 'Page could not be analyzed',
      testableActions: ['Add a new item', 'Edit an existing item', 'Delete an item'],
      nextActions: []
    };
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch(e) {
    console.log('[llm] JSON parse failed, using fallback plan');
    return {
      pageDescription: 'Page analysis parse error',
      testableActions: ['Add a new item', 'Edit an existing item', 'Delete an item'],
      nextActions: []
    };
  }
}