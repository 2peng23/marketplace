import 'server-only';
import { cookies } from 'next/headers';
import type { Session } from '@supabase/supabase-js';
import { getSupabase } from './supabase';
import { createMailTransport } from './smtp';
import { ConfigurationError, RequestError } from './errors';

const sessionCookie = 'marketplace.seller';

export async function sendSellerCode(email: string) {
  const mailer = createMailTransport();
  if (!mailer) throw new ConfigurationError('Verification email is not configured.');
  const { data, error } = await getSupabase().auth.admin.generateLink({ type: 'magiclink', email });
  if (error || !data.properties?.email_otp)
    throw new RequestError('A verification code could not be created. Please try again.', 503);
  try {
    const delivery = await mailer.transport.sendMail({
      from: { name: 'Marketplace', address: mailer.from },
      to: email,
      subject: 'Your Marketplace verification code',
      text: `Your verification code is ${data.properties.email_otp}.\n\nEnter it on Marketplace to manage seller payments. If you did not request this code, you can ignore this email.`,
    });
    if (delivery.accepted.length !== 1 || delivery.rejected.length)
      throw new Error('Recipient rejected');
  } catch {
    throw new RequestError(
      'The code could not be sent. Check your email address and try again.',
      503,
    );
  } finally {
    mailer.transport.close();
  }
}

export async function verifySellerCode(email: string, code: string) {
  const { data, error } = await getSupabase().auth.verifyOtp({ email, token: code, type: 'email' });
  if (error || !data.session || !data.user?.email_confirmed_at)
    throw new RequestError('That code is invalid or has expired. Request a new code.', 401);
  await saveSellerSession(data.session);
  return upsertSeller(data.user.id, email);
}

async function saveSellerSession(session: Session) {
  const cookieStore = await cookies();
  cookieStore.set(sessionCookie, session.access_token, {
    httpOnly: true,
    secure:
      process.env.NODE_ENV === 'production' &&
      !process.env.NEXT_PUBLIC_SITE_URL?.startsWith('http://127.0.0.1:'),
    sameSite: 'lax',
    path: '/',
    maxAge: Math.min(session.expires_in, 3600),
  });
}

async function upsertSeller(identifier: string, email: string) {
  const { data, error } = await getSupabase()
    .from('sellers')
    .upsert({ id: identifier, email }, { onConflict: 'id' })
    .select('*')
    .single();
  if (error) throw new RequestError('Seller access could not be loaded. Please try again.', 503);
  return data;
}

export async function currentSeller() {
  const accessToken = (await cookies()).get(sessionCookie)?.value;
  if (!accessToken) return null;
  const { data, error } = await getSupabase().auth.getUser(accessToken);
  if (error || !data.user?.email_confirmed_at || !data.user.email) return null;
  return upsertSeller(data.user.id, data.user.email.trim().toLowerCase());
}

export async function requireSeller() {
  const seller = await currentSeller();
  if (!seller) throw new RequestError('Verify your seller email to continue.', 401);
  return seller;
}

export async function signOutSeller() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(sessionCookie)?.value;
  if (accessToken) await getSupabase().auth.admin.signOut(accessToken, 'local');
  cookieStore.delete(sessionCookie);
}

export async function claimSellerListing(listingId: string) {
  const seller = await requireSeller();
  const { error } = await getSupabase().rpc('claim_listing', {
    listing_identifier: listingId,
    seller_identifier: seller.id,
  });
  if (error)
    throw new RequestError('This listing is not available for your verified seller email.', 403);
}
