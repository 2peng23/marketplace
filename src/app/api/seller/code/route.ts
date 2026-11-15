import { NextResponse } from 'next/server';
import { sellerEmailSchema } from '@/lib/payments';
import { sendSellerCode } from '@/lib/server/seller-session';
import { enforceRateLimit } from '@/lib/server/rate-limit';
import { errorResponse, parseInput, readJson } from '@/lib/server/http';
import { assertBrowserOrigin } from '@/lib/server/stripe';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    assertBrowserOrigin(request);
    const { email } = parseInput(sellerEmailSchema, await readJson(request, 2000));
    await enforceRateLimit(request, 'seller-code');
    await sendSellerCode(email);
    return NextResponse.json({ saved: true });
  } catch (error) {
    return errorResponse(error);
  }
}
