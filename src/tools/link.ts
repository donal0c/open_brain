import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { insertLink } from '../db/queries.js';
import { getThoughtById } from '../db/queries.js';
import type { LinkRelationship } from '../types/index.js';

export const linkThoughtsSchema = z.object({
  source_id: z.string().uuid().describe('The UUID of the source thought'),
  target_id: z.string().uuid().describe('The UUID of the target thought'),
  relationship: z
    .enum([
      'relates_to', 'extends', 'contradicts', 'supports',
      'follows_up', 'inspired_by', 'blocks',
    ])
    .describe(
      'Type of relationship: relates_to (general), extends (builds on), contradicts (disagrees with), ' +
      'supports (evidence for), follows_up (next step from), inspired_by (sparked by), blocks (prevents)'
    ),
  note: z
    .string()
    .max(500)
    .optional()
    .describe('Optional note explaining why these thoughts are linked'),
});

export type LinkThoughtsInput = z.infer<typeof linkThoughtsSchema>;

export async function linkThoughts(input: LinkThoughtsInput): Promise<CallToolResult> {
  try {
    const { source_id, target_id, relationship, note } = linkThoughtsSchema.parse(input);

    if (source_id === target_id) {
      return {
        content: [{ type: 'text', text: 'Cannot link a thought to itself.' }],
        isError: true,
      };
    }

    const [source, target] = await Promise.all([
      getThoughtById(source_id),
      getThoughtById(target_id),
    ]);

    if (!source) {
      return {
        content: [{ type: 'text', text: `Source thought not found: ${source_id}` }],
        isError: true,
      };
    }
    if (!target) {
      return {
        content: [{ type: 'text', text: `Target thought not found: ${target_id}` }],
        isError: true,
      };
    }

    const link = await insertLink(source_id, target_id, relationship as LinkRelationship, note);

    const sourcePreview = source.raw_text.length > 60
      ? source.raw_text.slice(0, 60) + '...'
      : source.raw_text;
    const targetPreview = target.raw_text.length > 60
      ? target.raw_text.slice(0, 60) + '...'
      : target.raw_text;

    const lines = [
      `Link created.`,
      ``,
      `Link ID: ${link.id}`,
      `Relationship: ${relationship}`,
      `Source: "${sourcePreview}"`,
      `Target: "${targetPreview}"`,
    ];

    if (note) {
      lines.push(`Note: ${note}`);
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('unique_link')) {
      return {
        content: [{ type: 'text', text: `This link already exists (same source, target, and relationship).` }],
        isError: true,
      };
    }
    return {
      content: [{ type: 'text', text: `Error linking thoughts: ${message}` }],
      isError: true,
    };
  }
}
