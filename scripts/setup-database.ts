import nextEnvironment from '@next/env';
import { readFile } from 'node:fs/promises';
nextEnvironment.loadEnvConfig(process.cwd());
const token = process.env.SUPABASE_ACCESS_TOKEN;
const project = process.env.SUPABASE_PROJECT_REF;
if (!token || !project)
  throw new Error(
    'To run migrations automatically, set SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF locally. Alternatively, run supabase/migrations/001_marketplace.sql in your Supabase SQL Editor.',
  );
const query = await readFile('supabase/migrations/001_marketplace.sql', 'utf8');
const response = await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query }),
});
if (!response.ok)
  throw new Error(
    `Database setup failed (${response.status}). Check the project and access token.`,
  );
console.log('Marketplace migration applied.');
