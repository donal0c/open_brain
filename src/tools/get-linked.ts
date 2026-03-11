import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { getLinkedThoughts, getThoughtById } from '../db/queries.js';
import type { LinkRelationship } from '../types/index.js';

export const getLinkedSchema = z.object({
  id: z.string().uuid().describe('The UUID of the thought to get links for'),
  relationship: z
    .enum([
      'relates_to', 'extends', 'contradicts', 'supports',
      'follows_up', 'inspired_by', 'blocks',
    ])
    .optional()
    .describe('Optional: filter by relationship type'),
});

export type GetLinkedInput = z.infer<typeof getLinkedSchema>;

export async function getLinked(input: GetLinkedInput): Promise<CallToolResult> {
  try {
    const { id, relationship } = getLinkedSchema.parse(input);

    const thought = await getThoughtById(id);
    if (!thought) {
      return {
        content: [{ type: 'text', text: `Thought not found: ${id}` }],
        isError: true,
      };
    }

    const links = await getLinkedThoughts(id, relationship as LinkRelationship | undefined);

    if (links.length === 0) {
      const filterNote = relationship ? ` with relationship "${relationship}"` : '';
      return {
        content: [{ type: 'text', text: `No linked thoughts found${filterNote}.` }],
      };
    }

    const thoughtPreview = thought.raw_text.length > 80
      ? thought.raw_text.slice(0, 80) + '...'
      : thought.raw_text;

    const lines = [
      `Linked thoughts for: "${thoughtPreview}"`,
      `Found ${links.length} link(s).`,
      ``,
    ];

    for (const link of links) {
      const lt = link.linked_thought;
      const direction = link.source_id === id ? '->' : '<-';
      const preview = lt.raw_text.length > 100
        ? lt.raw_text.slice(0, 100) + '...'
        : lt.raw_text;

      lines.push(`${direction} [${link.relationship}] ${lt.id}`);
      lines.push(`   Type: ${lt.thought_type ?? 'none'} | Context: ${lt.context}`);
      lines.push(`   "${preview}"`);
      if (link.note) {
        lines.push(`   Note: ${link.note}`);
      }
      lines.push(`   Link ID: ${link.id}`);
      lines.push(``);
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `Error getting linked thoughts: ${message}` }],
      isError: true,
    };
  }
}
