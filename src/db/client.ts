import postgres from 'postgres';

const connectionString = process.env.SUPABASE_DB_URL;

if (!connectionString) {
  console.error('FATAL: SUPABASE_DB_URL environment variable is required');
  process.exit(1);
}

export const sql = postgres(connectionString, {
  prepare: false,
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});
