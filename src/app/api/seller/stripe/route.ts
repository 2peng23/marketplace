import { NextResponse } from 'next/server';
import { sellerConnectSchema } from '@/lib/payments';
import { requireSeller } from '@/lib/server/seller-session';
import {
  refreshSellerPayments,
  sellerSummary,
  startSellerOnboarding,
  sellerDashboard,
} from '@/lib/server/seller-payments';
import { enforceRateLimit } from '@/lib/server/rate-limit';
import { parseInput, readJson } from '@/lib/server/http';
import { assertBrowserOrigin, paymentErrorResponse } from '@/lib/server/stripe';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    assertBrowserOrigin(request);
    const input = parseInput(sellerConnectSchema, await readJson(request, 2000));
    const seller = await requireSeller();
    await enforceRateLimit(request, 'connect');
    if (input.action === 'refresh')
      return NextResponse.json(sellerSummary(await refreshSellerPayments(seller)));
    const url =
      input.action === 'dashboard'
        ? await sellerDashboard(seller)
        : await startSellerOnboarding(seller, input.country);
    return NextResponse.json({ url });
  } catch (error) {
    return paymentErrorResponse(error);
  }
}
