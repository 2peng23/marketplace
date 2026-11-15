'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ApiError, requestJson } from '@/lib/api';
import { checkoutCreatedSchema } from '@/lib/payments';
import { Button } from '@/components/ui/button';

export function BuyNow({
  listingId,
  status,
  eligible,
  resumeOrderId,
}: {
  listingId: string;
  status: 'available' | 'reserved' | 'sold';
  eligible: boolean;
  resumeOrderId: string | null;
}) {
  const [pending, setPending] = useState(false);
  const [requestId, setRequestId] = useState('');
  const [error, setError] = useState('');
  async function purchaseItem() {
    setPending(true);
    setError('');
    const identifier = requestId || crypto.randomUUID();
    setRequestId(identifier);
    try {
      const result = await requestJson('/api/checkout', checkoutCreatedSchema, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId, requestId: identifier }),
      });
      window.location.assign(result.url);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Checkout could not be opened.');
      if (failure instanceof ApiError && failure.status === 409) setRequestId('');
      setPending(false);
    }
  }
  return (
    <section className="listing-purchase" aria-label="Purchase item">
      {status === 'sold' ? (
        <p className="listing-purchase-state">Sold</p>
      ) : status === 'reserved' ? (
        resumeOrderId ? (
          <Button asChild className="buy-now-button">
            <Link href={`/checkout/${resumeOrderId}`}>Resume checkout</Link>
          </Button>
        ) : (
          <p className="listing-purchase-state">Checkout in progress</p>
        )
      ) : eligible ? (
        <>
          <Button className="buy-now-button" onClick={() => void purchaseItem()} disabled={pending}>
            {pending ? 'Opening checkout…' : 'Buy Now'}
          </Button>
          <p className="field-help">Opens Stripe Checkout · Sandbox</p>
        </>
      ) : (
        <p className="field-help">Contact the seller to arrange this purchase.</p>
      )}
      {error && (
        <p className="payment-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
