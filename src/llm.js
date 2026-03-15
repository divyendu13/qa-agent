import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import 'dotenv/config';

const client = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || 'ap-south-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }
});

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
  // ✅ trimmedContent lives HERE — inside the function where pageContent exists
  const trimmedContent = {
    text: pageContent.text.slice(0, 1500),
    interactive: pageContent.interactive.slice(0, 10)
  };

  const systemPrompt = `You are a senior QA engineer operating a browser autonomously.
You will be given the visible text and interactive elements of a web page.
Your job is to:
1. Describe what the page is showing
2. Identify what can be tested here
3. Return a list of actions to perform next as a JSON object

IMPORTANT: Only plan actions that stay within the target app domain. 
Never click links that navigate away from the current app.
Focus only on testing the app's core functionality.

Always return valid JSON in this exact format:
{
  "pageDescription": "what you see on the page",
  "testableActions": ["list of things worth testing"],
  "nextActions": [
    { "type": "fill", "selector": "CSS selector", "value": "text to type" },
    { "type": "click", "selector": "CSS selector" },
    { "type": "press", "selector": "CSS selector", "key": "Enter" }
  ]
}`;

  const userMessage = `Here is the current page state:

VISIBLE TEXT:
${trimmedContent.text}

INTERACTIVE ELEMENTS (top 10):
${JSON.stringify(trimmedContent.interactive, null, 2)}

Analyze this page and return your plan as JSON.`;

  const raw = await sendMessage(systemPrompt, userMessage);

  // Strip markdown code fences if LLM wraps in them
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(cleaned);
}