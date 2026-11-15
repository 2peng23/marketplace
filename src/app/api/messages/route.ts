import { NextResponse } from 'next/server';
import { messageSchema, validationFields } from '@/lib/validation';
import { getSupabase } from '@/lib/server/supabase';
import { emailSeller, type SavedMessage } from '@/lib/server/email';
import { checkRequest, enforceRateLimit, errorResponse, RequestError } from '@/lib/server/requests';

export const runtime = 'nodejs';
const messageColumns =
  'id,listing_id,buyer_email,seller_email,message,email_sent_at,email_send_started_at';

export async function POST(request: Request) {
  try {
    checkRequest(request, 12_000);
    const body: unknown = await request.json().catch(() => null);
    const parsed = messageSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json(
        { error: 'Check the highlighted fields.', fields: validationFields(parsed.error) },
        { status: 400 },
      );
    const input = parsed.data;
    const supabase = getSupabase();
    const { data: listing, error } = await supabase
      .from('listings')
      .select('id,title,seller_email')
      .eq('id', input.listingId)
      .maybeSingle();
    if (error) throw new RequestError('Please try again in a moment.', 503);
    if (!listing) throw new RequestError('This listing is no longer available.', 404);
    const previous = await supabase
      .from('messages')
      .select(messageColumns)
      .eq('id', input.requestId)
      .maybeSingle();
    if (previous.error) throw new RequestError('Please try again in a moment.', 503);
    let savedMessage = previous.data as SavedMessage | null;
    if (
      savedMessage &&
      (savedMessage.listing_id !== listing.id ||
        savedMessage.buyer_email !== input.buyerEmail ||
        savedMessage.message !== input.message)
    )
      throw new RequestError('This request was already used for a different message.', 409);
    if (!savedMessage?.email_sent_at) await enforceRateLimit(request, 'message');
    if (!savedMessage) {
      const inserted = await supabase
        .from('messages')
        .insert({
          id: input.requestId,
          listing_id: listing.id,
          buyer_email: input.buyerEmail,
          seller_email: listing.seller_email,
          message: input.message,
        })
        .select(messageColumns)
        .maybeSingle();
      if (inserted.error && inserted.error.code !== '23505')
        throw new RequestError('Your message could not be saved. Please try again.', 503);
      if (inserted.data) savedMessage = inserted.data as SavedMessage;
      else {
        const concurrent = await supabase
          .from('messages')
          .select(messageColumns)
          .eq('id', input.requestId)
          .single();
        savedMessage = concurrent.data as SavedMessage | null;
        if (
          !savedMessage ||
          savedMessage.listing_id !== listing.id ||
          savedMessage.buyer_email !== input.buyerEmail ||
          savedMessage.message !== input.message
        )
          throw new RequestError('This request was already used for a different message.', 409);
      }
    }
    const delivery = await emailSeller(savedMessage, listing.title);
    return NextResponse.json({ saved: true, ...delivery }, { status: previous.data ? 200 : 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
