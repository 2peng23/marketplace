'use client';
import { useRef, useState, type FormEvent } from 'react';
import { messageSchema, validationFields } from '@/lib/validation';

export function MessageSeller({ listingId, title }: { listingId: string; title: string }) {
  const dialogReference = useRef<HTMLDialogElement>(null);
  const requestIdentifier = useRef('');
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const form = new FormData(event.currentTarget);
    if (!requestIdentifier.current) requestIdentifier.current = crypto.randomUUID();
    const input = {
      requestId: requestIdentifier.current,
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
      setSaved(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <>
      <button
        className="button button-primary message-trigger"
        onClick={() => dialogReference.current?.showModal()}
      >
        Message seller <span aria-hidden="true">↗</span>
      </button>
      <dialog
        ref={dialogReference}
        className="message-dialog"
        aria-labelledby="message-title"
        onClick={(event) => {
          if (event.target === event.currentTarget && !submitting) dialogReference.current?.close();
        }}
        onCancel={(event) => {
          if (submitting) event.preventDefault();
        }}
      >
        <button
          className="dialog-close"
          type="button"
          aria-label="Close message"
          onClick={() => dialogReference.current?.close()}
          disabled={submitting}
        >
          ×
        </button>
        {saved ? (
          <div className="message-success" role="status">
            <span className="success-mark" aria-hidden="true">
              ✓
            </span>
            <p className="eyebrow">A CONVERSATION STARTS HERE</p>
            <h2 id="message-title">Your message is saved.</h2>
            <p>
              We’ve saved your inquiry about <strong>{title}</strong> and your contact email.
            </p>
            <p className="field-help">
              Email notifications are not enabled. You can also contact the seller using the email
              on the listing.
            </p>
            <button
              className="button button-primary"
              onClick={() => dialogReference.current?.close()}
            >
              Back to the listing
            </button>
          </div>
        ) : (
          <>
            <p className="eyebrow">ABOUT THIS FIND</p>
            <h2 id="message-title">Say hello to the seller.</h2>
            <p className="dialog-item-title">{title}</p>
            <form onSubmit={submitMessage} noValidate aria-busy={submitting}>
              <div className="field">
                <label htmlFor="buyerEmail">Your email</label>
                <input
                  id="buyerEmail"
                  name="buyerEmail"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  maxLength={254}
                  required
                  aria-invalid={!!fields.buyerEmail}
                  aria-describedby={fields.buyerEmail ? 'buyerEmail-error' : 'buyer-help'}
                />
                {fields.buyerEmail && (
                  <span className="field-error" id="buyerEmail-error">
                    {fields.buyerEmail}
                  </span>
                )}
                <span className="field-help" id="buyer-help">
                  Included with your message so the seller can reply.
                </span>
              </div>
              <div className="field">
                <label htmlFor="message">Your message</label>
                <textarea
                  id="message"
                  name="message"
                  placeholder="Hi! Is this still available?"
                  rows={5}
                  maxLength={2000}
                  required
                  aria-invalid={!!fields.message}
                  aria-describedby={fields.message ? 'message-error' : undefined}
                />
                {fields.message && (
                  <span className="field-error" id="message-error">
                    {fields.message}
                  </span>
                )}
              </div>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <button className="button button-primary message-submit" disabled={submitting}>
                {submitting ? 'Saving your message…' : 'Send message'}
              </button>
              <p className="dialog-note">Your message is saved privately. No account needed.</p>
            </form>
          </>
        )}
      </dialog>
    </>
  );
}
