import { NextResponse } from 'next/server';
import { messageSchema } from '@/lib/validation';
import { findListing } from '@/lib/server/listings';
import { findSavedMessage, saveMessage } from '@/lib/server/messages';
import { emailSeller } from '@/lib/server/email';
import { enforceRateLimit } from '@/lib/server/rate-limit';
import { errorResponse, parseInput, readJson } from '@/lib/server/http';
import { RequestError } from '@/lib/server/errors';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const input = parseInput(messageSchema, await readJson(request, 12_000));
    const listing = await findListing(input.listingId);
    if (!listing) throw new RequestError('This listing is no longer available.', 404);
    const previous = await findSavedMessage(input);
    if (!previous?.email_sent_at) await enforceRateLimit(request, 'message');
    const message = previous ?? (await saveMessage(input, listing.seller_email));
    const delivery = await emailSeller(message, listing.title);
    return NextResponse.json({ saved: true, ...delivery }, { status: previous ? 200 : 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
