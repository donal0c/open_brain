import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { archiveThought, unarchiveThought } from '../db/queries.js';

export const archiveSchema = z.object({
  id: z.string().uuid().describe('The UUID of the thought to archive'),
  reason: z.string().min(1).max(500).describe('Reason for archiving this thought'),
});

export const unarchiveSchema = z.object({
  id: z.string().uuid().describe('The UUID of the thought to unarchive'),
});

export type ArchiveInput = z.infer<typeof archiveSchema>;
export type UnarchiveInput = z.infer<typeof unarchiveSchema>;

export async function archiveThoughtTool(input: ArchiveInput): Promise<CallToolResult> {
  try {
    const { id, reason } = archiveSchema.parse(input);

    const thought = await archiveThought(id, reason);
    if (!thought) {
      return {
        content: [{ type: 'text', text: `Thought not found: ${id}` }],
        isError: true,
      };
    }

    return {
      content: [{
        type: 'text',
        text: [
          `Thought archived.`,
          ``,
          `ID: ${thought.id}`,
          `Reason: ${reason}`,
          `Text: ${thought.raw_text.length > 200 ? thought.raw_text.slice(0, 200) + '...' : thought.raw_text}`,
        ].join('\n'),
      }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: 'text', text: `Error archiving thought: ${message}` }], isError: true };
  }
}

export async function unarchiveThoughtTool(input: UnarchiveInput): Promise<CallToolResult> {
  try {
    const { id } = unarchiveSchema.parse(input);

    const thought = await unarchiveThought(id);
    if (!thought) {
      return {
        content: [{ type: 'text', text: `Thought not found: ${id}` }],
        isError: true,
      };
    }

    return {
      content: [{
        type: 'text',
        text: [
          `Thought unarchived and active again.`,
          ``,
          `ID: ${thought.id}`,
          `Text: ${thought.raw_text.length > 200 ? thought.raw_text.slice(0, 200) + '...' : thought.raw_text}`,
        ].join('\n'),
      }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: 'text', text: `Error unarchiving thought: ${message}` }], isError: true };
  }
}
