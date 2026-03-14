import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { generateContextualEmbedding } from '../services/embeddings.js';
import { extractMetadata } from '../services/extraction.js';
import { getThoughtById, insertThought, archiveThought, getLinkedThoughts, insertLink } from '../db/queries.js';
import type { LinkRelationship } from '../types/index.js';

export const mergeThoughtsSchema = z.object({
  source_ids: z
    .array(z.string().uuid())
    .min(2)
    .max(5)
    .describe('UUIDs of the thoughts to merge (2-5 thoughts)'),
  separator: z
    .string()
    .max(100)
    .default('\n\n')
    .describe('Separator between merged texts. Default: double newline.'),
  archive_sources: z
    .boolean()
    .default(true)
    .describe('Archive the source thoughts after merging. Default: true.'),
});

export type MergeThoughtsInput = z.infer<typeof mergeThoughtsSchema>;

export async function mergeThoughts(input: MergeThoughtsInput): Promise<CallToolResult> {
  try {
    const { source_ids, separator, archive_sources } = mergeThoughtsSchema.parse(input);

    // Fetch all source thoughts
    const thoughts = [];
    for (const id of source_ids) {
      const thought = await getThoughtById(id);
      if (!thought) {
        return {
          content: [{ type: 'text', text: `Thought not found: ${id}` }],
          isError: true,
        };
      }
      thoughts.push(thought);
    }

    // Sort by creation date for natural ordering
    thoughts.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    // Combine text
    const combinedText = thoughts.map((t) => t.raw_text).join(separator);

    // Generate metadata first, then contextual embedding
    const metadata = await extractMetadata(combinedText);
    const embedding = await generateContextualEmbedding(combinedText, {
      context: metadata.context,
      topics: metadata.topics,
      people: metadata.people,
    });

    // Use the highest confidence from any source
    const maxConfidence = Math.max(...thoughts.map((t) => t.confidence));

    // Insert the merged thought
    const merged = await insertThought({
      raw_text: combinedText,
      embedding,
      context: metadata.context,
      people: metadata.people,
      topics: metadata.topics,
      thought_type: metadata.thought_type,
      action_items: metadata.action_items,
      metadata: { merged_from: source_ids },
    });

    // Transfer links from source thoughts to the merged thought
    let linksTransferred = 0;
    for (const thought of thoughts) {
      const links = await getLinkedThoughts(thought.id);
      for (const link of links) {
        const isSource = link.source_id === thought.id;
        const otherThoughtId = isSource ? link.target_id : link.source_id;

        // Don't link to other thoughts being merged
        if (source_ids.includes(otherThoughtId)) continue;

        try {
          if (isSource) {
            await insertLink(merged.id, otherThoughtId, link.relationship as LinkRelationship, link.note ?? undefined);
          } else {
            await insertLink(otherThoughtId, merged.id, link.relationship as LinkRelationship, link.note ?? undefined);
          }
          linksTransferred++;
        } catch {
          // Duplicate link — skip silently
        }
      }
    }

    // Archive source thoughts
    if (archive_sources) {
      for (const thought of thoughts) {
        await archiveThought(thought.id, `Merged into ${merged.id}`);
      }
    }

    const lines = [
      `${thoughts.length} thoughts merged successfully.`,
      ``,
      `New thought ID: ${merged.id}`,
      `Domain: ${merged.context}`,
      `Type: ${merged.thought_type ?? 'none'}`,
      `Topics: ${metadata.topics.length > 0 ? metadata.topics.join(', ') : 'none'}`,
      `People: ${metadata.people.length > 0 ? metadata.people.join(', ') : 'none'}`,
      `Links transferred: ${linksTransferred}`,
      `Source thoughts ${archive_sources ? 'archived' : 'kept active'}`,
      `Combined text length: ${combinedText.length} characters`,
    ];

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: 'text', text: `Error merging thoughts: ${message}` }], isError: true };
  }
}
