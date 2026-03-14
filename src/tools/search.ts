import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { generateEmbedding } from '../services/embeddings.js';
import { hybridSearch } from '../db/queries.js';

export const semanticSearchSchema = z.object({
  query: z.string().min(1).max(2000).describe('Natural language search query'),
  context: z
    .enum(['personal', 'family', 'health', 'finance', 'social', 'creative', 'travel'])
    .optional()
    .describe('Optional: filter by life domain'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe('Max results to return (default 10)'),
});

export type SemanticSearchInput = z.infer<typeof semanticSearchSchema>;

export async function searchThoughts(input: SemanticSearchInput): Promise<CallToolResult> {
  try {
    const { query, context, limit } = semanticSearchSchema.parse(input);

    const queryEmbedding = await generateEmbedding(query);
    const results = await hybridSearch(query, queryEmbedding, { context, limit });

    if (results.length === 0) {
      return {
        content: [{ type: 'text', text: 'No matching thoughts found.' }],
      };
    }

    const lines = [`Found ${results.length} result(s):`, ''];

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const truncated =
        r.raw_text.length > 300 ? r.raw_text.slice(0, 300) + '...' : r.raw_text;
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
    return { content: [{ type: 'text', text: `Error searching thoughts: ${message}` }], isError: true };
  }
}
