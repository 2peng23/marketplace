import { NextResponse } from 'next/server';
import { sellerEmailSchema } from '@/lib/payments';
import { selectSellerEmail, clearSellerContext } from '@/lib/server/seller-context';
import { enforceRateLimit } from '@/lib/server/rate-limit';
import { parseInput, readJson } from '@/lib/server/http';
import { assertBrowserOrigin, paymentErrorResponse } from '@/lib/server/stripe';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    assertBrowserOrigin(request);
    const { email } = parseInput(sellerEmailSchema, await readJson(request, 2000));
    await enforceRateLimit(request, 'seller');
    await selectSellerEmail(email);
    return NextResponse.json({ saved: true });
  } catch (error) {
    return paymentErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertBrowserOrigin(request);
    await clearSellerContext();
    return NextResponse.json({ saved: true });
  } catch (error) {
    return paymentErrorResponse(error);
  }
}
