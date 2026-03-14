import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { getThoughtById } from '../db/queries.js';
import { appendToThought } from '../services/thought-operations.js';

export const appendThoughtSchema = z.object({
  id: z.string().uuid().describe('The UUID of the thought to append to'),
  text: z.string().min(1).max(10000).describe('The text to append or prepend'),
  position: z
    .enum(['append', 'prepend'])
    .default('append')
    .describe('Where to add the text: append (end) or prepend (beginning). Default: append.'),
  separator: z
    .string()
    .max(100)
    .default('\n\n')
    .describe('Separator between existing and new text. Default: double newline.'),
});

export type AppendThoughtInput = z.infer<typeof appendThoughtSchema>;

export async function appendThoughtTool(input: AppendThoughtInput): Promise<CallToolResult> {
  try {
    const { id, text, position, separator } = appendThoughtSchema.parse(input);

    const existing = await getThoughtById(id);
    if (!existing) {
      return {
        content: [{ type: 'text', text: `Thought not found: ${id}` }],
        isError: true,
      };
    }
    const result = await appendToThought({
      id,
      text,
      position,
      separator,
    });
    if (!result) {
      return {
        content: [{ type: 'text', text: `Failed to update thought: ${id}` }],
        isError: true,
      };
    }
    const updated = result.updated;

    const lines = [
      `Text ${position === 'prepend' ? 'prepended' : 'appended'} successfully.`,
      ``,
      `ID: ${updated.id}`,
      `Context: ${updated.context}`,
      `Type: ${updated.thought_type ?? 'none'}`,
      `Topics: ${updated.topics.length > 0 ? updated.topics.join(', ') : 'none'}`,
      `People: ${updated.people.length > 0 ? updated.people.join(', ') : 'none'}`,
      `Total length: ${result.combinedText.length} characters`,
      `Updated at: ${new Date(updated.updated_at).toISOString()}`,
    ];

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `Error appending to thought: ${message}` }],
      isError: true,
    };
  }
}
