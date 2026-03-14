import { generateEmbedding, generateContextualEmbedding } from './embeddings.js';
import { extractMetadata } from './extraction.js';
import {
  findByIdempotencyKey,
  findDuplicates,
  getThoughtById,
  insertThought,
  updateThought,
} from '../db/queries.js';
import type {
  DuplicateCandidate,
  LifeDomain,
  Thought,
  ThoughtType,
  UpdateThoughtParams,
} from '../types/index.js';

export interface CaptureThoughtParams {
  text: string;
  explicitContext?: LifeDomain;
  force?: boolean;
  idempotencyKey?: string;
}

export type CaptureThoughtResult =
  | {
      status: 'created';
      thought: Thought;
      duplicate: false;
    }
  | {
      status: 'duplicate';
      duplicate: true;
      thought: Thought | null;
      candidate: DuplicateCandidate;
      viaIdempotencyKey: boolean;
    };

export interface UpdateThoughtOperationParams {
  id: string;
  text?: string;
  context?: LifeDomain;
  people?: string[];
  topics?: string[];
  thought_type?: ThoughtType;
}

export interface UpdateThoughtOperationResult {
  updated: Thought;
  changedFields: string[];
}

export interface AppendThoughtParams {
  id: string;
  text: string;
  position?: 'append' | 'prepend';
  separator?: string;
}

export interface AppendThoughtResult {
  updated: Thought;
  combinedText: string;
}

export async function prepareThoughtContent(
  text: string,
  explicitContext?: LifeDomain
): Promise<{
  plainEmbedding: number[];
  metadata: Awaited<ReturnType<typeof extractMetadata>>;
  contextualEmbedding: number[];
}> {
  const normalizedText = text.trim();
  if (normalizedText.length === 0 || normalizedText.length > 10000) {
    throw new Error('text must be between 1 and 10000 characters');
  }
  const [plainEmbedding, metadata] = await Promise.all([
    generateEmbedding(normalizedText),
    extractMetadata(normalizedText, explicitContext),
  ]);

  const contextualEmbedding = await generateContextualEmbedding(normalizedText, {
    context: metadata.context,
    topics: metadata.topics,
    people: metadata.people,
  });

  return {
    plainEmbedding,
    metadata,
    contextualEmbedding,
  };
}

export async function captureThoughtRecord(
  params: CaptureThoughtParams
): Promise<CaptureThoughtResult> {
  const normalizedText = params.text.trim();

  if (params.idempotencyKey) {
    const existing = await findByIdempotencyKey(params.idempotencyKey);
    if (existing) {
      return {
        status: 'duplicate',
        duplicate: true,
        thought: existing,
        candidate: {
          id: existing.id,
          raw_text: existing.raw_text,
          context: existing.context,
          similarity: 1,
        },
        viaIdempotencyKey: true,
      };
    }
  }

  const { plainEmbedding, metadata, contextualEmbedding } = await prepareThoughtContent(
    normalizedText,
    params.explicitContext
  );

  if (!params.force) {
    const duplicates = await findDuplicates(normalizedText, plainEmbedding);
    if (duplicates.length > 0) {
      return {
        status: 'duplicate',
        duplicate: true,
        thought: null,
        candidate: duplicates[0],
        viaIdempotencyKey: false,
      };
    }
  }

  const thought = await insertThought({
    raw_text: normalizedText,
    embedding: contextualEmbedding,
    context: metadata.context,
    people: metadata.people,
    topics: metadata.topics,
    thought_type: metadata.thought_type,
    action_items: metadata.action_items,
    metadata: {},
    idempotency_key: params.idempotencyKey,
  });

  return {
    status: 'created',
    thought,
    duplicate: false,
  };
}

export async function updateThoughtRecord(
  params: UpdateThoughtOperationParams
): Promise<UpdateThoughtOperationResult | null> {
  const existing = await getThoughtById(params.id);
  if (!existing) return null;

  const hasTextChange = params.text !== undefined;
  const updateParams: UpdateThoughtParams = { id: params.id };
  const changedFields: string[] = [];

  if (hasTextChange) {
    const text = params.text!.trim();
    const { metadata, contextualEmbedding } = await prepareThoughtContent(text, params.context);

    updateParams.raw_text = text;
    updateParams.embedding = contextualEmbedding;
    updateParams.context = params.context ?? metadata.context;
    updateParams.people = params.people ?? metadata.people;
    updateParams.topics = params.topics ?? metadata.topics;
    updateParams.thought_type = params.thought_type ?? metadata.thought_type;
    updateParams.action_items = metadata.action_items;

    changedFields.push('text', 'embedding', 'metadata');
  } else {
    if (params.context !== undefined) {
      updateParams.context = params.context;
      changedFields.push('context');
    }
    if (params.people !== undefined) {
      updateParams.people = params.people;
      changedFields.push('people');
    }
    if (params.topics !== undefined) {
      updateParams.topics = params.topics;
      changedFields.push('topics');
    }
    if (params.thought_type !== undefined) {
      updateParams.thought_type = params.thought_type;
      changedFields.push('thought_type');
    }
  }

  const updated = await updateThought(updateParams);
  if (!updated) return null;

  return { updated, changedFields };
}

export async function appendToThought(params: AppendThoughtParams): Promise<AppendThoughtResult | null> {
  const existing = await getThoughtById(params.id);
  if (!existing) return null;

  const position = params.position ?? 'append';
  const separator = params.separator ?? '\n\n';
  const incomingText = params.text.trim();

  const combinedText =
    position === 'prepend'
      ? incomingText + separator + existing.raw_text
      : existing.raw_text + separator + incomingText;

  if (combinedText.length === 0 || combinedText.length > 10000) {
    throw new Error('Combined text would exceed 10000 character limit');
  }

  const result = await updateThoughtRecord({
    id: params.id,
    text: combinedText,
  });

  if (!result) return null;

  return {
    updated: result.updated,
    combinedText,
  };
}
