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
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

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
    <section className="payment-panel seller-access" aria-labelledby="seller-access-title">
      <h2 id="seller-access-title">Verify your seller email</h2>
      <p>Use the email on your listing. We’ll send a code so only you can manage its payments.</p>
      <form onSubmit={handleSubmission}>
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
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        {codeSent && (
          <div className="field">
            <Label htmlFor="seller-code">Verification code</Label>
            <Input
              id="seller-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6,10}"
              required
              value={code}
              maxLength={10}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
              aria-describedby="seller-code-help"
            />
            <p id="seller-code-help" className="field-help" role="status">
              Code sent. Check your inbox and spam folder.
            </p>
          </div>
        )}
        {error && (
          <p className="payment-error" role="alert">
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
            <Button type="button" variant="link" disabled={pending} onClick={() => void sendCode()}>
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
  );
}
