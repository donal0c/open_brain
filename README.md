# Open Brain

An MCP server for personal thought capture and semantic retrieval. Captures thoughts, automatically extracts metadata (people, topics, type, action items), generates embeddings, and provides semantic search — all through the MCP protocol.

## Architecture

- **MCP SDK** (`@modelcontextprotocol/sdk`) with stdio transport
- **Supabase PostgreSQL** + pgvector for storage and vector similarity search
- **OpenAI** `text-embedding-3-small` for 1536-dim embeddings
- **Claude Sonnet 4.6** via AWS Bedrock for metadata extraction and context classification

## Tools

| Tool | Description |
|------|-------------|
| `capture_thought` | Capture text with parallel embedding generation + metadata extraction. Auto-classifies as work/personal. |
| `semantic_search` | Meaning-based search using cosine similarity over embeddings. |
| `list_recent` | Recent thoughts ordered by time. |
| `search_by_metadata` | Filter by people, topics, type, dates, context (AND logic). |
| `stats` | Aggregate statistics: totals, breakdowns, top topics/people, activity. |

## Context Classification

Thoughts are partitioned into `work` and `personal` contexts. You can set context explicitly or let the LLM auto-classify. Anything involving technology, software, engineering, or product development defaults to `work` unless explicitly marked personal.

## Setup

### Prerequisites

- Node.js >= 20
- A Supabase project with pgvector enabled
- OpenAI API key
- AWS credentials with Bedrock access

### Install

```bash
pnpm install
pnpm build
```

### Environment Variables

Copy `.env.example` to `.env` and fill in your credentials:

```
SUPABASE_DB_URL    # PostgreSQL connection string (transaction pooler, port 6543)
OPENAI_API_KEY     # For text-embedding-3-small
AWS_REGION         # For Bedrock (e.g., us-east-1)
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
BEDROCK_MODEL_ID   # Optional (default: us.anthropic.claude-sonnet-4-6)
```

### Database Migration

Run once to create the `thoughts` table, indexes, and trigger:

```bash
pnpm setup-db
```

### Register with Claude Code

```bash
claude mcp add -s user \
  -e SUPABASE_DB_URL=your-connection-string \
  -e OPENAI_API_KEY=your-key \
  -e AWS_REGION=us-east-1 \
  -e AWS_ACCESS_KEY_ID=your-key-id \
  -e AWS_SECRET_ACCESS_KEY=your-secret \
  open-brain -- node /path/to/open_brain/dist/index.js
```

## Database Schema

Single `thoughts` table with:
- `raw_text` — the original thought
- `embedding` — 1536-dim vector (HNSW indexed)
- `context` — `work`, `personal`, or `unclassified`
- `people` — text array (GIN indexed)
- `topics` — text array (GIN indexed)
- `thought_type` — decision, insight, meeting_note, idea, task, observation, reference, personal_note
- `action_items` — JSONB array
- `metadata` — JSONB for extensibility
