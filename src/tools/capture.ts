import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { captureThoughtRecord } from '../services/thought-operations.js';
import type { LifeDomain } from '../types/index.js';

export const captureThoughtSchema = z.object({
  text: z.string().min(1).max(10000).describe('The thought or note to capture'),
  context: z
    .enum(['personal', 'family', 'health', 'finance', 'social', 'creative', 'travel'])
    .optional()
    .describe('Optional: classify into a life domain. Auto-classified if omitted.'),
  force: z
    .boolean()
    .default(false)
    .describe('Skip duplicate detection and force capture. Default: false.'),
});

export type CaptureThoughtInput = z.infer<typeof captureThoughtSchema>;

export async function captureThought(input: CaptureThoughtInput): Promise<CallToolResult> {
  try {
    const { text, context: explicitContext, force } = captureThoughtSchema.parse(input);
    const result = await captureThoughtRecord({
      text,
      explicitContext: explicitContext as LifeDomain | undefined,
      force,
    });

    if (result.status === 'duplicate') {
      const dup = result.candidate;
      const truncated = dup.raw_text.length > 200
        ? dup.raw_text.slice(0, 200) + '...'
        : dup.raw_text;
      const similarity = Number(dup.similarity).toFixed(3);
      const duplicateSource = result.viaIdempotencyKey ? 'existing idempotent request' : 'similar active thought';

      return {
        content: [{
          type: 'text',
          text: [
            `Duplicate detected from ${duplicateSource} (similarity: ${similarity}). Thought NOT captured.`,
            ``,
            `Existing thought ID: ${dup.id}`,
            `Context: ${dup.context}`,
            `Text: ${truncated}`,
            ``,
            `To capture anyway, use force=true.`,
          ].join('\n'),
        }],
      };
    }

    const thought = result.thought;
    const lines = [
      `Thought captured successfully.`,
      ``,
      `ID: ${thought.id}`,
      `Context: ${thought.context}`,
      `Type: ${thought.thought_type ?? 'none'}`,
      `Topics: ${thought.topics.length > 0 ? thought.topics.join(', ') : 'none'}`,
      `People: ${thought.people.length > 0 ? thought.people.join(', ') : 'none'}`,
    ];

    if (thought.action_items.length > 0) {
      lines.push(`Action items:`);
      for (const item of thought.action_items) {
        lines.push(`  - ${item}`);
      }
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: 'text', text: `Error capturing thought: ${message}` }], isError: true };
  }
}
