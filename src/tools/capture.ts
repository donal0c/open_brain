import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { generateEmbedding } from '../services/embeddings.js';
import { extractMetadata } from '../services/extraction.js';
import { insertThought } from '../db/queries.js';
import type { ThoughtContext } from '../types/index.js';

export const captureThoughtSchema = z.object({
  text: z.string().min(1).max(10000).describe('The thought or note to capture'),
  context: z
    .enum(['work', 'personal'])
    .optional()
    .describe('Optional: classify as work or personal. Auto-classified if omitted.'),
});

export type CaptureThoughtInput = z.infer<typeof captureThoughtSchema>;

export async function captureThought(input: CaptureThoughtInput): Promise<CallToolResult> {
  try {
    const { text, context: explicitContext } = captureThoughtSchema.parse(input);

    const [embedding, metadata] = await Promise.all([
      generateEmbedding(text),
      extractMetadata(text, explicitContext as ThoughtContext | undefined),
    ]);

    const thought = await insertThought({
      raw_text: text,
      embedding,
      context: metadata.context,
      people: metadata.people,
      topics: metadata.topics,
      thought_type: metadata.thought_type,
      action_items: metadata.action_items,
      metadata: {},
    });

    const lines = [
      `Thought captured successfully.`,
      ``,
      `ID: ${thought.id}`,
      `Context: ${thought.context}`,
      `Type: ${thought.thought_type ?? 'none'}`,
      `Topics: ${metadata.topics.length > 0 ? metadata.topics.join(', ') : 'none'}`,
      `People: ${metadata.people.length > 0 ? metadata.people.join(', ') : 'none'}`,
    ];

    if (metadata.action_items.length > 0) {
      lines.push(`Action items:`);
      for (const item of metadata.action_items) {
        lines.push(`  - ${item}`);
      }
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: 'text', text: `Error capturing thought: ${message}` }], isError: true };
  }
}
