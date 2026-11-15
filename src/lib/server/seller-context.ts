import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { getSupabase } from './supabase';
import { ConfigurationError, RequestError } from './errors';

const cookieName = 'marketplace.seller';
const lifetimeSeconds = 3600;

function signature(payload: string) {
  const secret = process.env.RATE_LIMIT_SALT;
  if (!secret) throw new ConfigurationError('Seller setup is not configured.');
  return createHmac('sha256', secret).update(`seller-context:v1:${payload}`).digest('base64url');
}

export function encodeSellerContext(sellerId: string, now = Date.now()) {
  const payload = Buffer.from(
    JSON.stringify({ sellerId, expiresAt: now + lifetimeSeconds * 1000 }),
  ).toString('base64url');
  return `${payload}.${signature(payload)}`;
}

export function decodeSellerContext(value: string, now = Date.now()): string | null {
  if (value.length > 1024) return null;
  const [payload, provided, extra] = value.split('.');
  if (!payload || !provided || !/^[A-Za-z0-9_-]{43}$/.test(provided) || extra !== undefined)
    return null;
  const expected = signature(payload);
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
  )
    return null;
  try {
    const context = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof context.sellerId === 'string' &&
      /^[0-9a-f-]{36}$/.test(context.sellerId) &&
      Number.isSafeInteger(context.expiresAt) &&
      context.expiresAt > now
      ? context.sellerId
      : null;
  } catch {
    return null;
  }
}

// The hiring brief identifies sellers by email, without login or email verification.
// This signed cookie remembers that selection; it is not proof of email ownership.
export async function selectSellerEmail(email: string) {
  const { data, error } = await getSupabase().rpc('connect_seller_email', { seller_email: email });
  if (error || !data)
    throw new RequestError('Seller setup could not be saved. Please try again.', 503);
  (await cookies()).set(cookieName, encodeSellerContext(data.id), {
    httpOnly: true,
    secure:
      process.env.NODE_ENV === 'production' &&
      !process.env.NEXT_PUBLIC_SITE_URL?.startsWith('http://127.0.0.1:'),
    sameSite: 'lax',
    path: '/',
    maxAge: lifetimeSeconds,
  });
  return data;
}

export async function currentSeller() {
  const value = (await cookies()).get(cookieName)?.value;
  const identifier = value ? decodeSellerContext(value) : null;
  if (!identifier) return null;
  const { data, error } = await getSupabase()
    .from('sellers')
    .select('*')
    .eq('id', identifier)
    .maybeSingle();
  if (error) throw new RequestError('Seller setup could not be loaded. Please try again.', 503);
  return data;
}

export async function requireSeller() {
  const seller = await currentSeller();
  if (!seller) throw new RequestError('Enter your listing email to continue.', 401);
  return seller;
}

export async function clearSellerContext() {
  (await cookies()).delete(cookieName);
}
