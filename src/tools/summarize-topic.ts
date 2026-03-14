import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { getThoughtsByTopic } from '../db/queries.js';

let bedrockClient: BedrockRuntimeClient | null = null;

function getClient(): BedrockRuntimeClient {
  if (!bedrockClient) {
    bedrockClient = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || 'us-east-1',
    });
  }
  return bedrockClient;
}

export const summarizeTopicSchema = z.object({
  topic: z.string().min(1).max(200).describe('The topic to summarize across all thoughts'),
  max_thoughts: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(20)
    .describe('Max thoughts to include in synthesis (default 20)'),
});

export type SummarizeTopicInput = z.infer<typeof summarizeTopicSchema>;

export async function summarizeTopic(input: SummarizeTopicInput): Promise<CallToolResult> {
  try {
    const { topic, max_thoughts } = summarizeTopicSchema.parse(input);

    const thoughts = await getThoughtsByTopic(topic, max_thoughts);

    if (thoughts.length === 0) {
      return {
        content: [{ type: 'text', text: `No thoughts found with topic "${topic}".` }],
      };
    }

    const thoughtTexts = thoughts.map((t, i) => {
      const date = new Date(t.created_at).toISOString().split('T')[0];
      return `[${i + 1}] (${date}, ${t.context}) ${t.raw_text}`;
    }).join('\n\n');

    const modelId = process.env.BEDROCK_MODEL_ID || 'us.anthropic.claude-sonnet-4-6';

    const command = new InvokeModelCommand({
      modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 2048,
        temperature: 0,
        messages: [
          {
            role: 'user',
            content: `You are synthesizing a person's thoughts on the topic "${topic}". Below are ${thoughts.length} thought entries. Provide a concise synthesis that:

1. Summarizes the key themes and patterns across these thoughts
2. Notes any evolution or changes in thinking over time
3. Highlights any contradictions or unresolved questions
4. Lists key action items or decisions mentioned

Be direct and concise. Use bullet points where appropriate.

Thoughts:
${thoughtTexts}`,
          },
        ],
      }),
    });

    const response = await getClient().send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    const synthesis = responseBody.content[0].text;

    const lines = [
      `Topic: "${topic}" (${thoughts.length} thoughts synthesized)`,
      ``,
      synthesis,
    ];

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: 'text', text: `Error summarizing topic: ${message}` }], isError: true };
  }
}
