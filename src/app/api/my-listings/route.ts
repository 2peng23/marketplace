import { NextResponse } from 'next/server';
import { z } from 'zod';
import { identifierSchema, feedParametersSchema } from '@/lib/validation';
import { findBrowserListings } from '@/lib/server/listings';
import { serializeListingFeed } from '@/lib/server/listing-feed';
import { checkRequest, errorResponse, RequestError } from '@/lib/server/requests';

const inputSchema = z.object({ identifiers: z.array(identifierSchema).max(1000) }).strict();

export async function POST(request: Request) {
  try {
    checkRequest(request, 50_000);
    const input = inputSchema.safeParse(await request.json().catch(() => null));
    const parameters = feedParametersSchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!input.success || !parameters.success)
      throw new RequestError('These listings could not be loaded.');
    const { page, category, q } = parameters.data;
    const listings = await findBrowserListings(
      [...new Set(input.data.identifiers)],
      category,
      q,
      page,
    );
    return NextResponse.json(serializeListingFeed(listings, page), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
