# Evaluation Harness

Open Brain's value depends more on extraction and retrieval quality than on adding more endpoints. These fixtures give you a repeatable way to evaluate that quality over time.

## Run

```bash
pnpm eval
pnpm eval extract
pnpm eval retrieve
pnpm eval dedup
```

## Requirements

- `extract`: requires Bedrock credentials and `AWS_REGION`
- `retrieve`: requires `SUPABASE_DB_URL` and `OPENAI_API_KEY`
- `dedup`: requires `SUPABASE_DB_URL` and `OPENAI_API_KEY`

## Notes

- The retrieval and dedup fixtures assume your database contains representative thoughts.
- Keep the fixtures small and opinionated. They are meant to catch regressions, not replace product judgment.
