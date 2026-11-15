import { NextResponse } from 'next/server';
import { feedParametersSchema, listingSchema } from '@/lib/validation';
import { MAX_IMAGE_BYTES } from '@/lib/marketplace';
import { browseListings } from '@/lib/server/listings';
import { serializeListingFeed } from '@/lib/server/listing-feed';
import { findPublishedListing, publishListing } from '@/lib/server/publish-listing';
import { prepareListingImage } from '@/lib/server/images';
import { enforceRateLimit } from '@/lib/server/rate-limit';
import { errorResponse, parseInput, readForm } from '@/lib/server/http';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const form = await readForm(request, MAX_IMAGE_BYTES + 64_000);
    const input = parseInput(listingSchema, Object.fromEntries(form));
    const previous = await findPublishedListing(input);
    if (previous) return NextResponse.json({ id: previous.id });
    const image = await prepareListingImage(form.get('photo'));
    await enforceRateLimit(request, 'listing');
    const result = await publishListing(input, image);
    return NextResponse.json({ id: result.id }, { status: result.created ? 201 : 200 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(request: Request) {
  try {
    const { category, q, page } = parseInput(
      feedParametersSchema,
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const listings = await browseListings(category, q, page);
    return NextResponse.json(serializeListingFeed(listings, page), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
