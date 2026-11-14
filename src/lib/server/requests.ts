import 'server-only';
import { createHmac } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSupabase, ConfigurationError } from './supabase';

export class RequestError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function checkRequest(request: Request, maximumBytes: number) {
  const origin = request.headers.get('origin');
  if (origin) {
    let originUrl: URL;
    try {
      originUrl = new URL(origin);
    } catch {
      throw new RequestError('This request could not be accepted.', 403);
    }
    const host = request.headers.get('host') ?? new URL(request.url).host;
    if (!['http:', 'https:'].includes(originUrl.protocol) || originUrl.host !== host)
      throw new RequestError('This request could not be accepted.', 403);
  }
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > maximumBytes) throw new RequestError('This upload is too large.', 413);
}
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
export function errorResponse(error: unknown) {
  if (error instanceof RequestError)
    return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof ConfigurationError)
    return NextResponse.json(
      { error: 'The marketplace is being connected. Please try again shortly.' },
      { status: 503 },
    );
  console.error(
    'Marketplace request failed:',
    error instanceof Error ? error.message : 'Unknown error',
  );
  return NextResponse.json(
    { error: 'Something went wrong. Your information is still here—please try again.' },
    { status: 500 },
  );
}
