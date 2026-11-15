import 'server-only';
import type { MessageInput } from '@/lib/validation';
import type { MessageRow } from './database.types';
import { getSupabase } from './supabase';
import { RequestError } from './errors';

const messageColumns =
  'id,listing_id,buyer_email,seller_email,message,created_at,email_sent_at,email_send_started_at';

function assertSameMessage(message: MessageRow, input: MessageInput) {
  if (
    message.listing_id !== input.listingId ||
    message.buyer_email !== input.buyerEmail ||
    message.message !== input.message
  )
    throw new RequestError('This request was already used for a different message.', 409);
}

export async function findSavedMessage(input: MessageInput) {
  const { data, error } = await getSupabase()
    .from('messages')
    .select(messageColumns)
    .eq('id', input.requestId)
    .maybeSingle();
  if (error) throw new RequestError('Please try again in a moment.', 503);
  if (data) assertSameMessage(data, input);
  return data;
}

export async function saveMessage(input: MessageInput, sellerEmail: string) {
  const result = await getSupabase()
    .from('messages')
    .insert({
      id: input.requestId,
      listing_id: input.listingId,
      buyer_email: input.buyerEmail,
      seller_email: sellerEmail,
      message: input.message,
    })
    .select(messageColumns)
    .single();
  if (result.error?.code === '23505') {
    const concurrentMessage = await findSavedMessage(input);
    if (concurrentMessage) return concurrentMessage;
  }
  if (result.error || !result.data)
    throw new RequestError('Your message could not be saved. Please try again.', 503);
  return result.data;
}
