import 'server-only';
import { getSupabase } from './supabase';
import type { MessageRow } from './database.types';
import { createMailTransport, sellerEmailContent } from './smtp';

type EmailDelivery = { emailSent: boolean; emailError?: string };

export async function emailSeller(message: MessageRow, title: string): Promise<EmailDelivery> {
  if (message.email_sent_at) return { emailSent: true };
  const mailer = createMailTransport();
  if (!mailer)
    return {
      emailSent: false,
      emailError:
        'Your message is saved. Email setup is incomplete; please try again after it is connected.',
    };
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
    if (current.error)
      return {
        emailSent: false,
        emailError: 'Your message is saved. Email status could not be checked; please try again.',
      };
    return current.data?.email_sent_at
      ? { emailSent: true }
      : {
          emailSent: false,
          emailError: 'Your message is saved and is being sent. Check again in a moment.',
        };
  }

  let accepted = false;
  try {
    const result = await mailer.transport.sendMail(sellerEmailContent(message, title, mailer.from));
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
    mailer.transport.close();
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
