import { sql } from './client.js';
import type {
  DuplicateCandidate,
  InsertThoughtParams,
  LifeDomain,
  LinkRelationship,
  MetadataSearchParams,
  Thought,
  ThoughtLink,
  ThoughtLinkWithThought,
  ThoughtStats,
  ThoughtWithScore,
  UpdateThoughtParams,
} from '../types/index.js';

/** Format a string[] as a PostgreSQL array literal: {"a","b","c"} */
function pgArray(arr: string[]): string {
  const escaped = arr.map((s) => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"');
  return '{' + escaped.join(',') + '}';
}

export async function getThoughtEmbedding(id: string): Promise<number[] | null> {
  const rows = await sql<{ embedding: string }[]>`
    SELECT embedding::text FROM thoughts WHERE id = ${id} AND embedding IS NOT NULL
  `;
  if (rows.length === 0 || !rows[0].embedding) return null;
  return JSON.parse(rows[0].embedding);
}

export async function getThoughtById(id: string): Promise<Thought | null> {
  const rows = await sql<Thought[]>`
    SELECT id, raw_text, context, people, topics, thought_type,
           action_items, metadata, confidence, active, archived_reason, created_at, updated_at
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
  if (params.confidence !== undefined) {
    setClauses.push(sql`confidence = ${params.confidence}`);
  }
  if (params.active !== undefined) {
    setClauses.push(sql`active = ${params.active}`);
  }
  if (params.archived_reason !== undefined) {
    setClauses.push(sql`archived_reason = ${params.archived_reason}`);
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
              action_items, metadata, confidence, active, archived_reason, created_at, updated_at
  `;
  return rows[0] ?? null;
}

export async function findByIdempotencyKey(key: string): Promise<Thought | null> {
  const rows = await sql<Thought[]>`
    SELECT id, raw_text, context, people, topics, thought_type,
           action_items, metadata, confidence, active, archived_reason, created_at, updated_at
    FROM thoughts
    WHERE idempotency_key = ${key}
  `;
  return rows[0] ?? null;
}

export async function insertThought(params: InsertThoughtParams): Promise<Thought> {
  const rows = await sql<Thought[]>`
    INSERT INTO thoughts (
      raw_text, embedding, context, people, topics,
      thought_type, action_items, metadata, idempotency_key
    ) VALUES (
      ${params.raw_text},
      ${JSON.stringify(params.embedding)}::vector,
      ${params.context},
      ${pgArray(params.people)}::text[],
      ${pgArray(params.topics)}::text[],
      ${params.thought_type},
      ${JSON.stringify(params.action_items)}::jsonb,
      ${JSON.stringify(params.metadata)}::jsonb,
      ${params.idempotency_key ?? null}
    )
    RETURNING id, raw_text, context, people, topics, thought_type,
              action_items, metadata, confidence, active, archived_reason, created_at, updated_at
  `;
  return rows[0];
}

export async function semanticSearch(
  queryEmbedding: number[],
  options: { context?: LifeDomain; limit?: number } = {}
): Promise<ThoughtWithScore[]> {
  const limit = options.limit ?? 10;
  const embeddingStr = JSON.stringify(queryEmbedding);

  if (options.context) {
    return sql<ThoughtWithScore[]>`
      SELECT id, raw_text, context, people, topics, thought_type,
             action_items, metadata, confidence, active, archived_reason, created_at, updated_at,
             1 - (embedding <=> ${embeddingStr}::vector) AS similarity
      FROM thoughts
      WHERE context = ${options.context}
        AND embedding IS NOT NULL
        AND active = true
      ORDER BY embedding <=> ${embeddingStr}::vector
      LIMIT ${limit}
    `;
  }

  return sql<ThoughtWithScore[]>`
    SELECT id, raw_text, context, people, topics, thought_type,
           action_items, metadata, confidence, active, archived_reason, created_at, updated_at,
           1 - (embedding <=> ${embeddingStr}::vector) AS similarity
    FROM thoughts
    WHERE embedding IS NOT NULL
      AND active = true
    ORDER BY embedding <=> ${embeddingStr}::vector
    LIMIT ${limit}
  `;
}

export async function hybridSearch(
  queryText: string,
  queryEmbedding: number[],
  options: { context?: LifeDomain; limit?: number } = {}
): Promise<ThoughtWithScore[]> {
  const limit = options.limit ?? 10;
  const candidateLimit = Math.max(limit * 3, 30);
  const embeddingStr = JSON.stringify(queryEmbedding);

  const contextFilter = options.context
    ? sql`AND context = ${options.context}`
    : sql``;

  return sql<ThoughtWithScore[]>`
    WITH semantic AS (
      SELECT id,
             ROW_NUMBER() OVER (ORDER BY embedding <=> ${embeddingStr}::vector) AS rank
      FROM thoughts
      WHERE embedding IS NOT NULL AND active = true ${contextFilter}
      ORDER BY embedding <=> ${embeddingStr}::vector
      LIMIT ${candidateLimit}
    ),
    keyword AS (
      SELECT id,
             ROW_NUMBER() OVER (ORDER BY ts_rank_cd(search_vector, websearch_to_tsquery('english', ${queryText})) DESC) AS rank
      FROM thoughts
      WHERE search_vector @@ websearch_to_tsquery('english', ${queryText})
        AND active = true ${contextFilter}
      ORDER BY ts_rank_cd(search_vector, websearch_to_tsquery('english', ${queryText})) DESC
      LIMIT ${candidateLimit}
    ),
    fused AS (
      SELECT COALESCE(s.id, k.id) AS id,
             COALESCE(1.0 / (60 + s.rank), 0) * 1.0 +
             COALESCE(1.0 / (60 + k.rank), 0) * 1.5 AS rrf_score
      FROM semantic s
      FULL OUTER JOIN keyword k ON s.id = k.id
    )
    SELECT t.id, t.raw_text, t.context, t.people, t.topics, t.thought_type,
           t.action_items, t.metadata, t.confidence, t.active, t.archived_reason,
           t.created_at, t.updated_at,
           f.rrf_score AS similarity
    FROM fused f
    JOIN thoughts t ON t.id = f.id
    ORDER BY f.rrf_score DESC
    LIMIT ${limit}
  `;
}

export async function findDuplicates(
  text: string,
  embedding: number[],
  threshold: number = 0.85,
  options: { include_archived?: boolean } = {}
): Promise<DuplicateCandidate[]> {
  const embeddingStr = JSON.stringify(embedding);
  const activeFilter = options.include_archived ? sql`` : sql`AND active = true`;

  // Fast path: exact text match
  const exactMatches = await sql<DuplicateCandidate[]>`
    SELECT id, raw_text, context, 1.0::float AS similarity
    FROM thoughts
    WHERE raw_text = ${text}
      ${activeFilter}
    LIMIT 3
  `;
  if (exactMatches.length > 0) return exactMatches;

  // Semantic dedup: cosine similarity check
  return sql<DuplicateCandidate[]>`
    SELECT id, raw_text, context,
           1 - (embedding <=> ${embeddingStr}::vector) AS similarity
    FROM thoughts
    WHERE embedding IS NOT NULL
      ${activeFilter}
      AND 1 - (embedding <=> ${embeddingStr}::vector) >= ${threshold}
    ORDER BY embedding <=> ${embeddingStr}::vector
    LIMIT 3
  `;
}

export async function findRelated(
  thoughtId: string,
  embedding: number[],
  limit: number = 5
): Promise<ThoughtWithScore[]> {
  const embeddingStr = JSON.stringify(embedding);

  return sql<ThoughtWithScore[]>`
    SELECT id, raw_text, context, people, topics, thought_type,
           action_items, metadata, confidence, active, archived_reason, created_at, updated_at,
           1 - (embedding <=> ${embeddingStr}::vector) AS similarity
    FROM thoughts
    WHERE embedding IS NOT NULL
      AND active = true
      AND id != ${thoughtId}
    ORDER BY embedding <=> ${embeddingStr}::vector
    LIMIT ${limit}
  `;
}

export async function getThoughtsByTopic(
  topic: string,
  limit: number = 50
): Promise<Thought[]> {
  return sql<Thought[]>`
    SELECT id, raw_text, context, people, topics, thought_type,
           action_items, metadata, confidence, active, archived_reason, created_at, updated_at
    FROM thoughts
    WHERE ${topic} = ANY(topics)
      AND active = true
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
}

export async function getAllThoughts(
  options: { context?: LifeDomain; limit?: number; offset?: number } = {}
): Promise<Thought[]> {
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;

  if (options.context) {
    return sql<Thought[]>`
      SELECT id, raw_text, context, people, topics, thought_type,
             action_items, metadata, confidence, active, archived_reason, created_at, updated_at
      FROM thoughts
      WHERE context = ${options.context}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
  }

  return sql<Thought[]>`
    SELECT id, raw_text, context, people, topics, thought_type,
           action_items, metadata, confidence, active, archived_reason, created_at, updated_at
    FROM thoughts
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
}

export async function listRecent(
  options: { context?: LifeDomain; limit?: number; include_archived?: boolean } = {}
): Promise<Thought[]> {
  const limit = options.limit ?? 20;
  const activeFilter = options.include_archived ? sql`` : sql`AND active = true`;

  if (options.context) {
    return sql<Thought[]>`
      SELECT id, raw_text, context, people, topics, thought_type,
             action_items, metadata, confidence, active, archived_reason, created_at, updated_at
      FROM thoughts
      WHERE context = ${options.context} ${activeFilter}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
  }

  return sql<Thought[]>`
    SELECT id, raw_text, context, people, topics, thought_type,
           action_items, metadata, confidence, active, archived_reason, created_at, updated_at
    FROM thoughts
    WHERE true ${activeFilter}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
}

export async function searchByMetadata(params: MetadataSearchParams & { include_archived?: boolean }): Promise<Thought[]> {
  const limit = params.limit ?? 20;
  const conditions: ReturnType<typeof sql>[] = [];

  if (!params.include_archived) {
    conditions.push(sql`active = true`);
  }

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
             action_items, metadata, confidence, active, archived_reason, created_at, updated_at
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
           action_items, metadata, confidence, active, archived_reason, created_at, updated_at
    FROM thoughts
    WHERE ${whereClause}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
}

export async function insertLink(
  sourceId: string,
  targetId: string,
  relationship: LinkRelationship,
  note?: string
): Promise<ThoughtLink> {
  const rows = await sql<ThoughtLink[]>`
    INSERT INTO thought_links (source_id, target_id, relationship, note)
    VALUES (${sourceId}, ${targetId}, ${relationship}, ${note ?? null})
    RETURNING id, source_id, target_id, relationship, note, created_at
  `;
  return rows[0];
}

export async function getLinkedThoughts(
  thoughtId: string,
  relationship?: LinkRelationship
): Promise<ThoughtLinkWithThought[]> {
  if (relationship) {
    return sql<ThoughtLinkWithThought[]>`
      SELECT
        tl.id, tl.source_id, tl.target_id, tl.relationship, tl.note, tl.created_at,
        t.id AS "linked_thought.id",
        t.raw_text AS "linked_thought.raw_text",
        t.context AS "linked_thought.context",
        t.people AS "linked_thought.people",
        t.topics AS "linked_thought.topics",
        t.thought_type AS "linked_thought.thought_type",
        t.action_items AS "linked_thought.action_items",
        t.metadata AS "linked_thought.metadata",
        t.confidence AS "linked_thought.confidence",
        t.active AS "linked_thought.active",
        t.archived_reason AS "linked_thought.archived_reason",
        t.created_at AS "linked_thought.created_at",
        t.updated_at AS "linked_thought.updated_at"
      FROM thought_links tl
      JOIN thoughts t ON (
        CASE WHEN tl.source_id = ${thoughtId} THEN tl.target_id ELSE tl.source_id END = t.id
      )
      WHERE (tl.source_id = ${thoughtId} OR tl.target_id = ${thoughtId})
        AND tl.relationship = ${relationship}
      ORDER BY tl.created_at DESC
    `;
  }

  return sql<ThoughtLinkWithThought[]>`
    SELECT
      tl.id, tl.source_id, tl.target_id, tl.relationship, tl.note, tl.created_at,
      t.id AS "linked_thought.id",
      t.raw_text AS "linked_thought.raw_text",
      t.context AS "linked_thought.context",
      t.people AS "linked_thought.people",
      t.topics AS "linked_thought.topics",
      t.thought_type AS "linked_thought.thought_type",
      t.action_items AS "linked_thought.action_items",
      t.metadata AS "linked_thought.metadata",
      t.created_at AS "linked_thought.created_at",
      t.updated_at AS "linked_thought.updated_at"
    FROM thought_links tl
    JOIN thoughts t ON (
      CASE WHEN tl.source_id = ${thoughtId} THEN tl.target_id ELSE tl.source_id END = t.id
    )
    WHERE tl.source_id = ${thoughtId} OR tl.target_id = ${thoughtId}
    ORDER BY tl.created_at DESC
  `;
}

export async function deleteLinkById(linkId: string): Promise<ThoughtLink | null> {
  const rows = await sql<ThoughtLink[]>`
    DELETE FROM thought_links WHERE id = ${linkId}
    RETURNING id, source_id, target_id, relationship, note, created_at
  `;
  return rows[0] ?? null;
}

export async function deleteLinkByPair(
  sourceId: string,
  targetId: string,
  relationship?: LinkRelationship
): Promise<ThoughtLink[]> {
  if (relationship) {
    return sql<ThoughtLink[]>`
      DELETE FROM thought_links
      WHERE (
        (source_id = ${sourceId} AND target_id = ${targetId})
        OR (source_id = ${targetId} AND target_id = ${sourceId})
      ) AND relationship = ${relationship}
      RETURNING id, source_id, target_id, relationship, note, created_at
    `;
  }

  return sql<ThoughtLink[]>`
    DELETE FROM thought_links
    WHERE (
      (source_id = ${sourceId} AND target_id = ${targetId})
      OR (source_id = ${targetId} AND target_id = ${sourceId})
    )
    RETURNING id, source_id, target_id, relationship, note, created_at
  `;
}

export async function getStats(): Promise<ThoughtStats> {
  const [
    totalResult,
    activeResult,
    archivedResult,
    contextResult,
    typeResult,
    topicsResult,
    peopleResult,
    last7Result,
    last30Result,
    avgConfResult,
  ] = await Promise.all([
    sql<[{ count: string }]>`SELECT COUNT(*)::text AS count FROM thoughts`,
    sql<[{ count: string }]>`SELECT COUNT(*)::text AS count FROM thoughts WHERE active = true`,
    sql<[{ count: string }]>`SELECT COUNT(*)::text AS count FROM thoughts WHERE active = false`,

    sql<{ context: LifeDomain; count: string }[]>`
      SELECT context, COUNT(*)::text AS count
      FROM thoughts WHERE active = true
      GROUP BY context ORDER BY count DESC
    `,

    sql<{ thought_type: string; count: string }[]>`
      SELECT thought_type, COUNT(*)::text AS count
      FROM thoughts WHERE thought_type IS NOT NULL AND active = true
      GROUP BY thought_type ORDER BY count DESC
    `,

    sql<{ topic: string; count: string }[]>`
      SELECT unnest(topics) AS topic, COUNT(*)::text AS count
      FROM thoughts WHERE active = true
      GROUP BY topic ORDER BY count DESC LIMIT 20
    `,

    sql<{ person: string; count: string }[]>`
      SELECT unnest(people) AS person, COUNT(*)::text AS count
      FROM thoughts WHERE active = true
      GROUP BY person ORDER BY count DESC LIMIT 20
    `,

    sql<[{ count: string }]>`
      SELECT COUNT(*)::text AS count FROM thoughts
      WHERE created_at >= NOW() - INTERVAL '7 days' AND active = true
    `,

    sql<[{ count: string }]>`
      SELECT COUNT(*)::text AS count FROM thoughts
      WHERE created_at >= NOW() - INTERVAL '30 days' AND active = true
    `,

    sql<[{ avg: string | null }]>`
      SELECT ROUND(AVG(confidence), 1)::text AS avg
      FROM thoughts WHERE active = true
    `,
  ]);

  const by_context: Record<string, number> = {};
  for (const row of contextResult) {
    by_context[row.context] = parseInt(row.count, 10);
  }

  const by_type: Record<string, number> = {};
  for (const row of typeResult) {
    by_type[row.thought_type] = parseInt(row.count, 10);
  }

  return {
    total_thoughts: parseInt(totalResult[0].count, 10),
    active_thoughts: parseInt(activeResult[0].count, 10),
    archived_thoughts: parseInt(archivedResult[0].count, 10),
    by_context,
    by_type,
    top_topics: topicsResult.map((r) => ({ topic: r.topic, count: parseInt(r.count, 10) })),
    top_people: peopleResult.map((r) => ({ person: r.person, count: parseInt(r.count, 10) })),
    thoughts_last_7_days: parseInt(last7Result[0].count, 10),
    thoughts_last_30_days: parseInt(last30Result[0].count, 10),
    avg_confidence: parseFloat(avgConfResult[0].avg ?? '0'),
  };
}

export async function reinforceThought(
  id: string,
  note?: string
): Promise<Thought | null> {
  const rows = await sql<Thought[]>`
    UPDATE thoughts
    SET confidence = confidence + 1
    WHERE id = ${id} AND active = true
    RETURNING id, raw_text, context, people, topics, thought_type,
              action_items, metadata, confidence, active, archived_reason, created_at, updated_at
  `;
  return rows[0] ?? null;
}

export async function archiveThought(
  id: string,
  reason: string
): Promise<Thought | null> {
  const rows = await sql<Thought[]>`
    UPDATE thoughts
    SET active = false, archived_reason = ${reason}
    WHERE id = ${id}
    RETURNING id, raw_text, context, people, topics, thought_type,
              action_items, metadata, confidence, active, archived_reason, created_at, updated_at
  `;
  return rows[0] ?? null;
}

export async function unarchiveThought(id: string): Promise<Thought | null> {
  const rows = await sql<Thought[]>`
    UPDATE thoughts
    SET active = true, archived_reason = null
    WHERE id = ${id}
    RETURNING id, raw_text, context, people, topics, thought_type,
              action_items, metadata, confidence, active, archived_reason, created_at, updated_at
  `;
  return rows[0] ?? null;
}

export async function getTimeline(
  options: { topic?: string; person?: string; limit?: number } = {}
): Promise<Thought[]> {
  const limit = options.limit ?? 50;
  const conditions: ReturnType<typeof sql>[] = [sql`active = true`];

  if (options.topic) {
    conditions.push(sql`${options.topic} = ANY(topics)`);
  }
  if (options.person) {
    conditions.push(sql`${options.person} = ANY(people)`);
  }

  const whereClause = conditions.reduce(
    (acc, cond, i) => (i === 0 ? cond : sql`${acc} AND ${cond}`)
  );

  return sql<Thought[]>`
    SELECT id, raw_text, context, people, topics, thought_type,
           action_items, metadata, confidence, active, archived_reason, created_at, updated_at
    FROM thoughts
    WHERE ${whereClause}
    ORDER BY created_at ASC
    LIMIT ${limit}
  `;
}
