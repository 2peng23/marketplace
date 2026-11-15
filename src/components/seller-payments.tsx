'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { requestJson } from '@/lib/api';
import {
  actionDoneSchema,
  sellerSummarySchema,
  stripeLinkSchema,
  type SellerSummary,
} from '@/lib/payments';
import { formatPrice } from '@/lib/marketplace';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

type SellerListing = {
  id: string;
  title: string;
  price: number;
  imageUrl: string;
  owned: boolean;
  saleStatus: 'available' | 'reserved' | 'sold';
};
export function SellerPayments({
  seller,
  listings,
  countryOptions,
  initialError,
  expiredLink,
  checkoutAvailable,
}: {
  seller: SellerSummary;
  listings: SellerListing[];
  countryOptions: { defaultCountry: string; countries: { code: string; label: string }[] };
  initialError?: string;
  expiredLink: boolean;
  checkoutAvailable: boolean;
}) {
  const router = useRouter();
  const [country, setCountry] = useState(seller.country || countryOptions.defaultCountry);
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const visibleError = error || initialError;
  const ready = seller.paymentStatus === 'active';

  async function runAction(action: string, operation: () => Promise<void>) {
    setPending(action);
    setError('');
    try {
      await operation();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'This step could not be completed.');
    } finally {
      setPending('');
    }
  }
  async function stripeAction(action: 'onboard' | 'dashboard') {
    const result = await requestJson('/api/seller/stripe', stripeLinkSchema, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(action === 'onboard' ? { action, country } : { action }),
    });
    window.location.assign(result.url);
  }
  return (
    <div className="seller-payments-layout">
      <section className="payment-panel" aria-labelledby="stripe-setup-title">
        <p className="payment-eyebrow">Payment account</p>
        <div className="seller-panel-heading">
          <h2 id="stripe-setup-title">
            {ready
              ? checkoutAvailable
                ? 'Payments ready'
                : 'Stripe connected'
              : seller.connected
                ? 'Finish seller setup'
                : 'Connect with Stripe'}
          </h2>
        </div>
        <p className="seller-email">{seller.email}</p>
        <p>
          {ready
            ? checkoutAvailable
              ? 'Listings with this email can accept card payments.'
              : 'Your Stripe account is ready. Marketplace is finishing payment setup.'
            : 'Complete Stripe’s hosted setup to accept payments for your listings.'}
        </p>
        <dl className="seller-policy-details">
          <div>
            <dt>Marketplace fee</dt>
            <dd>10% per sale</dd>
          </div>
          <div>
            <dt>Stripe processing</dt>
            <dd>Charged separately</dd>
          </div>
        </dl>
        <p className="field-help">Test payments only. No real money moves.</p>
        {expiredLink && (
          <p role="status" className="payment-notice">
            Your setup link expired. Continue below to open a new one.
          </p>
        )}
        {!seller.connected && (
          <div className="field seller-country-field">
            <Label htmlFor="seller-country">Seller country</Label>
            <select
              id="seller-country"
              value={country}
              onChange={(event) => setCountry(event.target.value)}
              disabled={Boolean(pending)}
            >
              <option value="" disabled>
                Choose a country
              </option>
              {countryOptions.countries.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="field-help">
              Choose the country you’ll use for Stripe’s test onboarding.
            </p>
          </div>
        )}
        <div className="payment-actions">
          <Button
            disabled={Boolean(pending) || (!seller.connected && !country)}
            onClick={() =>
              void runAction(ready ? 'dashboard' : 'onboard', () =>
                stripeAction(ready ? 'dashboard' : 'onboard'),
              )
            }
          >
            {pending === 'onboard' || pending === 'dashboard'
              ? 'Opening Stripe…'
              : ready
                ? 'Open Stripe dashboard'
                : seller.connected
                  ? 'Continue setup'
                  : 'Connect with Stripe'}
          </Button>
          {(seller.connected || Boolean(initialError)) && (
            <>
              {ready && !initialError ? (
                <Button
                  variant="outline"
                  disabled={Boolean(pending)}
                  onClick={() => void runAction('onboard', () => stripeAction('onboard'))}
                >
                  Update details
                </Button>
              ) : (
                <Button
                  variant="outline"
                  disabled={Boolean(pending)}
                  onClick={() =>
                    void runAction('refresh', async () => {
                      await requestJson('/api/seller/stripe', sellerSummarySchema, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'refresh' }),
                      });
                      router.refresh();
                    })
                  }
                >
                  {pending === 'refresh' ? 'Checking…' : 'Check status'}
                </Button>
              )}
            </>
          )}
        </div>
        {visibleError && (
          <p className="payment-error" role="alert">
            {visibleError}
          </p>
        )}
        <Button
          variant="link"
          className="seller-change-email"
          disabled={Boolean(pending)}
          onClick={() =>
            void runAction('change-email', async () => {
              await requestJson('/api/seller', actionDoneSchema, { method: 'DELETE' });
              router.refresh();
            })
          }
        >
          Change email
        </Button>
      </section>
      <section className="payment-panel" aria-labelledby="seller-items-title">
        <div className="seller-panel-heading">
          <h2 id="seller-items-title">Your listings</h2>
          <Button asChild variant="outline" size="sm">
            <Link href="/create">Create listing</Link>
          </Button>
        </div>
        <p>Matching listings connect automatically. New listings use this email too.</p>
        {listings.length ? (
          <ul className="seller-listings">
            {listings.map((listing) => (
              <li key={listing.id}>
                <div className="seller-listing-summary">
                  <Link
                    href={`/listings/${listing.id}`}
                    className="seller-listing-photo"
                    tabIndex={-1}
                    aria-hidden="true"
                  >
                    <Image src={listing.imageUrl} alt="" fill sizes="64px" />
                  </Link>
                  <div className="seller-listing-description">
                    <Link href={`/listings/${listing.id}`}>{listing.title}</Link>
                    <span>{formatPrice(listing.price)}</span>
                  </div>
                </div>
                {listing.saleStatus === 'sold' ? (
                  <span className="seller-listing-state is-sold">Sold</span>
                ) : listing.saleStatus === 'reserved' ? (
                  <span className="seller-listing-state">In checkout</span>
                ) : (
                  <span className="seller-listing-state">
                    {ready && listing.owned && checkoutAvailable
                      ? 'Payments ready'
                      : 'Awaiting setup'}
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="seller-empty">Create a listing with this email to sell your first item.</p>
        )}
      </section>
    </div>
  );
}
