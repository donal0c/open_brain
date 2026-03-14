import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { getTimeline } from '../db/queries.js';

export const timelineSchema = z.object({
  topic: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe('Filter timeline by topic'),
  person: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe('Filter timeline by person mentioned'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(50)
    .describe('Max thoughts to return (default 50)'),
});

export type TimelineInput = z.infer<typeof timelineSchema>;

export async function thoughtTimeline(input: TimelineInput): Promise<CallToolResult> {
  try {
    const { topic, person, limit } = timelineSchema.parse(input);

    if (!topic && !person) {
      return {
        content: [{ type: 'text', text: 'Please provide at least a topic or person to filter the timeline.' }],
        isError: true,
      };
    }

    const results = await getTimeline({ topic, person, limit });

    if (results.length === 0) {
      const filter = topic ? `topic "${topic}"` : `person "${person}"`;
      return {
        content: [{ type: 'text', text: `No thoughts found for ${filter}.` }],
      };
    }

    const filterDesc = [
      topic ? `topic: "${topic}"` : null,
      person ? `person: "${person}"` : null,
    ].filter(Boolean).join(', ');

    const lines = [
      `Timeline for ${filterDesc} (${results.length} thoughts, chronological):`,
      '',
    ];

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const date = new Date(r.created_at).toISOString().split('T')[0];
      const truncated = r.raw_text.length > 300
        ? r.raw_text.slice(0, 300) + '...'
        : r.raw_text;

      lines.push(`${date} [${r.context}] [${r.thought_type ?? 'untyped'}] (confidence: ${r.confidence})`);
      lines.push(`  ${truncated}`);
      if (r.topics.length > 0) lines.push(`  Topics: ${r.topics.join(', ')}`);
      if (r.people.length > 0) lines.push(`  People: ${r.people.join(', ')}`);
      lines.push(`  ID: ${r.id}`);
      lines.push('');
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: 'text', text: `Error generating timeline: ${message}` }], isError: true };
  }
}
