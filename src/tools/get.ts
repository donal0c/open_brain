import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { getThoughtById } from '../db/queries.js';

export const getThoughtSchema = z.object({
  id: z.string().uuid().describe('The UUID of the thought to retrieve'),
});

export type GetThoughtInput = z.infer<typeof getThoughtSchema>;

export async function getThought(input: GetThoughtInput): Promise<CallToolResult> {
  try {
    const { id } = getThoughtSchema.parse(input);

    const thought = await getThoughtById(id);

    if (!thought) {
      return {
        content: [{ type: 'text', text: `Thought not found: ${id}` }],
        isError: true,
      };
    }

    const lines = [
      `ID: ${thought.id}`,
      `Domain: ${thought.context}`,
      `Type: ${thought.thought_type ?? 'none'}`,
      `Confidence: ${thought.confidence}`,
      `Active: ${thought.active}${thought.archived_reason ? ` (archived: ${thought.archived_reason})` : ''}`,
      `Created: ${new Date(thought.created_at).toISOString()}`,
      `Updated: ${new Date(thought.updated_at).toISOString()}`,
      `Topics: ${thought.topics.length > 0 ? thought.topics.join(', ') : 'none'}`,
      `People: ${thought.people.length > 0 ? thought.people.join(', ') : 'none'}`,
      ``,
      `Text:`,
      thought.raw_text,
    ];

    if (thought.action_items.length > 0) {
      lines.push(``, `Action items:`);
      for (const item of thought.action_items) {
        lines.push(`  - ${item}`);
      }
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `Error retrieving thought: ${message}` }],
      isError: true,
    };
  }
}
