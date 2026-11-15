import 'server-only';
import { createHmac } from 'node:crypto';
import { getSupabase } from './supabase';
import { ConfigurationError, RequestError } from './errors';

const hourlyLimits = {
  listing: 20,
  message: 40,
  'seller-code': 8,
  'seller-verify': 30,
  checkout: 40,
  connect: 30,
} as const;

export async function enforceRateLimit(request: Request, action: keyof typeof hourlyLimits) {
  const salt = process.env.RATE_LIMIT_SALT;
  if (!salt) throw new ConfigurationError('Write protection is not configured.');
  const address =
    request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'local';
  const bucket = createHmac('sha256', salt).update(`${action}:${address}`).digest('hex');
  const { data, error } = await getSupabase().rpc('consume_rate_limit', {
    bucket_key: bucket,
    maximum_hits: hourlyLimits[action],
  });
  if (error) throw new RequestError('Please try again in a moment.', 503);
  if (!data)
    throw new RequestError('You have reached the hourly limit. Please try again later.', 429);
}
