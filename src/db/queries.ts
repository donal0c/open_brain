import { sql } from './client.js';
import type {
  InsertThoughtParams,
  MetadataSearchParams,
  Thought,
  ThoughtContext,
  ThoughtStats,
  ThoughtWithScore,
  UpdateThoughtParams,
} from '../types/index.js';

/** Format a string[] as a PostgreSQL array literal: {"a","b","c"} */
function pgArray(arr: string[]): string {
  const escaped = arr.map((s) => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"');
  return '{' + escaped.join(',') + '}';
}

export async function getThoughtById(id: string): Promise<Thought | null> {
  const rows = await sql<Thought[]>`
    SELECT id, raw_text, context, people, topics, thought_type,
           action_items, metadata, created_at, updated_at
    FROM thoughts
    WHERE id = ${id}
  `;
  return rows[0] ?? null;
}

export async function deleteThought(id: string): Promise<{ id: string; raw_text: string } | null> {
  const rows = await sql<{ id: string; raw_text: string }[]>`
    DELETE FROM thoughts WHERE id = ${id}
    RETURNING id, raw_text
  `;
  return rows[0] ?? null;
}

export async function updateThought(params: UpdateThoughtParams): Promise<Thought | null> {
  const setClauses: ReturnType<typeof sql>[] = [];

  if (params.raw_text !== undefined) {
    setClauses.push(sql`raw_text = ${params.raw_text}`);
  }
  if (params.embedding !== undefined) {
    setClauses.push(sql`embedding = ${JSON.stringify(params.embedding)}::vector`);
  }
  if (params.context !== undefined) {
    setClauses.push(sql`context = ${params.context}`);
  }
  if (params.people !== undefined) {
    setClauses.push(sql`people = ${pgArray(params.people)}::text[]`);
  }
  if (params.topics !== undefined) {
    setClauses.push(sql`topics = ${pgArray(params.topics)}::text[]`);
  }
  if (params.thought_type !== undefined) {
    setClauses.push(sql`thought_type = ${params.thought_type}`);
  }
  if (params.action_items !== undefined) {
    setClauses.push(sql`action_items = ${JSON.stringify(params.action_items)}::jsonb`);
  }

  if (setClauses.length === 0) {
    return getThoughtById(params.id);
  }

  const setClause = setClauses.reduce(
    (acc, clause, i) => (i === 0 ? clause : sql`${acc}, ${clause}`)
  );

  const rows = await sql<Thought[]>`
    UPDATE thoughts
    SET ${setClause}
    WHERE id = ${params.id}
    RETURNING id, raw_text, context, people, topics, thought_type,
              action_items, metadata, created_at, updated_at
  `;
  return rows[0] ?? null;
}

export async function insertThought(params: InsertThoughtParams): Promise<Thought> {
  const rows = await sql<Thought[]>`
    INSERT INTO thoughts (
      raw_text, embedding, context, people, topics,
      thought_type, action_items, metadata
    ) VALUES (
      ${params.raw_text},
      ${JSON.stringify(params.embedding)}::vector,
      ${params.context},
      ${pgArray(params.people)}::text[],
      ${pgArray(params.topics)}::text[],
      ${params.thought_type},
      ${JSON.stringify(params.action_items)}::jsonb,
      ${JSON.stringify(params.metadata)}::jsonb
    )
    RETURNING id, raw_text, context, people, topics, thought_type,
              action_items, metadata, created_at, updated_at
  `;
  return rows[0];
}

export async function semanticSearch(
  queryEmbedding: number[],
  options: { context?: ThoughtContext; limit?: number } = {}
): Promise<ThoughtWithScore[]> {
  const limit = options.limit ?? 10;
  const embeddingStr = JSON.stringify(queryEmbedding);

  if (options.context) {
    return sql<ThoughtWithScore[]>`
      SELECT id, raw_text, context, people, topics, thought_type,
             action_items, metadata, created_at, updated_at,
             1 - (embedding <=> ${embeddingStr}::vector) AS similarity
      FROM thoughts
      WHERE context = ${options.context}
        AND embedding IS NOT NULL
      ORDER BY embedding <=> ${embeddingStr}::vector
      LIMIT ${limit}
    `;
  }

  return sql<ThoughtWithScore[]>`
    SELECT id, raw_text, context, people, topics, thought_type,
           action_items, metadata, created_at, updated_at,
           1 - (embedding <=> ${embeddingStr}::vector) AS similarity
    FROM thoughts
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> ${embeddingStr}::vector
    LIMIT ${limit}
  `;
}

export async function listRecent(
  options: { context?: ThoughtContext; limit?: number } = {}
): Promise<Thought[]> {
  const limit = options.limit ?? 20;

  if (options.context) {
    return sql<Thought[]>`
      SELECT id, raw_text, context, people, topics, thought_type,
             action_items, metadata, created_at, updated_at
      FROM thoughts
      WHERE context = ${options.context}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
  }

  return sql<Thought[]>`
    SELECT id, raw_text, context, people, topics, thought_type,
           action_items, metadata, created_at, updated_at
    FROM thoughts
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
}

export async function searchByMetadata(params: MetadataSearchParams): Promise<Thought[]> {
  const limit = params.limit ?? 20;
  const conditions: ReturnType<typeof sql>[] = [];

  if (params.context) {
    conditions.push(sql`context = ${params.context}`);
  }
  if (params.people && params.people.length > 0) {
    conditions.push(sql`people && ${pgArray(params.people)}::text[]`);
  }
  if (params.topics && params.topics.length > 0) {
    conditions.push(sql`topics && ${pgArray(params.topics)}::text[]`);
  }
  if (params.thought_type) {
    conditions.push(sql`thought_type = ${params.thought_type}`);
  }
  if (params.date_from) {
    conditions.push(sql`created_at >= ${params.date_from}::timestamptz`);
  }
  if (params.date_to) {
    conditions.push(sql`created_at <= ${params.date_to}::timestamptz`);
  }

  if (conditions.length === 0) {
    return sql<Thought[]>`
      SELECT id, raw_text, context, people, topics, thought_type,
             action_items, metadata, created_at, updated_at
      FROM thoughts
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
  }

  const whereClause = conditions.reduce(
    (acc, cond, i) => (i === 0 ? cond : sql`${acc} AND ${cond}`)
  );

  return sql<Thought[]>`
    SELECT id, raw_text, context, people, topics, thought_type,
           action_items, metadata, created_at, updated_at
    FROM thoughts
    WHERE ${whereClause}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
}

export async function getStats(): Promise<ThoughtStats> {
  const [
    totalResult,
    contextResult,
    typeResult,
    topicsResult,
    peopleResult,
    last7Result,
    last30Result,
  ] = await Promise.all([
    sql<[{ count: string }]>`SELECT COUNT(*)::text AS count FROM thoughts`,

    sql<{ context: ThoughtContext; count: string }[]>`
      SELECT context, COUNT(*)::text AS count
      FROM thoughts GROUP BY context
    `,

    sql<{ thought_type: string; count: string }[]>`
      SELECT thought_type, COUNT(*)::text AS count
      FROM thoughts WHERE thought_type IS NOT NULL
      GROUP BY thought_type ORDER BY count DESC
    `,

    sql<{ topic: string; count: string }[]>`
      SELECT unnest(topics) AS topic, COUNT(*)::text AS count
      FROM thoughts GROUP BY topic ORDER BY count DESC LIMIT 20
    `,

    sql<{ person: string; count: string }[]>`
      SELECT unnest(people) AS person, COUNT(*)::text AS count
      FROM thoughts GROUP BY person ORDER BY count DESC LIMIT 20
    `,

    sql<[{ count: string }]>`
      SELECT COUNT(*)::text AS count FROM thoughts
      WHERE created_at >= NOW() - INTERVAL '7 days'
    `,

    sql<[{ count: string }]>`
      SELECT COUNT(*)::text AS count FROM thoughts
      WHERE created_at >= NOW() - INTERVAL '30 days'
    `,
  ]);

  const by_context: Record<ThoughtContext, number> = {
    work: 0,
    personal: 0,
    unclassified: 0,
  };
  for (const row of contextResult) {
    by_context[row.context] = parseInt(row.count, 10);
  }

  const by_type: Record<string, number> = {};
  for (const row of typeResult) {
    by_type[row.thought_type] = parseInt(row.count, 10);
  }

  return {
    total_thoughts: parseInt(totalResult[0].count, 10),
    by_context,
    by_type,
    top_topics: topicsResult.map((r) => ({ topic: r.topic, count: parseInt(r.count, 10) })),
    top_people: peopleResult.map((r) => ({ person: r.person, count: parseInt(r.count, 10) })),
    thoughts_last_7_days: parseInt(last7Result[0].count, 10),
    thoughts_last_30_days: parseInt(last30Result[0].count, 10),
  };
}
