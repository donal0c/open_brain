import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { listRecent } from '../db/queries.js';

export const listRecentSchema = z.object({
  context: z
    .enum(['personal', 'family', 'health', 'finance', 'social', 'creative', 'travel'])
    .optional()
    .describe('Optional: filter by life domain'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe('Max results to return (default 20)'),
});

export type ListRecentInput = z.infer<typeof listRecentSchema>;

export async function listRecentThoughts(input: ListRecentInput): Promise<CallToolResult> {
  try {
    const { context, limit } = listRecentSchema.parse(input);
    const results = await listRecent({ context, limit });

    if (results.length === 0) {
      return {
        content: [{ type: 'text', text: 'No thoughts found.' }],
      };
    }

    const lines = [`${results.length} recent thought(s):`, ''];

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const truncated =
        r.raw_text.length > 300 ? r.raw_text.slice(0, 300) + '...' : r.raw_text;

      lines.push(`${i + 1}. [${r.context}] [${r.thought_type ?? 'untyped'}]`);
      lines.push(`   ${truncated}`);
      if (r.topics.length > 0) lines.push(`   Topics: ${r.topics.join(', ')}`);
      if (r.people.length > 0) lines.push(`   People: ${r.people.join(', ')}`);
      lines.push(`   Date: ${new Date(r.created_at).toISOString()} | ID: ${r.id}`);
      lines.push('');
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: 'text', text: `Error listing recent thoughts: ${message}` }], isError: true };
  }
}
