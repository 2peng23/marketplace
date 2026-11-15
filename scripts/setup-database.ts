import nextEnvironment from '@next/env';
import { readFile, readdir } from 'node:fs/promises';
nextEnvironment.loadEnvConfig(process.cwd());
const token = process.env.SUPABASE_ACCESS_TOKEN;
const project = process.env.SUPABASE_PROJECT_REF;
if (!token || !project)
  throw new Error(
    'Set SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF locally, or run the SQL migrations in your Supabase SQL Editor.',
  );
const requested = process.argv.slice(2);
const migrations = requested.length
  ? requested
  : (await readdir('supabase/migrations')).filter((name) => name.endsWith('.sql')).sort();
for (const migration of migrations) {
  if (!/^\d+_[a-z_]+\.sql$/.test(migration))
    throw new Error('Use a migration filename from supabase/migrations.');
  const query = await readFile(`supabase/migrations/${migration}`, 'utf8');
  const response = await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!response.ok)
    throw new Error(
      `Database setup failed (${response.status}). Check the project and access token.`,
    );
  console.log(`Applied ${migration}.`);
}
