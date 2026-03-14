import { Hono } from 'hono';
import { createServer as createNetServer } from 'node:net';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { cors } from 'hono/cors';
import { generateEmbedding } from './services/embeddings.js';
import {
  listRecent,
  getStats,
  searchByMetadata,
  getThoughtById,
  getThoughtEmbedding,
  findRelated,
  reinforceThought,
  archiveThought,
  unarchiveThought,
  getTimeline,
  getThoughtsByTopic,
} from './db/queries.js';
import { hybridSearch } from './db/queries.js';
import { askBrainCore } from './services/ask.js';
import {
  appendToThought,
  captureThoughtRecord,
  updateThoughtRecord,
} from './services/thought-operations.js';
import type { LifeDomain, ThoughtType } from './types/index.js';
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { isAdminHttpEnabled } from './http-config.js';

const VALID_DOMAINS: LifeDomain[] = [
  'personal', 'family', 'health', 'finance',
  'social', 'creative', 'travel', 'unclassified',
];

const VALID_THOUGHT_TYPES: ThoughtType[] = [
  'decision', 'insight', 'meeting_note', 'idea',
  'task', 'observation', 'reference', 'personal_note',
];

let bedrockClient: BedrockRuntimeClient | null = null;

function getBedrockClient(): BedrockRuntimeClient {
  if (!bedrockClient) {
    bedrockClient = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || 'us-east-1',
    });
  }
  return bedrockClient;
}

async function ensurePortAvailable(port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const server = createNetServer();

    server.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        reject(new Error(`HTTP port ${port} is already in use`));
        return;
      }
      reject(error);
    });

    server.listen(port, () => {
      server.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }
        resolve();
      });
    });
  });
}

