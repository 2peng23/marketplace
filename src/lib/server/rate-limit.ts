import 'server-only';
import { createHmac } from 'node:crypto';
import { getSupabase } from './supabase';
import { ConfigurationError, RequestError } from './errors';

export async function enforceRateLimit(request: Request, action: 'listing' | 'message') {
  const salt = process.env.RATE_LIMIT_SALT;
  if (!salt) throw new ConfigurationError('Write protection is not configured.');
  const address =
    request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'local';
  const bucket = createHmac('sha256', salt).update(`${action}:${address}`).digest('hex');
  const { data, error } = await getSupabase().rpc('consume_rate_limit', {
    bucket_key: bucket,
    maximum_hits: action === 'listing' ? 20 : 40,
  });
  if (error) throw new RequestError('Please try again in a moment.', 503);
  if (!data)
    throw new RequestError('You have reached the hourly limit. Please try again later.', 429);
}
