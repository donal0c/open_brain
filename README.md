# Open Brain

Open Brain is a thought-analysis backend for fast personal capture flows. Its best fit is low-friction ingestion from tools like OpenClaw over WhatsApp or mobile HTTP clients, then deeper semantic retrieval and structured analysis after capture.

## What It Does

- Captures short thoughts, notes, and voice transcripts
- Extracts structured metadata: people, topics, thought type, action items, life domain
- Stores hybrid-searchable memory in PostgreSQL with pgvector
- Answers questions over your history with retrieval + synthesis
- Supports both MCP and an authenticated HTTP API

## Product Shape

There are two interfaces:

- `MCP`: full power-user/admin surface for rich memory management
- `HTTP`: OpenClaw/mobile-friendly surface for capture, search, ask, and lightweight maintenance

The HTTP API exists because OpenClaw primarily integrates through skills/plugins and external tools, not through direct MCP use in the main agent runtime.

## Architecture

- `@modelcontextprotocol/sdk` for the MCP server
- `Hono` for the HTTP API
- `PostgreSQL` + `pgvector` for storage and semantic retrieval
- `OpenAI text-embedding-3-small` for embeddings
- `Claude Sonnet 4.6` on Bedrock for metadata extraction and synthesis

## Core Concepts

### Life Domains

Thoughts are classified into:

- `personal`
- `family`
- `health`
- `finance`
- `social`
- `creative`
- `travel`
- `unclassified`

### Thought Types

Thoughts are tagged as one of:

- `decision`
- `insight`
- `meeting_note`
- `idea`
- `task`
- `observation`
- `reference`
- `personal_note`

## Most Valuable Flows

For OpenClaw and mobile capture, the highest-value endpoints are:

- `POST /api/capture`
- `GET /api/search`
- `GET /api/recent`
- `POST /api/ask`

The MCP server also exposes richer management tools such as linking, merging, exporting, timelines, and archival.

## Setup

### Prerequisites

- Node.js >= 20
- PostgreSQL or Supabase with `pgvector`
- OpenAI API key
- AWS credentials with Bedrock access

### Install

```bash
pnpm install
pnpm build
```

### Environment Variables

```bash
SUPABASE_DB_URL=...
OPENAI_API_KEY=...
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
BEDROCK_MODEL_ID=us.anthropic.claude-sonnet-4-6
API_TOKEN=...           # Required for standalone HTTP use
HTTP_PORT=3001          # Optional
OPEN_BRAIN_ENABLE_ADMIN_HTTP=false
```

### Database Setup

```bash
pnpm setup-db
psql $SUPABASE_DB_URL -f scripts/migrate-001-hybrid-search.sql
psql $SUPABASE_DB_URL -f scripts/migrate-002-life-domains.sql
psql $SUPABASE_DB_URL -f scripts/migrate-003-confidence-archival.sql
psql $SUPABASE_DB_URL -f scripts/migrate-004-idempotency.sql
```

## Running

### MCP server

```bash
pnpm dev
```

### Standalone HTTP server

```bash
pnpm serve
```

By default, the HTTP server exposes the OpenClaw/mobile core only:

- `POST /api/capture`
- `GET /api/search`
- `GET /api/recent`
- `POST /api/ask`

Set `OPEN_BRAIN_ENABLE_ADMIN_HTTP=true` to expose the maintenance-heavy routes such as update, archive, timeline, summarize, and metadata search.

## Quality Gates

```bash
pnpm typecheck
pnpm test
pnpm eval
```

## OpenClaw Fit

OpenClaw is an always-on assistant that lives inside messaging channels like WhatsApp. Open Brain is meant to be the memory and analysis layer behind that channel experience:

- OpenClaw handles message ingress, routing, and conversational UX
- Open Brain handles extraction, tagging, dedup, search, and recall

That means the quality bar here is less about adding more endpoints and more about getting capture classification, canonical tags, and retrieval quality right.
