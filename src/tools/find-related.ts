import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { getThoughtById, getThoughtEmbedding, findRelated } from '../db/queries.js';

export const findRelatedSchema = z.object({
  id: z.string().uuid().describe('The UUID of the thought to find related thoughts for'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(5)
    .describe('Max related thoughts to return (default 5)'),
});

export type FindRelatedInput = z.infer<typeof findRelatedSchema>;

export async function findRelatedThoughts(input: FindRelatedInput): Promise<CallToolResult> {
  try {
    const { id, limit } = findRelatedSchema.parse(input);

    const thought = await getThoughtById(id);
    if (!thought) {
      return {
        content: [{ type: 'text', text: `Thought not found: ${id}` }],
        isError: true,
      };
    }

    const embedding = await getThoughtEmbedding(id);
    if (!embedding) {
      return {
        content: [{ type: 'text', text: `Thought ${id} has no embedding. Cannot find related thoughts.` }],
        isError: true,
      };
    }

    const results = await findRelated(id, embedding, limit);

    if (results.length === 0) {
      return {
        content: [{ type: 'text', text: 'No related thoughts found.' }],
      };
    }

    const truncatedSource = thought.raw_text.length > 100
      ? thought.raw_text.slice(0, 100) + '...'
      : thought.raw_text;

    const lines = [
      `Related thoughts for: "${truncatedSource}"`,
      `Found ${results.length} related thought(s):`,
      '',
    ];

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const truncated = r.raw_text.length > 300
        ? r.raw_text.slice(0, 300) + '...'
        : r.raw_text;
      const similarity = Number(r.similarity).toFixed(3);

      lines.push(`${i + 1}. [${similarity}] [${r.context}] [${r.thought_type ?? 'untyped'}]`);
      lines.push(`   ${truncated}`);
      if (r.topics.length > 0) lines.push(`   Topics: ${r.topics.join(', ')}`);
      if (r.people.length > 0) lines.push(`   People: ${r.people.join(', ')}`);
      lines.push(`   Date: ${new Date(r.created_at).toISOString()} | ID: ${r.id}`);
      lines.push('');
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: 'text', text: `Error finding related thoughts: ${message}` }], isError: true };
  }
}
