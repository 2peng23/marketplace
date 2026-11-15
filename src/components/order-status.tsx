'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { requestJson } from '@/lib/api';
import { publicOrderSchema, stripeLinkSchema, type PublicOrder } from '@/lib/payments';
import { formatPrice } from '@/lib/marketplace';
import { Button } from '@/components/ui/button';

export function OrderStatus({
  initialOrder,
  initiallyPaused,
  listingImageUrl,
}: {
  initialOrder: PublicOrder;
  initiallyPaused: boolean;
  listingImageUrl: string | null;
}) {
  const [order, setOrder] = useState(initialOrder);
  const [error, setError] = useState('');
  const [pending, setPending] = useState('');
  const [waiting, setWaiting] = useState(false);
  const [paused, setPaused] = useState(initiallyPaused);
  const unfinished = ['creating', 'pending'].includes(order.status);

  useEffect(() => {
    if (!unfinished || paused) return;
    const controller = new AbortController();
    let attempts = 0;
    const interval = window.setInterval(async () => {
      try {
        const updated = await requestJson(`/api/orders/${order.id}`, publicOrderSchema, {
          signal: controller.signal,
          cache: 'no-store',
        });
        setOrder((previous) => (previous.status === 'paid' ? previous : updated));
        setError('');
      } catch (failure) {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error ? failure.message : 'The order could not be refreshed.',
          );
      }
      if (++attempts >= 20) {
        window.clearInterval(interval);
        setWaiting(true);
      }
    }, 3000);
    return () => {
      window.clearInterval(interval);
      controller.abort();
    };
  }, [order.id, unfinished, paused]);

  async function performAction(action: 'cancel' | 'resume') {
    setPending(action);
    setError('');
    try {
      const options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      };
      if (action === 'cancel') {
        setOrder(await requestJson(`/api/orders/${order.id}`, publicOrderSchema, options));
        setPaused(false);
      } else
        window.location.assign(
          (await requestJson(`/api/orders/${order.id}`, stripeLinkSchema, options)).url,
        );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'This step could not be completed.');
    } finally {
      setPending('');
    }
  }
  const title =
    order.status === 'paid'
      ? 'Purchase confirmed'
      : !unfinished
        ? order.status === 'cancelled'
          ? 'Checkout cancelled'
          : 'Checkout ended'
        : paused
          ? 'Checkout paused'
          : 'Confirming your payment';
  return (
    <section
      className="payment-panel order-confirmation"
      aria-labelledby="order-title"
      data-status={order.status}
    >
      <span className="sandbox-label">Sandbox</span>
      <h1 id="order-title" aria-live="polite">
        {title}
      </h1>
      <p>
        {order.status === 'paid'
          ? 'Your payment is confirmed and this item is now marked Sold.'
          : !unfinished
            ? 'No purchase was confirmed for this checkout. You can return to the listing.'
            : paused
              ? 'Resume your checkout or cancel it to release the item.'
              : 'We’re waiting for Stripe’s payment confirmation. Your order will update here.'}
      </p>
      <div className="order-item">
        {listingImageUrl && (
          <div className="order-item-photo">
            <Image src={listingImageUrl} alt={order.title} fill sizes="96px" />
          </div>
        )}
        <div className="order-item-description">
          <p className="payment-eyebrow">Your item</p>
          <h2>{order.title}</h2>
        </div>
      </div>
      <dl className="order-details">
        <div className="order-total">
          <dt>Total</dt>
          <dd>{formatPrice(order.amountCents / 100)} USD</dd>
        </div>
        <div>
          <dt>Order</dt>
          <dd className="order-reference">{order.id}</dd>
        </div>
      </dl>
      {waiting && unfinished && (
        <p className="payment-notice" role="status">
          Confirmation is taking longer than usual. Refresh this page shortly to check again.
        </p>
      )}
      {error && (
        <p className="payment-error" role="alert">
          {error}
        </p>
      )}
      <div className="payment-actions">
        {unfinished && paused && (
          <>
            <Button disabled={Boolean(pending)} onClick={() => void performAction('resume')}>
              {pending === 'resume' ? 'Opening checkout…' : 'Resume checkout'}
            </Button>
            <Button
              variant="outline"
              disabled={Boolean(pending)}
              onClick={() => void performAction('cancel')}
            >
              {pending === 'cancel' ? 'Cancelling…' : 'Cancel checkout'}
            </Button>
          </>
        )}
        <Button variant={order.status === 'paid' ? 'default' : 'outline'} asChild>
          <Link href={order.status === 'paid' ? '/' : `/listings/${order.listingId}`}>
            {order.status === 'paid' ? 'Back to Marketplace' : 'Back to listing'}
          </Link>
        </Button>
      </div>
    </section>
  );
}
