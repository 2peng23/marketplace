import 'server-only';
import nodemailer from 'nodemailer';
import { z } from 'zod';
import { getSupabase } from './supabase';

export type SavedMessage = {
  id: string;
  listing_id: string;
  buyer_email: string;
  seller_email: string;
  message: string;
  email_sent_at: string | null;
  email_send_started_at: string | null;
};
export type EmailDelivery = { emailSent: boolean; emailError?: string };

export async function emailSeller(message: SavedMessage, title: string): Promise<EmailDelivery> {
  if (message.email_sent_at) return { emailSent: true };
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || '587');
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;
  const from = process.env.SMTP_FROM;
  if (
    !host ||
    !user ||
    !password ||
    !from ||
    !z.email().safeParse(from).success ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    return {
      emailSent: false,
      emailError:
        'Your message is saved. Email setup is incomplete; please try again after it is connected.',
    };
  }
  const supabase = getSupabase();
  const claimStarted = new Date().toISOString();
  const staleBefore = new Date(Date.now() - 120_000).toISOString();
  const claim = await supabase
    .from('messages')
    .update({ email_send_started_at: claimStarted })
    .eq('id', message.id)
    .is('email_sent_at', null)
    .or(`email_send_started_at.is.null,email_send_started_at.lt.${staleBefore}`)
    .select('id')
    .maybeSingle();
  if (claim.error)
    return {
      emailSent: false,
      emailError: 'Your message is saved. Email could not be started; please try again.',
    };
  if (!claim.data) {
    const current = await supabase
      .from('messages')
      .select('email_sent_at')
      .eq('id', message.id)
      .maybeSingle();
    return current.data?.email_sent_at
      ? { emailSent: true }
      : {
          emailSent: false,
          emailError: 'Your message is saved and is being sent. Check again in a moment.',
        };
  }

  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const localTest =
    (process.env.NODE_ENV !== 'production' || process.env.MARKETPLACE_SMTP_TEST === 'true') &&
    process.env.SMTP_ALLOW_INSECURE_LOCAL === 'true' &&
    ['127.0.0.1', 'localhost', '::1'].includes(host);
  if (process.env.MARKETPLACE_SMTP_TEST === 'true' && !message.seller_email.endsWith('.test')) {
    await supabase
      .from('messages')
      .update({ email_send_started_at: null })
      .eq('id', message.id)
      .eq('email_send_started_at', claimStarted);
    return {
      emailSent: false,
      emailError: 'Only test recipients are accepted in the mail test environment.',
    };
  }
  const transport = nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: !secure && !localTest,
    auth: { user, pass: host === 'smtp.gmail.com' ? password.replace(/\s/g, '') : password },
    connectionTimeout: 12_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  let accepted = false;
  try {
    const site =
      process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : 'http://localhost:3000');
    const listingUrl = new URL(`/listings/${message.listing_id}`, site).href;
    const result = await transport.sendMail({
      from: { name: 'Marketplace', address: from },
      to: message.seller_email,
      replyTo: message.buyer_email,
      subject: `Message about ${title.replace(/[\r\n]+/g, ' ')}`,
      messageId: `<marketplace-${message.id}@${from.split('@')[1]}>`,
      text: `New inquiry about ${title}\n\n${message.message}\n\nReply to: ${message.buyer_email}\nListing: ${listingUrl}`,
    });
    accepted = result.accepted.length > 0 && result.rejected.length === 0;
    if (!accepted) throw new Error('SMTP recipient rejected');
  } catch (failure) {
    // Keep credentials, message contents, and provider responses out of logs.
    console.error(
      'Marketplace email sending failed:',
      failure && typeof failure === 'object' && 'code' in failure
        ? String(failure.code)
        : 'SMTP_ERROR',
    );
  } finally {
    transport.close();
  }

  if (!accepted) {
    await supabase
      .from('messages')
      .update({ email_send_started_at: null })
      .eq('id', message.id)
      .eq('email_send_started_at', claimStarted);
    return {
      emailSent: false,
      emailError: 'Your message is saved, but email could not be sent. Please try again.',
    };
  }
  const receipt = await supabase
    .from('messages')
    .update({ email_sent_at: new Date().toISOString(), email_send_started_at: null })
    .eq('id', message.id)
    .eq('email_send_started_at', claimStarted);
  if (receipt.error)
    console.error('Marketplace email accepted; delivery receipt could not be saved.');
  return { emailSent: true };
}
