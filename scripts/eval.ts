import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type ExtractionFixture = {
  name: string;
  text: string;
  expected_context: string;
  expected_type: string;
  expected_topics: string[];
};

type RetrievalFixture = {
  name: string;
  query: string;
  expected_context?: string;
  expected_topic?: string;
};

type DedupFixture = {
  name: string;
  text: string;
  expect_duplicate: boolean;
};

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf8')) as T;
}

function overlapRatio(expected: string[], actual: string[]): number {
  if (expected.length === 0) return 1;
  const actualSet = new Set(actual.map((value) => value.toLowerCase()));
  const hits = expected.filter((value) => actualSet.has(value.toLowerCase())).length;
  return hits / expected.length;
}

async function runExtractionEval(): Promise<void> {
  if (!process.env.AWS_REGION) {
    console.log('Skipping extraction eval: AWS credentials/region are not configured.');
    return;
  }

  const fixtures = loadJson<ExtractionFixture[]>('eval/extraction-fixtures.json');
  const { extractMetadata } = await import('../src/services/extraction.ts');

  let passed = 0;
  for (const fixture of fixtures) {
    const result = await extractMetadata(fixture.text);
    const contextOk = result.context === fixture.expected_context;
    const typeOk = result.thought_type === fixture.expected_type;
    const topicScore = overlapRatio(fixture.expected_topics, result.topics);
    const success = contextOk && typeOk && topicScore >= 0.5;

    if (success) passed++;

    console.log(`${success ? 'PASS' : 'FAIL'} extraction: ${fixture.name}`);
    console.log(`  expected context/type: ${fixture.expected_context}/${fixture.expected_type}`);
    console.log(`  actual   context/type: ${result.context}/${result.thought_type}`);
    console.log(`  expected topics: ${fixture.expected_topics.join(', ')}`);
    console.log(`  actual topics: ${result.topics.join(', ') || '(none)'}`);
  }

  console.log(`Extraction score: ${passed}/${fixtures.length}`);
}

async function runRetrievalEval(): Promise<void> {
  if (!process.env.SUPABASE_DB_URL || !process.env.OPENAI_API_KEY) {
    console.log('Skipping retrieval eval: SUPABASE_DB_URL and OPENAI_API_KEY are required.');
    return;
  }

  const fixtures = loadJson<RetrievalFixture[]>('eval/retrieval-fixtures.json');
  const { generateEmbedding } = await import('../src/services/embeddings.ts');
  const { hybridSearch } = await import('../src/db/queries.ts');

  let passed = 0;
  for (const fixture of fixtures) {
    const embedding = await generateEmbedding(fixture.query);
    const results = await hybridSearch(fixture.query, embedding, { limit: 5 });
    const hit = results.find((result) => {
      const contextOk = fixture.expected_context ? result.context === fixture.expected_context : true;
      const topicOk = fixture.expected_topic ? result.topics.includes(fixture.expected_topic) : true;
      return contextOk && topicOk;
    });

    if (hit) passed++;

    console.log(`${hit ? 'PASS' : 'FAIL'} retrieval: ${fixture.name}`);
    console.log(`  query: ${fixture.query}`);
    console.log(`  matched: ${hit ? `${hit.id} (${hit.context})` : 'none'}`);
  }

  console.log(`Retrieval score: ${passed}/${fixtures.length}`);
}

async function runDedupEval(): Promise<void> {
  if (!process.env.SUPABASE_DB_URL || !process.env.OPENAI_API_KEY) {
    console.log('Skipping dedup eval: SUPABASE_DB_URL and OPENAI_API_KEY are required.');
    return;
  }

  const fixtures = loadJson<DedupFixture[]>('eval/dedup-fixtures.json');
  const { generateEmbedding } = await import('../src/services/embeddings.ts');
  const { findDuplicates } = await import('../src/db/queries.ts');

  let passed = 0;
  for (const fixture of fixtures) {
    const embedding = await generateEmbedding(fixture.text);
    const duplicates = await findDuplicates(fixture.text, embedding);
    const isDuplicate = duplicates.length > 0;
    const success = isDuplicate === fixture.expect_duplicate;

    if (success) passed++;

    console.log(`${success ? 'PASS' : 'FAIL'} dedup: ${fixture.name}`);
    console.log(`  expected duplicate: ${fixture.expect_duplicate}`);
    console.log(`  actual duplicate:   ${isDuplicate}`);
  }

  console.log(`Dedup score: ${passed}/${fixtures.length}`);
}

async function main(): Promise<void> {
  const mode = process.argv[2] ?? 'all';

  if (mode === 'all' || mode === 'extract') {
    await runExtractionEval();
  }
  if (mode === 'all' || mode === 'retrieve') {
    await runRetrievalEval();
  }
  if (mode === 'all' || mode === 'dedup') {
    await runDedupEval();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