export async function startHttpServer(): Promise<void> {
  const port = parseInt(process.env.HTTP_PORT || '3001', 10);
  const apiToken = process.env.API_TOKEN;
  const adminHttpEnabled = isAdminHttpEnabled(process.env.OPEN_BRAIN_ENABLE_ADMIN_HTTP);

  const app = new Hono();

  // CORS for PWA client
  app.use('*', cors());

  // Serve PWA static files from pwa/
  app.use('/pwa/*', serveStatic({ root: './' }));

  // Auth middleware for /api routes (optional - skipped if no API_TOKEN set)
  if (apiToken) {
    app.use('/api/*', async (c, next) => {
      const auth = c.req.header('Authorization');
      if (!auth || auth !== `Bearer ${apiToken}`) {
        return c.json({ error: 'Unauthorized' }, 401);
      }
      await next();
    });
  }

  app.get('/health', (c) => c.json({ status: 'ok' }));

  // POST /api/capture - Capture a new thought
  app.post('/api/capture', async (c) => {
    try {
      const body = await c.req.json<{ text?: string; context?: string; force?: boolean }>();

      if (!body.text || typeof body.text !== 'string' || body.text.trim().length === 0) {
        return c.json({ error: 'text is required and must be a non-empty string' }, 400);
      }

      if (body.text.length > 10000) {
        return c.json({ error: 'text must be 10000 characters or less' }, 400);
      }

      const context = body.context as LifeDomain | undefined;
      if (context && !VALID_DOMAINS.includes(context)) {
        return c.json({ error: `Invalid context. Must be one of: ${VALID_DOMAINS.join(', ')}` }, 400);
      }

      const force = body.force === true;
      const idempotencyKey = c.req.header('X-Idempotency-Key') ?? undefined;
      const result = await captureThoughtRecord({
        text: body.text,
        explicitContext: context,
        force,
        idempotencyKey,
      });

      if (result.status === 'duplicate') {
        const statusCode = result.viaIdempotencyKey ? 200 : 409;
        const thought = result.thought;
        return c.json({
          id: result.candidate.id,
          context: thought?.context ?? result.candidate.context,
          type: thought?.thought_type ?? null,
          topics: thought?.topics ?? [],
          people: thought?.people ?? [],
          duplicate: true,
          similarity: Number(result.candidate.similarity).toFixed(3),
          message: result.viaIdempotencyKey
            ? 'Request already processed with this idempotency key.'
            : 'Duplicate detected. Thought not captured.',
        }, statusCode);
      }

      const thought = result.thought;
      return c.json({
        id: thought.id,
        context: thought.context,
        type: thought.thought_type,
        topics: thought.topics,
        people: thought.people,
        action_items: thought.action_items,
      }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: message }, 500);
    }
  });

  // GET /api/recent - List recent thoughts
  app.get('/api/recent', async (c) => {
    try {
      const context = c.req.query('context') as LifeDomain | undefined;
      const limit = Math.min(parseInt(c.req.query('limit') || '20', 10), 100);

      const thoughts = await listRecent({ context, limit });

      return c.json({
        count: thoughts.length,
        thoughts: thoughts.map((t) => ({
          id: t.id,
          text: t.raw_text,
          context: t.context,
          type: t.thought_type,
          topics: t.topics,
          people: t.people,
          confidence: t.confidence,
          created_at: t.created_at,
        })),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: message }, 500);
    }
  });

  // GET /api/search - Hybrid semantic + keyword search
  app.get('/api/search', async (c) => {
    try {
      const query = c.req.query('q');
      if (!query) {
        return c.json({ error: 'q parameter is required' }, 400);
      }

      const context = c.req.query('context') as LifeDomain | undefined;
      const limit = Math.min(parseInt(c.req.query('limit') || '10', 10), 50);

      const queryEmbedding = await generateEmbedding(query);
      const results = await hybridSearch(query, queryEmbedding, { context, limit });

      return c.json({
        count: results.length,
        thoughts: results.map((t) => ({
          id: t.id,
          text: t.raw_text,
          context: t.context,
          type: t.thought_type,
          topics: t.topics,
          people: t.people,
          similarity: Number(t.similarity).toFixed(3),
          confidence: t.confidence,
          created_at: t.created_at,
        })),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: message }, 500);
    }
  });

  // POST /api/ask - RAG Q&A against your thoughts
  app.post('/api/ask', async (c) => {
    try {
      const body = await c.req.json<{ question?: string; max_sources?: number }>();

      if (!body.question || typeof body.question !== 'string' || body.question.trim().length === 0) {
        return c.json({ error: 'question is required and must be a non-empty string' }, 400);
      }

      if (body.question.length > 2000) {
        return c.json({ error: 'question must be 2000 characters or less' }, 400);
      }

      const maxSources = Math.min(Math.max(body.max_sources ?? 10, 1), 20);
      const result = await askBrainCore(body.question.trim(), maxSources);

      return c.json({
        question: result.question,
        answer: result.answer,
        source_count: result.sources.length,
        sources: result.sources.map((s) => ({
          id: s.id,
          text: s.text.length > 200 ? s.text.slice(0, 200) + '...' : s.text,
          context: s.context,
          date: s.date,
        })),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: message }, 500);
    }
  });

  if (adminHttpEnabled) {
    app.get('/api/thought/:id', async (c) => {
      try {
        const id = c.req.param('id');
        const thought = await getThoughtById(id);

        if (!thought) {
          return c.json({ error: 'Thought not found' }, 404);
        }

        return c.json({
          id: thought.id,
          text: thought.raw_text,
          context: thought.context,
          type: thought.thought_type,
          topics: thought.topics,
          people: thought.people,
          action_items: thought.action_items,
          confidence: thought.confidence,
          active: thought.active,
          archived_reason: thought.archived_reason,
          created_at: thought.created_at,
          updated_at: thought.updated_at,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return c.json({ error: message }, 500);
      }
    });

    app.patch('/api/thought/:id', async (c) => {
      try {
        const id = c.req.param('id');
        const body = await c.req.json<{
          text?: string;
          context?: string;
          people?: string[];
          topics?: string[];
          thought_type?: string;
        }>();

        const hasTextChange = body.text !== undefined;
        const hasMetadataChange =
          body.context !== undefined ||
          body.people !== undefined ||
          body.topics !== undefined ||
          body.thought_type !== undefined;

        if (!hasTextChange && !hasMetadataChange) {
          return c.json({ error: 'No fields to update. Provide at least one field.' }, 400);
        }

        if (body.context && !VALID_DOMAINS.includes(body.context as LifeDomain)) {
          return c.json({ error: `Invalid context. Must be one of: ${VALID_DOMAINS.join(', ')}` }, 400);
        }

        if (body.thought_type && !VALID_THOUGHT_TYPES.includes(body.thought_type as ThoughtType)) {
          return c.json({ error: `Invalid thought_type. Must be one of: ${VALID_THOUGHT_TYPES.join(', ')}` }, 400);
        }

        const existing = await getThoughtById(id);
        if (!existing) {
          return c.json({ error: 'Thought not found' }, 404);
        }

        if (hasTextChange) {
          const text = body.text!.trim();
          if (text.length === 0 || text.length > 10000) {
            return c.json({ error: 'text must be between 1 and 10000 characters' }, 400);
          }
        }

        const result = await updateThoughtRecord({
          id,
          text: body.text,
          context: body.context as LifeDomain | undefined,
          people: body.people,
          topics: body.topics,
          thought_type: body.thought_type as ThoughtType | undefined,
        });
        if (!result) {
          return c.json({ error: 'Failed to update thought' }, 500);
        }
        const updated = result.updated;

        return c.json({
          id: updated.id,
          text: updated.raw_text,
          context: updated.context,
          type: updated.thought_type,
          topics: updated.topics,
          people: updated.people,
          action_items: updated.action_items,
          confidence: updated.confidence,
          active: updated.active,
          updated_at: updated.updated_at,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return c.json({ error: message }, 500);
      }
    });

    app.post('/api/thought/:id/append', async (c) => {
      try {
        const id = c.req.param('id');
        const body = await c.req.json<{
          text?: string;
          position?: 'append' | 'prepend';
          separator?: string;
        }>();

        if (!body.text || typeof body.text !== 'string' || body.text.trim().length === 0) {
          return c.json({ error: 'text is required and must be a non-empty string' }, 400);
        }

        if (body.text.length > 10000) {
          return c.json({ error: 'text must be 10000 characters or less' }, 400);
        }

        const position = body.position ?? 'append';
        if (position !== 'append' && position !== 'prepend') {
          return c.json({ error: 'position must be "append" or "prepend"' }, 400);
        }

        const separator = body.separator ?? '\n\n';

        const existing = await getThoughtById(id);
        if (!existing) {
          return c.json({ error: 'Thought not found' }, 404);
        }

        const combinedText =
          position === 'prepend'
            ? body.text.trim() + separator + existing.raw_text
            : existing.raw_text + separator + body.text.trim();

        if (combinedText.length > 10000) {
          return c.json({ error: 'Combined text would exceed 10000 character limit' }, 400);
        }

        const result = await appendToThought({
          id,
          text: body.text,
          position,
          separator,
        });
        if (!result) {
          return c.json({ error: 'Failed to update thought' }, 500);
        }
        const updated = result.updated;

        return c.json({
          id: updated.id,
          text: updated.raw_text,
          context: updated.context,
          type: updated.thought_type,
          topics: updated.topics,
          people: updated.people,
          action_items: updated.action_items,
          confidence: updated.confidence,
          updated_at: updated.updated_at,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return c.json({ error: message }, 500);
      }
    });

    app.get('/api/stats', async (c) => {
      try {
        const stats = await getStats();
        return c.json(stats);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return c.json({ error: message }, 500);
      }
    });

    app.post('/api/search-metadata', async (c) => {
      try {
        const body = await c.req.json<{
          people?: string[];
          topics?: string[];
          thought_type?: string;
          context?: string;
          date_from?: string;
          date_to?: string;
          limit?: number;
        }>();

        const context = body.context as LifeDomain | undefined;
        if (context && !VALID_DOMAINS.includes(context)) {
          return c.json({ error: `Invalid context. Must be one of: ${VALID_DOMAINS.join(', ')}` }, 400);
        }

        if (body.thought_type && !VALID_THOUGHT_TYPES.includes(body.thought_type as ThoughtType)) {
          return c.json({ error: `Invalid thought_type. Must be one of: ${VALID_THOUGHT_TYPES.join(', ')}` }, 400);
        }

        const limit = Math.min(Math.max(body.limit ?? 20, 1), 100);

        const results = await searchByMetadata({
          people: body.people,
          topics: body.topics,
          thought_type: body.thought_type as ThoughtType | undefined,
          context,
          date_from: body.date_from,
          date_to: body.date_to,
          limit,
        });

        return c.json({
          count: results.length,
          thoughts: results.map((t) => ({
            id: t.id,
            text: t.raw_text,
            context: t.context,
            type: t.thought_type,
            topics: t.topics,
            people: t.people,
            action_items: t.action_items,
            confidence: t.confidence,
            created_at: t.created_at,
          })),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return c.json({ error: message }, 500);
      }
    });

    app.post('/api/find-related', async (c) => {
      try {
        const body = await c.req.json<{ id?: string; limit?: number }>();

        if (!body.id || typeof body.id !== 'string') {
          return c.json({ error: 'id is required' }, 400);
        }

        const thought = await getThoughtById(body.id);
        if (!thought) {
          return c.json({ error: 'Thought not found' }, 404);
        }

        const embedding = await getThoughtEmbedding(body.id);
        if (!embedding) {
          return c.json({ error: 'Thought has no embedding' }, 400);
        }

        const limit = Math.min(Math.max(body.limit ?? 5, 1), 20);
        const results = await findRelated(body.id, embedding, limit);

        return c.json({
          source_id: body.id,
          count: results.length,
          thoughts: results.map((t) => ({
            id: t.id,
            text: t.raw_text,
            context: t.context,
            type: t.thought_type,
            topics: t.topics,
            people: t.people,
            similarity: Number(t.similarity).toFixed(3),
            confidence: t.confidence,
            created_at: t.created_at,
          })),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return c.json({ error: message }, 500);
      }
    });

    app.post('/api/reinforce', async (c) => {
      try {
        const body = await c.req.json<{ id?: string }>();

        if (!body.id || typeof body.id !== 'string') {
          return c.json({ error: 'id is required' }, 400);
        }

        const thought = await reinforceThought(body.id);
        if (!thought) {
          return c.json({ error: 'Thought not found or archived' }, 404);
        }

        return c.json({
          id: thought.id,
          confidence: thought.confidence,
          text: thought.raw_text.length > 200 ? thought.raw_text.slice(0, 200) + '...' : thought.raw_text,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return c.json({ error: message }, 500);
      }
    });

    app.post('/api/archive', async (c) => {
      try {
        const body = await c.req.json<{ id?: string; reason?: string }>();

        if (!body.id || typeof body.id !== 'string') {
          return c.json({ error: 'id is required' }, 400);
        }

        if (!body.reason || typeof body.reason !== 'string' || body.reason.trim().length === 0) {
          return c.json({ error: 'reason is required' }, 400);
        }

        if (body.reason.length > 500) {
          return c.json({ error: 'reason must be 500 characters or less' }, 400);
        }

        const thought = await archiveThought(body.id, body.reason.trim());
        if (!thought) {
          return c.json({ error: 'Thought not found' }, 404);
        }

        return c.json({
          id: thought.id,
          archived: true,
          reason: body.reason.trim(),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return c.json({ error: message }, 500);
      }
    });

    app.post('/api/unarchive', async (c) => {
      try {
        const body = await c.req.json<{ id?: string }>();

        if (!body.id || typeof body.id !== 'string') {
          return c.json({ error: 'id is required' }, 400);
        }

        const thought = await unarchiveThought(body.id);
        if (!thought) {
          return c.json({ error: 'Thought not found' }, 404);
        }

        return c.json({
          id: thought.id,
          archived: false,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return c.json({ error: message }, 500);
      }
    });

    app.get('/api/timeline', async (c) => {
      try {
        const topic = c.req.query('topic');
        const person = c.req.query('person');

        if (!topic && !person) {
          return c.json({ error: 'At least one of topic or person query param is required' }, 400);
        }

        const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 100);
        const results = await getTimeline({ topic, person, limit });

        return c.json({
          count: results.length,
          thoughts: results.map((t) => ({
            id: t.id,
            text: t.raw_text,
            context: t.context,
            type: t.thought_type,
            topics: t.topics,
            people: t.people,
            confidence: t.confidence,
            created_at: t.created_at,
          })),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return c.json({ error: message }, 500);
      }
    });

    app.post('/api/summarize', async (c) => {
      try {
        const body = await c.req.json<{ topic?: string; max_thoughts?: number }>();

        if (!body.topic || typeof body.topic !== 'string' || body.topic.trim().length === 0) {
          return c.json({ error: 'topic is required' }, 400);
        }

        if (body.topic.length > 200) {
          return c.json({ error: 'topic must be 200 characters or less' }, 400);
        }

        const maxThoughts = Math.min(Math.max(body.max_thoughts ?? 20, 1), 50);
        const thoughts = await getThoughtsByTopic(body.topic.trim(), maxThoughts);

        if (thoughts.length === 0) {
          return c.json({ topic: body.topic.trim(), thought_count: 0, summary: null });
        }

        const thoughtTexts = thoughts.map((t, i) => {
          const date = new Date(t.created_at).toISOString().split('T')[0];
          return `[${i + 1}] (${date}, ${t.context}) ${t.raw_text}`;
        }).join('\n\n');

        const modelId = process.env.BEDROCK_MODEL_ID || 'us.anthropic.claude-sonnet-4-6';

        const command = new InvokeModelCommand({
          modelId,
          contentType: 'application/json',
          accept: 'application/json',
          body: JSON.stringify({
            anthropic_version: 'bedrock-2023-05-31',
            max_tokens: 2048,
            temperature: 0,
            messages: [
              {
                role: 'user',
                content: `You are synthesizing a person's thoughts on the topic "${body.topic.trim()}". Below are ${thoughts.length} thought entries. Provide a concise synthesis that:

1. Summarizes the key themes and patterns across these thoughts
2. Notes any evolution or changes in thinking over time
3. Highlights any contradictions or unresolved questions
4. Lists key action items or decisions mentioned

Be direct and concise. Use bullet points where appropriate.

Thoughts:
${thoughtTexts}`,
              },
            ],
          }),
        });

        const response = await getBedrockClient().send(command);
        const responseBody = JSON.parse(new TextDecoder().decode(response.body));
        const summary = responseBody.content[0].text;

        return c.json({
          topic: body.topic.trim(),
          thought_count: thoughts.length,
          summary,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return c.json({ error: message }, 500);
      }
    });
  }

  await ensurePortAvailable(port);
  serve({ fetch: app.fetch, port }, () => {
    console.error(`HTTP server listening on port ${port}`);
  });
}
