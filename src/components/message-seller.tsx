'use client';
import { useRef, useState, type FormEvent } from 'react';
import { messageSchema, validationFields } from '@/lib/validation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';

export function MessageSeller({ listingId, title }: { listingId: string; title: string }) {
  const requestIdentifier = useRef({ id: '', contents: '' });
  const [emailError, setEmailError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const form = new FormData(event.currentTarget);
    const contents = JSON.stringify([form.get('buyerEmail'), form.get('message')]);
    if (!requestIdentifier.current.id || requestIdentifier.current.contents !== contents) {
      requestIdentifier.current = { id: crypto.randomUUID(), contents };
    }
    const input = {
      requestId: requestIdentifier.current.id,
      listingId,
      buyerEmail: form.get('buyerEmail'),
      message: form.get('message'),
    };
    const result = messageSchema.safeParse(input);
    setError('');
    if (!result.success) {
      setFields(validationFields(result.error));
      return;
    }
    setFields({});
    setSubmitting(true);
    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result.data),
      });
      const payload = await response.json();
      if (!response.ok) {
        setFields(payload.fields ?? {});
        throw new Error(payload.error ?? 'Please try again.');
      }
      if (payload.emailSent) {
        setSaved(true);
        setEmailError('');
      } else
        setEmailError(
          payload.emailError ||
            'Your message is saved, but email could not be sent. Please try again.',
        );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <section className="message-seller" aria-label={`Message seller about ${title}`}>
      <h2>Message seller</h2>
      {saved ? (
        <Alert className="message-success" role="status">
          <AlertTitle>Message sent.</AlertTitle>
          <AlertDescription>
            Your inquiry was emailed to the seller. Replies go to your email address.
          </AlertDescription>
        </Alert>
      ) : (
        <form onSubmit={submitMessage} noValidate aria-busy={submitting}>
          <div className="field">
            <Label htmlFor="buyerEmail">Your email</Label>
            <Input
              id="buyerEmail"
              name="buyerEmail"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              maxLength={254}
              required
              disabled={submitting}
              aria-invalid={!!fields.buyerEmail}
              aria-describedby={fields.buyerEmail ? 'buyerEmail-error' : undefined}
            />
            {fields.buyerEmail && (
              <span className="field-error" id="buyerEmail-error">
                {fields.buyerEmail}
              </span>
            )}
          </div>
          <div className="field">
            <Label htmlFor="message">Your message</Label>
            <Textarea
              id="message"
              name="message"
              rows={3}
              maxLength={2000}
              required
              defaultValue="Hi, is this still available?"
              disabled={submitting}
              aria-invalid={!!fields.message}
              aria-describedby={fields.message ? 'message-error' : undefined}
            />
            {fields.message && (
              <span className="field-error" id="message-error">
                {fields.message}
              </span>
            )}
          </div>
          {emailError && (
            <Alert className="email-retry-notice">
              <AlertDescription>{emailError}</AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button className="message-submit" disabled={submitting}>
            {submitting ? 'Sending…' : emailError ? 'Retry email' : 'Send message'}
          </Button>
        </form>
      )}
    </section>
  );
}
