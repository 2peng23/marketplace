import { NextResponse } from 'next/server';
import { handleStripeEvent, verifyStripeEvent } from '@/lib/server/stripe-events';
import { paymentErrorResponse } from '@/lib/server/stripe';
import { readRawBody } from '@/lib/server/http';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const event = verifyStripeEvent(
      await readRawBody(request, 1_000_000),
      request.headers.get('stripe-signature'),
    );
    await handleStripeEvent(event);
    return NextResponse.json({ received: true });
  } catch (error) {
    return paymentErrorResponse(error);
  }
}
