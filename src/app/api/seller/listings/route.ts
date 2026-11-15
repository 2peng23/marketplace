import { NextResponse } from 'next/server';
import { sellerClaimSchema } from '@/lib/payments';
import { claimSellerListing } from '@/lib/server/seller-session';
import { errorResponse, parseInput, readJson } from '@/lib/server/http';
import { assertBrowserOrigin } from '@/lib/server/stripe';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    assertBrowserOrigin(request);
    const { listingId } = parseInput(sellerClaimSchema, await readJson(request, 2000));
    await claimSellerListing(listingId);
    return NextResponse.json({ saved: true });
  } catch (error) {
    return errorResponse(error);
  }
}
