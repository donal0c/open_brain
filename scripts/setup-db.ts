import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from '../src/db/client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(__dirname, '..', 'src', 'db', 'schema.sql');

async function main() {
  console.error('Reading schema from', schemaPath);
  const schema = readFileSync(schemaPath, 'utf-8');

  console.error('Running schema migration...');
  await sql.unsafe(schema);

  const [{ count }] = await sql<[{ count: string }]>`
    SELECT COUNT(*)::text AS count FROM thoughts
  `;
  console.error(`Migration complete. thoughts table has ${count} rows.`);

  await sql.end();
  console.error('Connection closed.');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
