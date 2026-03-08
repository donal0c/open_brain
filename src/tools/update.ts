import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { generateEmbedding } from '../services/embeddings.js';
import { extractMetadata } from '../services/extraction.js';
import { getThoughtById, updateThought } from '../db/queries.js';
import type { ThoughtContext, ThoughtType, UpdateThoughtParams } from '../types/index.js';

export const updateThoughtSchema = z.object({
  id: z.string().uuid().describe('The UUID of the thought to update'),
  text: z
    .string()
    .min(1)
    .max(10000)
    .optional()
    .describe('New text content. If changed, embedding and metadata are automatically re-generated.'),
  context: z
    .enum(['work', 'personal'])
    .optional()
    .describe('Override context classification'),
  people: z
    .array(z.string())
    .optional()
    .describe('Override extracted people'),
  topics: z
    .array(z.string())
    .optional()
    .describe('Override extracted topics'),
  thought_type: z
    .enum([
      'decision', 'insight', 'meeting_note', 'idea',
      'task', 'observation', 'reference', 'personal_note',
    ])
    .optional()
    .describe('Override thought type classification'),
});

export type UpdateThoughtInput = z.infer<typeof updateThoughtSchema>;

export async function updateThoughtTool(input: UpdateThoughtInput): Promise<CallToolResult> {
  try {
    const { id, text, context, people, topics, thought_type } = updateThoughtSchema.parse(input);

    const hasTextChange = text !== undefined;
    const hasMetadataChange =
      context !== undefined ||
      people !== undefined ||
      topics !== undefined ||
      thought_type !== undefined;

    if (!hasTextChange && !hasMetadataChange) {
      return {
        content: [{ type: 'text', text: 'No fields to update. Provide at least one field to change.' }],
        isError: true,
      };
    }

    const existing = await getThoughtById(id);
    if (!existing) {
      return {
        content: [{ type: 'text', text: `Thought not found: ${id}` }],
        isError: true,
      };
    }

    const params: UpdateThoughtParams = { id };

    if (hasTextChange) {
      // Path A: text changed — re-generate embedding and re-extract metadata
      const [embedding, extracted] = await Promise.all([
        generateEmbedding(text),
        extractMetadata(text, context as ThoughtContext | undefined),
      ]);

      params.raw_text = text;
      params.embedding = embedding;
      // Explicit overrides take priority over re-extracted values
      params.context = context ?? extracted.context;
      params.people = people ?? extracted.people;
      params.topics = topics ?? extracted.topics;
      params.thought_type = (thought_type ?? extracted.thought_type) as ThoughtType | null;
      params.action_items = extracted.action_items;
    } else {
      // Path B: metadata-only edit — no expensive calls
      if (context !== undefined) params.context = context;
      if (people !== undefined) params.people = people;
      if (topics !== undefined) params.topics = topics;
      if (thought_type !== undefined) params.thought_type = thought_type as ThoughtType;
    }

    const updated = await updateThought(params);
    if (!updated) {
      return {
        content: [{ type: 'text', text: `Failed to update thought: ${id}` }],
        isError: true,
      };
    }

    const changes: string[] = [];
    if (hasTextChange) changes.push('text (embedding + metadata re-generated)');
    if (context !== undefined) changes.push('context');
    if (people !== undefined) changes.push('people');
    if (topics !== undefined) changes.push('topics');
    if (thought_type !== undefined) changes.push('thought_type');

    const lines = [
      `Thought updated successfully.`,
      ``,
      `ID: ${updated.id}`,
      `Changed: ${changes.join(', ')}`,
      `Context: ${updated.context}`,
      `Type: ${updated.thought_type ?? 'none'}`,
      `Topics: ${updated.topics.length > 0 ? updated.topics.join(', ') : 'none'}`,
      `People: ${updated.people.length > 0 ? updated.people.join(', ') : 'none'}`,
      `Updated at: ${new Date(updated.updated_at).toISOString()}`,
    ];

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `Error updating thought: ${message}` }],
      isError: true,
    };
  }
}
