import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { reinforceThought } from '../db/queries.js';

export const reinforceSchema = z.object({
  id: z.string().uuid().describe('The UUID of the thought to reinforce'),
});

export type ReinforceInput = z.infer<typeof reinforceSchema>;

export async function reinforceThoughtTool(input: ReinforceInput): Promise<CallToolResult> {
  try {
    const { id } = reinforceSchema.parse(input);

    const thought = await reinforceThought(id);
    if (!thought) {
      return {
        content: [{ type: 'text', text: `Thought not found or archived: ${id}` }],
        isError: true,
      };
    }

    return {
      content: [{
        type: 'text',
        text: [
          `Thought reinforced. Confidence: ${thought.confidence}`,
          ``,
          `ID: ${thought.id}`,
          `Text: ${thought.raw_text.length > 200 ? thought.raw_text.slice(0, 200) + '...' : thought.raw_text}`,
        ].join('\n'),
      }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: 'text', text: `Error reinforcing thought: ${message}` }], isError: true };
  }
}
