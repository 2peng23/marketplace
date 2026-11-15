import Link from 'next/link';
import { notFound } from 'next/navigation';
import { identifierSchema } from '@/lib/validation';
import { findBuyerOrder, publicOrder, buyerCheckoutIsOpen } from '@/lib/server/checkout';
import { RequestError } from '@/lib/server/errors';
import { OrderStatus } from '@/components/order-status';
import type { OrderRow } from '@/lib/server/database.types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Your order', robots: { index: false, follow: false } };
export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const identifier = (await params).id;
  if (!identifierSchema.safeParse(identifier).success) notFound();
  let order: OrderRow | null = null;
  try {
    order = await findBuyerOrder(identifier);
  } catch (error) {
    if (!(error instanceof RequestError) || error.status !== 404) throw error;
  }
  if (!order)
    return (
      <main id="main-content" className="page-container checkout-page">
        <section className="payment-panel">
          <h1>Order unavailable</h1>
          <p>Open your order in the browser you used for checkout.</p>
          <Link href="/">Back to Marketplace</Link>
        </section>
      </main>
    );
  const paused = (await searchParams).cancelled === '1' || (await buyerCheckoutIsOpen(order));
  return (
    <main id="main-content" className="page-container checkout-page">
      <OrderStatus initialOrder={publicOrder(order)} initiallyPaused={paused} />
    </main>
  );
}
