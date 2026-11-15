'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { requestJson } from '@/lib/api';
import { actionDoneSchema } from '@/lib/payments';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function SellerAccess() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmission(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      await requestJson('/api/seller', actionDoneSchema, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Seller setup could not be opened.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="seller-access-layout">
      <section className="payment-panel seller-access" aria-labelledby="seller-access-title">
        <h2 id="seller-access-title">Connect your seller email</h2>
        <p>Use the email on your listings. No account or login needed.</p>
        <form onSubmit={handleSubmission} aria-busy={pending}>
          <div className="field">
            <Label htmlFor="seller-email">Seller email</Label>
            <Input
              id="seller-email"
              type="email"
              autoComplete="email"
              maxLength={254}
              required
              value={email}
              disabled={pending}
              placeholder="you@example.com"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'seller-access-error' : undefined}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          {error && (
            <p id="seller-access-error" className="payment-error" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" disabled={pending}>
            {pending ? 'Opening setup…' : 'Continue'}
          </Button>
        </form>
      </section>
      <aside className="seller-access-guide" aria-labelledby="seller-guide-title">
        <h2 id="seller-guide-title">Ready to sell online</h2>
        <p>
          Complete Stripe’s hosted setup. Every listing with your email gets Buy Now automatically
          when payments are ready.
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
      </aside>
    </div>
  );
}
