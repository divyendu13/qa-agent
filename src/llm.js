import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import 'dotenv/config';

const client = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || 'ap-south-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }
});

export async function sendMessage(systemPrompt, userMessage) {
  const payload = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: 1000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }]
  };

  const command = new InvokeModelCommand({
    // ✅ Cross-region inference profile — works from ap-south-1
    modelId: 'apac.anthropic.claude-3-5-sonnet-20241022-v2:0',
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(payload)
  });

  const response = await client.send(command);
  const result = JSON.parse(new TextDecoder().decode(response.body));
  return result.content[0].text;
}

// Smoke test
const result = await sendMessage(
  'You are a senior QA engineer.',
  'List 5 test cases for a login page. Return as a JSON array with fields: id, title, steps, expected.'
);
console.log(JSON.parse(result));