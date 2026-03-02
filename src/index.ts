#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { captureThought } from './tools/capture.js';
import { searchThoughts } from './tools/search.js';
import { listRecentThoughts } from './tools/recent.js';
import { metadataSearchThoughts } from './tools/metadata-search.js';
import { getThoughtStats } from './tools/stats.js';

function createServer(): McpServer {
  const server = new McpServer({
    name: 'open-brain',
    version: '0.1.0',
  });

  server.registerTool('capture_thought', {
    title: 'Capture Thought',
    description:
      'Capture a thought or note. Automatically extracts people, topics, type, and action items. Auto-classifies as work/personal if context not specified.',
    inputSchema: {
      text: z.string().min(1).max(10000).describe('The thought or note to capture'),
      context: z
        .enum(['work', 'personal'])
        .optional()
        .describe('Optional: classify as work or personal. Auto-classified if omitted.'),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  }, async (args) => {
    return captureThought(args);
  });

  server.registerTool('semantic_search', {
    title: 'Semantic Search',
    description:
      'Search thoughts by meaning using vector similarity. Returns results ranked by relevance.',
    inputSchema: {
      query: z.string().min(1).max(2000).describe('Natural language search query'),
      context: z
        .enum(['work', 'personal'])
        .optional()
        .describe('Optional: filter by context'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(10)
        .describe('Max results to return (default 10)'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args) => {
    return searchThoughts(args);
  });

  server.registerTool('list_recent', {
    title: 'List Recent Thoughts',
    description:
      'List recent thoughts ordered by creation time. Optionally filter by context.',
    inputSchema: {
      context: z
        .enum(['work', 'personal'])
        .optional()
        .describe('Optional: filter by context'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(20)
        .describe('Max results to return (default 20)'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args) => {
    return listRecentThoughts(args);
  });

  server.registerTool('search_by_metadata', {
    title: 'Search by Metadata',
    description:
      'Search thoughts by structured metadata filters (people, topics, type, dates, context). Filters combine with AND logic.',
    inputSchema: {
      people: z
        .array(z.string())
        .optional()
        .describe('Filter by people mentioned'),
      topics: z
        .array(z.string())
        .optional()
        .describe('Filter by topics'),
      thought_type: z
        .enum([
          'decision', 'insight', 'meeting_note', 'idea',
          'task', 'observation', 'reference', 'personal_note',
        ])
        .optional()
        .describe('Filter by thought type'),
      context: z
        .enum(['work', 'personal'])
        .optional()
        .describe('Filter by context'),
      date_from: z.string().optional().describe('Filter from date (ISO 8601)'),
      date_to: z.string().optional().describe('Filter to date (ISO 8601)'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(20)
        .describe('Max results to return (default 20)'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args) => {
    return metadataSearchThoughts(args);
  });

  server.registerTool('stats', {
    title: 'Thought Statistics',
    description:
      'Get aggregate statistics: totals, breakdowns by context and type, top topics, top people, recent activity.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async () => {
    return getThoughtStats();
  });

  return server;
}

async function main() {
  const missing: string[] = [];
  if (!process.env.SUPABASE_DB_URL) missing.push('SUPABASE_DB_URL');
  if (!process.env.OPENAI_API_KEY) missing.push('OPENAI_API_KEY');
  if (!process.env.AWS_REGION) missing.push('AWS_REGION');

  if (missing.length > 0) {
    console.error(`FATAL: Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }

  const server = createServer();
  const transport = new StdioServerTransport();

  process.on('SIGINT', async () => {
    await server.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await server.close();
    process.exit(0);
  });

  await server.connect(transport);
  console.error('Open Brain MCP server started');
}

main().catch((err) => {
  console.error('Fatal error starting server:', err);
  process.exit(1);
});
