import { NextResponse } from 'next/server';
import { checkoutSchema } from '@/lib/payments';
import { startCheckout } from '@/lib/server/checkout';
import { enforceRateLimit } from '@/lib/server/rate-limit';
import { parseInput, readJson } from '@/lib/server/http';
import { assertBrowserOrigin, paymentErrorResponse } from '@/lib/server/stripe';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    assertBrowserOrigin(request);
    const { listingId, requestId } = parseInput(checkoutSchema, await readJson(request, 2000));
    await enforceRateLimit(request, 'checkout');
    return NextResponse.json(await startCheckout(listingId, requestId));
  } catch (error) {
    return paymentErrorResponse(error);
  }
}
