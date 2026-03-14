#!/usr/bin/env node

/**
 * Standalone HTTP server for Open Brain.
 * Runs the Hono API without the MCP stdio transport.
 * Used by OpenClaw skills and other HTTP clients.
 *
 * Usage: node dist/http-standalone.js
 * Requires: SUPABASE_DB_URL, OPENAI_API_KEY, AWS_REGION, API_TOKEN
 */

import { startHttpServer } from './http-server.js';

const missing: string[] = [];
if (!process.env.SUPABASE_DB_URL) missing.push('SUPABASE_DB_URL');
if (!process.env.OPENAI_API_KEY) missing.push('OPENAI_API_KEY');
if (!process.env.AWS_REGION) missing.push('AWS_REGION');
if (!process.env.API_TOKEN) missing.push('API_TOKEN');

if (missing.length > 0) {
  console.error(`FATAL: Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

console.error('Starting Open Brain HTTP server (standalone mode)...');
startHttpServer();
