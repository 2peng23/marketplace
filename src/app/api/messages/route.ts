import { NextResponse } from 'next/server';
import { messageSchema, validationFields } from '@/lib/validation';
import { getSupabase } from '@/lib/server/supabase';
import { checkRequest, enforceRateLimit, errorResponse, RequestError } from '@/lib/server/requests';

export async function POST(request: Request) {
  try {
    checkRequest(request, 12_000);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new RequestError('This message could not be read.');
    }
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
      .select('id,seller_email')
      .eq('id', input.listingId)
      .maybeSingle();
    if (error) throw new RequestError('Please try again in a moment.', 503);
    if (!listing) throw new RequestError('This listing is no longer available.', 404);
    const previous = await supabase
      .from('messages')
      .select('id')
      .eq('id', input.requestId)
      .maybeSingle();
    if (previous.error) throw new RequestError('Please try again in a moment.', 503);
    if (previous.data) return NextResponse.json({ saved: true });
    await enforceRateLimit(request, 'message');
    const result = await supabase
      .from('messages')
      .insert({
        id: input.requestId,
        listing_id: listing.id,
        buyer_email: input.buyerEmail,
        seller_email: listing.seller_email,
        message: input.message,
      });
    if (result.error && result.error.code !== '23505')
      throw new RequestError('Your message could not be saved. Please try again.', 503);
    return NextResponse.json({ saved: true }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
