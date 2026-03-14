# Mobile Voice Capture Setup

Two options for capturing thoughts from your phone:

## Option A: HTTP Shortcuts (Quick MVP)

1. Install **HTTP Shortcuts** from Play Store (free, open source)
2. Open `clients/http-shortcuts/capture-thought.json` and replace:
   - `YOUR_TAILSCALE_HOSTNAME` with your Tailscale machine name
   - `YOUR_API_TOKEN` with your API token
3. Import the JSON file into HTTP Shortcuts
4. Add the shortcuts as home screen widgets
5. Tap widget → type or dictate (tap mic icon on keyboard) → send

### Voice dictation tips
- Tap the mic icon on your Android keyboard (Google voice typing)
- Say "period", "comma", "new line" for punctuation
- Speak naturally — the AI extraction handles informal language well

## Option B: PWA (Rich Experience)

1. Make sure your server is running with `API_TOKEN` set
2. Open Chrome on your phone: `https://YOUR_TAILSCALE_HOSTNAME:3001/pwa/?token=YOUR_API_TOKEN`
3. Chrome will prompt "Add to Home Screen" — tap it
4. Open the installed app
5. Tap the mic button → speak → tap Send

### PWA features
- Live transcription as you speak
- Domain selector (personal, family, health, finance, social, creative, travel)
- Offline queue: thoughts are saved locally if the server is unreachable
- Background sync: queued thoughts auto-send when connection is restored
- Idempotency keys prevent duplicate captures on retry

## Server Requirements

Set these environment variables:
```
API_TOKEN=your-secret-token    # Required for HTTP API
HTTP_PORT=3001                 # Optional, default 3001
```

The HTTP server starts automatically when `API_TOKEN` is set.

## Running the Migrations

Before first use, run these migrations against your Supabase database:

```bash
# Hybrid search support
psql $SUPABASE_DB_URL -f scripts/migrate-001-hybrid-search.sql

# Life domains (replaces work/personal)
psql $SUPABASE_DB_URL -f scripts/migrate-002-life-domains.sql

# Confidence and archival
psql $SUPABASE_DB_URL -f scripts/migrate-003-confidence-archival.sql

# Idempotency keys for offline support
psql $SUPABASE_DB_URL -f scripts/migrate-004-idempotency.sql
```
