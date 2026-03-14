import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { askBrainCore } from '../services/ask.js';

export const askBrainSchema = z.object({
  question: z.string().min(1).max(2000).describe('The question to answer from your thought history'),
  max_sources: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(10)
    .describe('Max source thoughts to use as context (default 10)'),
});

export type AskBrainInput = z.infer<typeof askBrainSchema>;

export async function askBrain(input: AskBrainInput): Promise<CallToolResult> {
  try {
    const { question, max_sources } = askBrainSchema.parse(input);
    const result = await askBrainCore(question, max_sources);

    if (result.sources.length === 0) {
      return { content: [{ type: 'text', text: result.answer }] };
    }

    const lines = [
      `Q: ${result.question}`,
      ``,
      result.answer,
      ``,
      `--- Sources (${result.sources.length}) ---`,
    ];

    for (let i = 0; i < result.sources.length; i++) {
      const s = result.sources[i];
      const truncated = s.text.length > 100 ? s.text.slice(0, 100) + '...' : s.text;
      lines.push(`[${i + 1}] ${s.date} (${s.context}) ${truncated}  ID: ${s.id}`);
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: 'text', text: `Error answering question: ${message}` }], isError: true };
  }
}
