import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { getAllThoughts, getLinkedThoughts } from '../db/queries.js';
import type { LifeDomain, Thought } from '../types/index.js';

export const exportThoughtsSchema = z.object({
  format: z
    .enum(['markdown', 'json'])
    .default('markdown')
    .describe('Export format: markdown or json (default markdown)'),
  context: z
    .enum(['personal', 'family', 'health', 'finance', 'social', 'creative', 'travel'])
    .optional()
    .describe('Optional: filter by life domain'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(500)
    .default(100)
    .describe('Max thoughts to export (default 100)'),
  include_links: z
    .boolean()
    .default(false)
    .describe('Include thought links in export (default false)'),
});

export type ExportThoughtsInput = z.infer<typeof exportThoughtsSchema>;

function formatThoughtMarkdown(thought: Thought, links?: string[]): string {
  const date = new Date(thought.created_at).toISOString().split('T')[0];
  const lines: string[] = [];

  lines.push(`## ${thought.thought_type ?? 'thought'} (${date})`);
  lines.push('');
  lines.push(thought.raw_text);
  lines.push('');
  lines.push(`- **Domain**: ${thought.context}`);
  if (thought.topics.length > 0) {
    lines.push(`- **Topics**: ${thought.topics.join(', ')}`);
  }
  if (thought.people.length > 0) {
    lines.push(`- **People**: ${thought.people.join(', ')}`);
  }
  if (Array.isArray(thought.action_items) && thought.action_items.length > 0) {
    lines.push(`- **Action items**:`);
    for (const item of thought.action_items) {
      lines.push(`  - [ ] ${item}`);
    }
  }
  if (links && links.length > 0) {
    lines.push(`- **Links**: ${links.join(', ')}`);
  }
  lines.push(`- **ID**: \`${thought.id}\``);
  lines.push('');

  return lines.join('\n');
}

export async function exportThoughts(input: ExportThoughtsInput): Promise<CallToolResult> {
  try {
    const { format, context, limit, include_links } = exportThoughtsSchema.parse(input);

    const thoughts = await getAllThoughts({ context: context as LifeDomain | undefined, limit });

    if (thoughts.length === 0) {
      return {
        content: [{ type: 'text', text: 'No thoughts found to export.' }],
      };
    }

    if (format === 'json') {
      const exportData = [];
      for (const t of thoughts) {
        const entry: Record<string, unknown> = {
          id: t.id,
          text: t.raw_text,
          context: t.context,
          type: t.thought_type,
          topics: t.topics,
          people: t.people,
          action_items: t.action_items,
          created_at: t.created_at,
          updated_at: t.updated_at,
        };

        if (include_links) {
          const links = await getLinkedThoughts(t.id);
          entry.links = links.map((l) => ({
            relationship: l.relationship,
            direction: l.source_id === t.id ? 'outgoing' : 'incoming',
            linked_id: l.source_id === t.id ? l.target_id : l.source_id,
            note: l.note,
          }));
        }

        exportData.push(entry);
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(exportData, null, 2) }],
      };
    }

    // Markdown format
    const sections: string[] = [];
    sections.push(`# Open Brain Export`);
    sections.push(`_${thoughts.length} thoughts exported on ${new Date().toISOString().split('T')[0]}_`);
    if (context) sections.push(`_Filtered by domain: ${context}_`);
    sections.push('');

    for (const t of thoughts) {
      let links: string[] | undefined;
      if (include_links) {
        const linkedThoughts = await getLinkedThoughts(t.id);
        links = linkedThoughts.map((l) => {
          const dir = l.source_id === t.id ? '->' : '<-';
          const otherId = l.source_id === t.id ? l.target_id : l.source_id;
          return `${dir} ${l.relationship} \`${otherId.slice(0, 8)}\``;
        });
      }
      sections.push(formatThoughtMarkdown(t, links));
    }

    return { content: [{ type: 'text', text: sections.join('\n') }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: 'text', text: `Error exporting thoughts: ${message}` }], isError: true };
  }
}
