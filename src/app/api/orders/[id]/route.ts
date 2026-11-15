import { NextResponse } from 'next/server';
import { z } from 'zod';
import { identifierSchema } from '@/lib/validation';
import {
  findBuyerOrder,
  publicOrder,
  cancelBuyerOrder,
  resumeBuyerOrder,
  reconcileListingReservation,
} from '@/lib/server/checkout';
import { parseInput, readJson } from '@/lib/server/http';
import { assertBrowserOrigin, paymentErrorResponse } from '@/lib/server/stripe';

export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    const identifier = parseInput(identifierSchema, (await context.params).id);
    let order = await findBuyerOrder(identifier);
    if (
      ['creating', 'pending'].includes(order.status) &&
      Date.now() > new Date(order.expires_at).valueOf()
    ) {
      await reconcileListingReservation(order.listing_id);
      order = await findBuyerOrder(identifier);
    }
    return NextResponse.json(publicOrder(order), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return paymentErrorResponse(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    assertBrowserOrigin(request);
    const identifier = parseInput(identifierSchema, (await context.params).id);
    const { action } = parseInput(
      z.object({ action: z.enum(['cancel', 'resume']) }).strict(),
      await readJson(request, 1000),
    );
    return NextResponse.json(
      action === 'cancel' ? await cancelBuyerOrder(identifier) : await resumeBuyerOrder(identifier),
    );
  } catch (error) {
    return paymentErrorResponse(error);
  }
}
