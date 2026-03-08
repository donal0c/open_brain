import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { deleteThought } from '../db/queries.js';

export const deleteThoughtSchema = z.object({
  id: z.string().uuid().describe('The UUID of the thought to delete'),
});

export type DeleteThoughtInput = z.infer<typeof deleteThoughtSchema>;

export async function deleteThoughtTool(input: DeleteThoughtInput): Promise<CallToolResult> {
  try {
    const { id } = deleteThoughtSchema.parse(input);

    const deleted = await deleteThought(id);

    if (!deleted) {
      return {
        content: [{ type: 'text', text: `Thought not found: ${id}` }],
        isError: true,
      };
    }

    const preview =
      deleted.raw_text.length > 100
        ? deleted.raw_text.slice(0, 100) + '...'
        : deleted.raw_text;

    return {
      content: [
        {
          type: 'text',
          text: `Thought deleted.\n\nID: ${deleted.id}\nPreview: ${preview}`,
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `Error deleting thought: ${message}` }],
      isError: true,
    };
  }
}
