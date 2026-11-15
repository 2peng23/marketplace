import { NextResponse } from 'next/server';
import { browserListingsSchema, feedParametersSchema } from '@/lib/validation';
import { findBrowserListings } from '@/lib/server/listings';
import { serializeListingFeed } from '@/lib/server/listing-feed';
import { errorResponse, parseInput, readJson } from '@/lib/server/http';

export async function POST(request: Request) {
  try {
    const input = parseInput(browserListingsSchema, await readJson(request, 50_000));
    const { page, category, q } = parseInput(
      feedParametersSchema,
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const listings = await findBrowserListings([...new Set(input.identifiers)], category, q, page);
    return NextResponse.json(serializeListingFeed(listings, page), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
