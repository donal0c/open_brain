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
import { findRelatedThoughts } from './tools/find-related.js';
import { summarizeTopic } from './tools/summarize-topic.js';
import { exportThoughts } from './tools/export.js';
import { bulkCapture } from './tools/bulk-capture.js';
import { reinforceThoughtTool } from './tools/reinforce.js';
import { archiveThoughtTool, unarchiveThoughtTool } from './tools/archive.js';
import { thoughtTimeline } from './tools/timeline.js';
import { mergeThoughts } from './tools/merge.js';
import { askBrain } from './tools/ask.js';
import { startHttpServer } from './http-server.js';

function createServer(): McpServer {
  const server = new McpServer({
    name: 'open-brain',
    version: '0.1.0',
  });

  server.registerTool('capture_thought', {
    title: 'Capture Thought',
    description:
      'Capture a thought or note. Automatically extracts people, topics, type, and action items. Auto-classifies into a life domain if context not specified. Checks for duplicates before inserting.',
    inputSchema: {
      text: z.string().min(1).max(10000).describe('The thought or note to capture'),
      context: z
        .enum(['personal', 'family', 'health', 'finance', 'social', 'creative', 'travel'])
        .optional()
        .describe('Optional: classify into a life domain. Auto-classified if omitted.'),
      force: z
        .boolean()
        .default(false)
        .describe('Skip duplicate detection and force capture. Default: false.'),
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
        .enum(['personal', 'family', 'health', 'finance', 'social', 'creative', 'travel'])
        .optional()
        .describe('Override life domain classification'),
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
      'Search thoughts by meaning using hybrid search (vector similarity + keyword matching via RRF). Returns results ranked by relevance.',
    inputSchema: {
      query: z.string().min(1).max(2000).describe('Natural language search query'),
      context: z
        .enum(['personal', 'family', 'health', 'finance', 'social', 'creative', 'travel'])
        .optional()
        .describe('Optional: filter by life domain'),
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
      'List recent thoughts ordered by creation time. Optionally filter by life domain.',
    inputSchema: {
      context: z
        .enum(['personal', 'family', 'health', 'finance', 'social', 'creative', 'travel'])
        .optional()
        .describe('Optional: filter by life domain'),
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
        .enum(['personal', 'family', 'health', 'finance', 'social', 'creative', 'travel'])
        .optional()
        .describe('Filter by life domain'),
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

  server.registerTool('find_related', {
    title: 'Find Related Thoughts',
    description:
      'Find thoughts semantically related to a given thought. Returns the most similar thoughts by embedding distance, excluding the source thought itself.',
    inputSchema: {
      id: z.string().uuid().describe('The UUID of the thought to find related thoughts for'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(20)
        .default(5)
        .describe('Max related thoughts to return (default 5)'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args) => {
    return findRelatedThoughts(args);
  });

  server.registerTool('summarize_topic', {
    title: 'Summarize Topic',
    description:
      'Synthesize all thoughts on a given topic using LLM. Returns a summary of key themes, evolution of thinking, contradictions, and action items across all matching thoughts.',
    inputSchema: {
      topic: z.string().min(1).max(200).describe('The topic to summarize across all thoughts'),
      max_thoughts: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(20)
        .describe('Max thoughts to include in synthesis (default 20)'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  }, async (args) => {
    return summarizeTopic(args);
  });

  server.registerTool('export_thoughts', {
    title: 'Export Thoughts',
    description:
      'Export thoughts as Markdown or JSON. Optionally filter by life domain and include thought links.',
    inputSchema: {
      format: z
        .enum(['markdown', 'json'])
        .default('markdown')
        .describe('Export format: markdown or json (default markdown)'),
      context: z
        .enum(['personal', 'family', 'health', 'finance', 'social', 'creative', 'travel'])
        .optional()
        .describe('Optional: filter by life domain'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(500)
        .default(100)
        .describe('Max thoughts to export (default 100)'),
      include_links: z
        .boolean()
        .default(false)
        .describe('Include thought links in export (default false)'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args) => {
    return exportThoughts(args);
  });

  server.registerTool('bulk_capture', {
    title: 'Bulk Capture Thoughts',
    description:
      'Capture multiple thoughts in a single batch. Each thought is processed with embedding generation and metadata extraction. Max 20 per batch.',
    inputSchema: {
      thoughts: z
        .array(z.object({
          text: z.string().min(1).max(10000).describe('The thought text'),
          context: z
            .enum(['personal', 'family', 'health', 'finance', 'social', 'creative', 'travel'])
            .optional()
            .describe('Optional life domain'),
        }))
        .min(1)
        .max(20)
        .describe('Array of thoughts to capture (max 20 per batch)'),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  }, async (args) => {
    return bulkCapture(args);
  });

  server.registerTool('reinforce_thought', {
    title: 'Reinforce Thought',
    description:
      'Bump the confidence score of a thought by 1. Use when a thought resurfaces, proves important, or is referenced again. Higher confidence = more important/recurring theme.',
    inputSchema: {
      id: z.string().uuid().describe('The UUID of the thought to reinforce'),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  }, async (args) => {
    return reinforceThoughtTool(args);
  });

  server.registerTool('archive_thought', {
    title: 'Archive Thought',
    description:
      'Archive a thought that is outdated or no longer relevant. Different from delete: the record is preserved but hidden from search results. Can be unarchived later.',
    inputSchema: {
      id: z.string().uuid().describe('The UUID of the thought to archive'),
      reason: z.string().min(1).max(500).describe('Reason for archiving this thought'),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args) => {
    return archiveThoughtTool(args);
  });

  server.registerTool('unarchive_thought', {
    title: 'Unarchive Thought',
    description:
      'Restore an archived thought back to active status. The thought will appear in search results again.',
    inputSchema: {
      id: z.string().uuid().describe('The UUID of the thought to unarchive'),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args) => {
    return unarchiveThoughtTool(args);
  });

  server.registerTool('thought_timeline', {
    title: 'Thought Timeline',
    description:
      'View thoughts chronologically for a given topic or person. Shows the evolution of thinking over time.',
    inputSchema: {
      topic: z
        .string()
        .min(1)
        .max(200)
        .optional()
        .describe('Filter timeline by topic'),
      person: z
        .string()
        .min(1)
        .max(200)
        .optional()
        .describe('Filter timeline by person mentioned'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(50)
        .describe('Max thoughts to return (default 50)'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args) => {
    return thoughtTimeline(args);
  });

  server.registerTool('merge_thoughts', {
    title: 'Merge Thoughts',
    description:
      'Combine 2-5 related thoughts into a single thought. Merges text, re-generates embedding and metadata, transfers links. Optionally archives the source thoughts. Useful for combining voice capture fragments.',
    inputSchema: {
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
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  }, async (args) => {
    return mergeThoughts(args);
  });

  server.registerTool('ask_brain', {
    title: 'Ask Brain',
    description:
      'Ask a question and get an answer based on your thought history. Uses RAG: finds relevant thoughts via hybrid search, then synthesizes an answer with source citations.',
    inputSchema: {
      question: z.string().min(1).max(2000).describe('The question to answer from your thought history'),
      max_sources: z
        .number()
        .int()
        .min(1)
        .max(20)
        .default(10)
        .describe('Max source thoughts to use as context (default 10)'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  }, async (args) => {
    return askBrain(args);
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

  if (process.env.API_TOKEN) {
    await startHttpServer();
  }
}

main().catch((err) => {
  console.error('Fatal error starting server:', err);
  process.exit(1);
});
