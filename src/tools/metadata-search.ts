import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { searchByMetadata } from '../db/queries.js';

export const metadataSearchSchema = z.object({
  people: z
    .array(z.string())
    .optional()
    .describe('Filter by people mentioned'),
  topics: z
    .array(z.string())
    .optional()
    .describe('Filter by topics'),
  thought_type: z
    .enum([
      'decision', 'insight', 'meeting_note', 'idea',
      'task', 'observation', 'reference', 'personal_note',
    ])
    .optional()
    .describe('Filter by thought type'),
  context: z
    .enum(['personal', 'family', 'health', 'finance', 'social', 'creative', 'travel'])
    .optional()
    .describe('Filter by life domain'),
  date_from: z
    .string()
    .optional()
    .describe('Filter from date (ISO 8601)'),
  date_to: z
    .string()
    .optional()
    .describe('Filter to date (ISO 8601)'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe('Max results to return (default 20)'),
});

export type MetadataSearchInput = z.infer<typeof metadataSearchSchema>;

export async function metadataSearchThoughts(input: MetadataSearchInput): Promise<CallToolResult> {
  try {
    const params = metadataSearchSchema.parse(input);
    const results = await searchByMetadata(params);

    const filterParts: string[] = [];
    if (params.context) filterParts.push(`context=${params.context}`);
    if (params.people?.length) filterParts.push(`people=[${params.people.join(', ')}]`);
    if (params.topics?.length) filterParts.push(`topics=[${params.topics.join(', ')}]`);
    if (params.thought_type) filterParts.push(`type=${params.thought_type}`);
    if (params.date_from) filterParts.push(`from=${params.date_from}`);
    if (params.date_to) filterParts.push(`to=${params.date_to}`);

    const filterSummary = filterParts.length > 0
      ? `Filters: ${filterParts.join(', ')}`
      : 'No filters applied';

    if (results.length === 0) {
      return {
        content: [{ type: 'text', text: `${filterSummary}\n\nNo matching thoughts found.` }],
      };
    }

    const lines = [`${filterSummary}`, `Found ${results.length} result(s):`, ''];

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const truncated =
        r.raw_text.length > 300 ? r.raw_text.slice(0, 300) + '...' : r.raw_text;

      lines.push(`${i + 1}. [${r.context}] [${r.thought_type ?? 'untyped'}]`);
      lines.push(`   ${truncated}`);
      if (r.topics.length > 0) lines.push(`   Topics: ${r.topics.join(', ')}`);
      if (r.people.length > 0) lines.push(`   People: ${r.people.join(', ')}`);
      if (Array.isArray(r.action_items) && r.action_items.length > 0) {
        lines.push(`   Action items:`);
        for (const item of r.action_items) {
          lines.push(`     - ${item}`);
        }
      }
      lines.push(`   Date: ${new Date(r.created_at).toISOString()} | ID: ${r.id}`);
      lines.push('');
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: 'text', text: `Error searching by metadata: ${message}` }], isError: true };
  }
}
