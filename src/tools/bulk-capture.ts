import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { captureThoughtRecord } from '../services/thought-operations.js';
import type { LifeDomain } from '../types/index.js';

const thoughtItemSchema = z.object({
  text: z.string().min(1).max(10000),
  context: z
    .enum(['personal', 'family', 'health', 'finance', 'social', 'creative', 'travel'])
    .optional(),
});

export const bulkCaptureSchema = z.object({
  thoughts: z
    .array(thoughtItemSchema)
    .min(1)
    .max(20)
    .describe('Array of thoughts to capture (max 20 per batch)'),
});

export type BulkCaptureInput = z.infer<typeof bulkCaptureSchema>;

export async function bulkCapture(input: BulkCaptureInput): Promise<CallToolResult> {
  try {
    const { thoughts } = bulkCaptureSchema.parse(input);

    const results: {
      id: string;
      topics: string[];
      context: string;
      duplicate?: boolean;
      error?: string;
    }[] = [];
    let successCount = 0;
    let failCount = 0;

    // Process sequentially to avoid overwhelming external APIs
    for (const item of thoughts) {
      try {
        const result = await captureThoughtRecord({
          text: item.text,
          explicitContext: item.context as LifeDomain | undefined,
        });

        if (result.status === 'duplicate') {
          results.push({
            id: result.candidate.id,
            topics: [],
            context: result.candidate.context,
            duplicate: true,
          });
          failCount++;
          continue;
        }

        const thought = result.thought;
        results.push({
          id: thought.id,
          topics: thought.topics,
          context: thought.context,
        });
        successCount++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({
          id: 'FAILED',
          topics: [],
          context: item.context ?? 'unknown',
          error: message,
        });
        failCount++;
      }
    }

    const lines = [
      `Bulk capture complete: ${successCount} captured, ${failCount} failed.`,
      '',
    ];

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const truncated = thoughts[i].text.length > 80
        ? thoughts[i].text.slice(0, 80) + '...'
        : thoughts[i].text;

      if (r.error) {
        lines.push(`${i + 1}. FAILED: ${truncated}`);
        lines.push(`   Error: ${r.error}`);
      } else if (r.duplicate) {
        lines.push(`${i + 1}. DUPLICATE: ${truncated}`);
        lines.push(`   Existing ID: ${r.id} | Context: ${r.context}`);
      } else {
        lines.push(`${i + 1}. OK [${r.context}] ${truncated}`);
        lines.push(`   ID: ${r.id} | Topics: ${r.topics.length > 0 ? r.topics.join(', ') : 'none'}`);
      }
      lines.push('');
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: 'text', text: `Error in bulk capture: ${message}` }], isError: true };
  }
}
