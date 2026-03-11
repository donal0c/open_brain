#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { captureThought } from './tools/capture.js';
import { searchThoughts } from './tools/search.js';
import { listRecentThoughts } from './tools/recent.js';
import { metadataSearchThoughts } from './tools/metadata-search.js';
import { getThought } from './tools/get.js';
import { updateThoughtTool } from './tools/update.js';
import { deleteThoughtTool } from './tools/delete.js';
import { appendThoughtTool } from './tools/append.js';
import { getThoughtStats } from './tools/stats.js';
import { linkThoughts } from './tools/link.js';
import { getLinked } from './tools/get-linked.js';
import { unlinkThoughts } from './tools/unlink.js';

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

  server.registerTool('get_thought', {
    title: 'Get Thought',
    description:
      'Retrieve a single thought by its ID with full untruncated text. Use semantic_search or list_recent first to find the thought ID.',
    inputSchema: {
      id: z.string().uuid().describe('The UUID of the thought to retrieve'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args) => {
    return getThought(args);
  });

  server.registerTool('update_thought', {
    title: 'Update Thought',
    description:
      'Update an existing thought by ID. Use semantic_search or list_recent first to find the thought ID. If text is changed, embedding and metadata are automatically re-generated. Provide only the fields you want to change.',
    inputSchema: {
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
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  }, async (args) => {
    return updateThoughtTool(args);
  });

  server.registerTool('delete_thought', {
    title: 'Delete Thought',
    description:
      'Permanently delete a thought by ID. Use semantic_search or list_recent first to find the thought ID. This action cannot be undone.',
    inputSchema: {
      id: z.string().uuid().describe('The UUID of the thought to delete'),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args) => {
    return deleteThoughtTool(args);
  });

  server.registerTool('append_thought', {
    title: 'Append to Thought',
    description:
      'Add text to an existing thought without replacing it. Use semantic_search or list_recent first to find the thought ID. Embedding and metadata are re-generated after modification.',
    inputSchema: {
      id: z.string().uuid().describe('The UUID of the thought to append to'),
      text: z.string().min(1).max(10000).describe('The text to append or prepend'),
      position: z
        .enum(['append', 'prepend'])
        .default('append')
        .describe('Where to add the text: append (end) or prepend (beginning). Default: append.'),
      separator: z
        .string()
        .max(100)
        .default('\n\n')
        .describe('Separator between existing and new text. Default: double newline.'),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  }, async (args) => {
    return appendThoughtTool(args);
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

  server.registerTool('link_thoughts', {
    title: 'Link Thoughts',
    description:
      'Create a typed relationship between two thoughts. Use semantic_search or list_recent to find thought IDs first. Relationships are directional: source -> relationship -> target.',
    inputSchema: {
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
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  }, async (args) => {
    return linkThoughts(args);
  });

  server.registerTool('get_linked', {
    title: 'Get Linked Thoughts',
    description:
      'Retrieve all thoughts linked to a given thought, showing relationship types and direction. Optionally filter by relationship type.',
    inputSchema: {
      id: z.string().uuid().describe('The UUID of the thought to get links for'),
      relationship: z
        .enum([
          'relates_to', 'extends', 'contradicts', 'supports',
          'follows_up', 'inspired_by', 'blocks',
        ])
        .optional()
        .describe('Optional: filter by relationship type'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args) => {
    return getLinked(args);
  });

  server.registerTool('unlink_thoughts', {
    title: 'Unlink Thoughts',
    description:
      'Remove a link between thoughts. Either provide the link_id (from get_linked), or provide source_id + target_id to remove links between a pair. Optionally filter by relationship type.',
    inputSchema: {
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
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args) => {
    return unlinkThoughts(args);
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
