import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { getThoughtById } from '../db/queries.js';
import { updateThoughtRecord } from '../services/thought-operations.js';
import type { ThoughtType } from '../types/index.js';

export const updateThoughtSchema = z.object({
  id: z.string().uuid().describe('The UUID of the thought to update'),
  text: z
    .string()
    .min(1)
    .max(10000)
    .optional()
    .describe('New text content. If changed, embedding and metadata are automatically re-generated.'),
  context: z
    .enum(['personal', 'family', 'health', 'finance', 'social', 'creative', 'travel'])
    .optional()
    .describe('Override life domain classification'),
  people: z
    .array(z.string())
    .optional()
    .describe('Override extracted people'),
  topics: z
    .array(z.string())
    .optional()
    .describe('Override extracted topics'),
  thought_type: z
    .enum([
      'decision', 'insight', 'meeting_note', 'idea',
      'task', 'observation', 'reference', 'personal_note',
    ])
    .optional()
    .describe('Override thought type classification'),
});

export type UpdateThoughtInput = z.infer<typeof updateThoughtSchema>;

export async function updateThoughtTool(input: UpdateThoughtInput): Promise<CallToolResult> {
  try {
    const { id, text, context, people, topics, thought_type } = updateThoughtSchema.parse(input);

    const hasTextChange = text !== undefined;
    const hasMetadataChange =
      context !== undefined ||
      people !== undefined ||
      topics !== undefined ||
      thought_type !== undefined;

    if (!hasTextChange && !hasMetadataChange) {
      return {
        content: [{ type: 'text', text: 'No fields to update. Provide at least one field to change.' }],
        isError: true,
      };
    }

    const existing = await getThoughtById(id);
    if (!existing) {
      return {
        content: [{ type: 'text', text: `Thought not found: ${id}` }],
        isError: true,
      };
    }

    const result = await updateThoughtRecord({
      id,
      text,
      context,
      people,
      topics,
      thought_type: thought_type as ThoughtType | undefined,
    });
    if (!result) {
      return {
        content: [{ type: 'text', text: `Failed to update thought: ${id}` }],
        isError: true,
      };
    }
    const updated = result.updated;

    const lines = [
      `Thought updated successfully.`,
      ``,
      `ID: ${updated.id}`,
      `Changed: ${result.changedFields.join(', ')}`,
      `Context: ${updated.context}`,
      `Type: ${updated.thought_type ?? 'none'}`,
      `Topics: ${updated.topics.length > 0 ? updated.topics.join(', ') : 'none'}`,
      `People: ${updated.people.length > 0 ? updated.people.join(', ') : 'none'}`,
      `Updated at: ${new Date(updated.updated_at).toISOString()}`,
    ];

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `Error updating thought: ${message}` }],
      isError: true,
    };
  }
}
