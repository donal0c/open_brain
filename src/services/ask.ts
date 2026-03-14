import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { generateEmbedding } from './embeddings.js';
import { hybridSearch } from '../db/queries.js';

let bedrockClient: BedrockRuntimeClient | null = null;

function getClient(): BedrockRuntimeClient {
  if (!bedrockClient) {
    bedrockClient = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || 'us-east-1',
    });
  }
  return bedrockClient;
}

export interface AskBrainResult {
  question: string;
  answer: string;
  sources: Array<{
    id: string;
    text: string;
    context: string;
    date: string;
    similarity: number;
  }>;
}

export async function askBrainCore(
  question: string,
  maxSources: number = 10
): Promise<AskBrainResult> {
  const queryEmbedding = await generateEmbedding(question);
  const sources = await hybridSearch(question, queryEmbedding, { limit: maxSources });

  if (sources.length === 0) {
    return { question, answer: `No relevant thoughts found to answer: "${question}"`, sources: [] };
  }

  const contextBlock = sources.map((t, i) => {
    const date = new Date(t.created_at).toISOString().split('T')[0];
    return `[${i + 1}] (${date}, ${t.context}, confidence:${t.confidence}) ${t.raw_text}`;
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
          content: `You are answering a question based on the user's personal thought history. Answer ONLY based on what's in the provided thoughts. If the thoughts don't contain enough information to answer, say so.

Question: ${question}

Relevant thoughts from your history (${sources.length} sources):
${contextBlock}

Answer the question concisely. Reference source numbers [1], [2], etc. when citing specific thoughts.`,
        },
      ],
    }),
  });

  const response = await getClient().send(command);
  const responseBody = JSON.parse(new TextDecoder().decode(response.body));
  const answer = responseBody.content[0].text;

  return {
    question,
    answer,
    sources: sources.map((s) => ({
      id: s.id,
      text: s.raw_text,
      context: s.context,
      date: new Date(s.created_at).toISOString().split('T')[0],
      similarity: Number(s.similarity),
    })),
  };
}
