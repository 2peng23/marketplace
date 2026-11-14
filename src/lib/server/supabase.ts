import 'server-only';
import { createClient } from '@supabase/supabase-js';

export class ConfigurationError extends Error {}
export function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new ConfigurationError('The marketplace database is not configured.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export function imageUrl(path: string) {
  const url = process.env.SUPABASE_URL;
  if (!url) throw new ConfigurationError('The marketplace database is not configured.');
  return `${url}/storage/v1/object/public/listing-images/${path}`;
}
