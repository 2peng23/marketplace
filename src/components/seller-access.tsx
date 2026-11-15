'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { requestJson } from '@/lib/api';
import { actionDoneSchema } from '@/lib/payments';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function SellerAccess() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const verificationCodeReference = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (codeSent) verificationCodeReference.current?.focus();
  }, [codeSent]);

  async function sendCode() {
    setPending(true);
    setError('');
    try {
      await requestJson('/api/seller/code', actionDoneSchema, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      setCodeSent(true);
      setCode('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The code could not be sent.');
    } finally {
      setPending(false);
    }
  }

  async function handleSubmission(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!codeSent) return sendCode();
    setPending(true);
    setError('');
    try {
      await requestJson('/api/seller/session', actionDoneSchema, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), code }),
      });
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The code could not be verified.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="seller-access-layout">
      <section className="payment-panel seller-access" aria-labelledby="seller-access-title">
        <h2 id="seller-access-title">
          {codeSent ? 'Check your email' : 'Verify your seller email'}
        </h2>
        <p>
          {codeSent
            ? 'Enter the code we sent to your listing email.'
            : 'Use the email on your listing. We’ll send a one-time code.'}
        </p>
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
              disabled={pending || codeSent}
              placeholder="you@example.com"
              aria-invalid={!codeSent && Boolean(error)}
              aria-describedby={!codeSent && error ? 'seller-access-error' : undefined}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          {codeSent && (
            <div className="field">
              <Label htmlFor="seller-code">Verification code</Label>
              <Input
                id="seller-code"
                ref={verificationCodeReference}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6,10}"
                required
                value={code}
                maxLength={10}
                disabled={pending}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                aria-invalid={Boolean(error)}
                aria-describedby={
                  error ? 'seller-code-help seller-access-error' : 'seller-code-help'
                }
              />
              <p id="seller-code-help" className="field-help" role="status">
                Code sent. Check your inbox and spam folder.
              </p>
            </div>
          )}
          {error && (
            <p id="seller-access-error" className="payment-error" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" disabled={pending}>
            {pending
              ? codeSent
                ? 'Verifying…'
                : 'Sending code…'
              : codeSent
                ? 'Verify email'
                : 'Send verification code'}
          </Button>
          {codeSent && (
            <div className="payment-inline-actions">
              <Button
                type="button"
                variant="link"
                disabled={pending}
                onClick={() => void sendCode()}
              >
                Send a new code
              </Button>
              <Button
                type="button"
                variant="link"
                disabled={pending}
                onClick={() => {
                  setCodeSent(false);
                  setError('');
                }}
              >
                Change email
              </Button>
            </div>
          )}
        </form>
      </section>
      <aside className="seller-access-guide" aria-labelledby="seller-guide-title">
        <h2 id="seller-guide-title">Ready to sell online</h2>
        <p>
          After verifying your email, complete Stripe’s hosted setup and link the items you want to
          sell.
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
        <p className="field-help">This is a test environment. No real money moves.</p>
      </aside>
    </div>
  );
}
