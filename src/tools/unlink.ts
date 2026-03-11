import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { deleteLinkById, deleteLinkByPair } from '../db/queries.js';
import type { LinkRelationship } from '../types/index.js';

export const unlinkThoughtsSchema = z.object({
  link_id: z
    .string()
    .uuid()
    .optional()
    .describe('The UUID of the specific link to remove. Use this if you know the link ID from get_linked.'),
  source_id: z
    .string()
    .uuid()
    .optional()
    .describe('The UUID of one thought in the pair. Required if link_id is not provided.'),
  target_id: z
    .string()
    .uuid()
    .optional()
    .describe('The UUID of the other thought in the pair. Required if link_id is not provided.'),
  relationship: z
    .enum([
      'relates_to', 'extends', 'contradicts', 'supports',
      'follows_up', 'inspired_by', 'blocks',
    ])
    .optional()
    .describe('Optional: only remove links with this relationship type (when using source_id + target_id)'),
});

export type UnlinkThoughtsInput = z.infer<typeof unlinkThoughtsSchema>;

export async function unlinkThoughts(input: UnlinkThoughtsInput): Promise<CallToolResult> {
  try {
    const { link_id, source_id, target_id, relationship } = unlinkThoughtsSchema.parse(input);

    if (link_id) {
      const deleted = await deleteLinkById(link_id);
      if (!deleted) {
        return {
          content: [{ type: 'text', text: `Link not found: ${link_id}` }],
          isError: true,
        };
      }
      return {
        content: [{
          type: 'text',
          text: `Link removed.\n\nLink ID: ${deleted.id}\nRelationship: ${deleted.relationship}\nBetween: ${deleted.source_id} and ${deleted.target_id}`,
        }],
      };
    }

    if (!source_id || !target_id) {
      return {
        content: [{
          type: 'text',
          text: 'Provide either link_id, or both source_id and target_id.',
        }],
        isError: true,
      };
    }

    const deleted = await deleteLinkByPair(
      source_id,
      target_id,
      relationship as LinkRelationship | undefined
    );

    if (deleted.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `No links found between ${source_id} and ${target_id}${relationship ? ` with relationship "${relationship}"` : ''}.`,
        }],
        isError: true,
      };
    }

    const lines = [
      `Removed ${deleted.length} link(s).`,
      ``,
    ];
    for (const link of deleted) {
      lines.push(`- ${link.relationship} (link ID: ${link.id})`);
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `Error unlinking thoughts: ${message}` }],
      isError: true,
    };
  }
}
