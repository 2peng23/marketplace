import { NextResponse } from 'next/server';
import { sellerCodeSchema } from '@/lib/payments';
import { verifySellerCode, signOutSeller } from '@/lib/server/seller-session';
import { enforceRateLimit } from '@/lib/server/rate-limit';
import { errorResponse, parseInput, readJson } from '@/lib/server/http';
import { assertBrowserOrigin } from '@/lib/server/stripe';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    assertBrowserOrigin(request);
    const { email, code } = parseInput(sellerCodeSchema, await readJson(request, 2000));
    await enforceRateLimit(request, 'seller-verify');
    await verifySellerCode(email, code);
    return NextResponse.json({ saved: true });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function DELETE(request: Request) {
  try {
    assertBrowserOrigin(request);
    await signOutSeller();
    return NextResponse.json({ saved: true });
  } catch (error) {
    return errorResponse(error);
  }
}
