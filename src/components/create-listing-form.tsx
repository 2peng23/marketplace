'use client';
import Image from 'next/image';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { categories, categoryName, formatPrice, MAX_IMAGE_BYTES } from '@/lib/marketplace';
import { listingSchema, validationFields } from '@/lib/validation';

type FieldErrors = Record<string, string>;
export function CreateListingForm() {
  const router = useRouter();
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [values, setValues] = useState({ title: '', description: '', price: '', category: '' });
  const [fields, setFields] = useState<FieldErrors>({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const requestIdentifier = useRef('');
  const previewReference = useRef('');
  const fileReference = useRef<HTMLInputElement>(null);
  useEffect(
    () => () => {
      if (previewReference.current) URL.revokeObjectURL(previewReference.current);
    },
    [],
  );
  function choosePhoto(file: File | null) {
    if (previewReference.current) URL.revokeObjectURL(previewReference.current);
    previewReference.current = '';
    setPreview('');
    setPhoto(null);
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setFields((previous) => ({ ...previous, photo: 'Choose a JPEG, PNG, or WebP image.' }));
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setFields((previous) => ({ ...previous, photo: 'Choose an image smaller than 4 MB.' }));
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    previewReference.current = objectUrl;
    setPreview(objectUrl);
    setPhoto(file);
    setFields((previous) => {
      const next = { ...previous };
      delete next.photo;
      return next;
    });
  }
  async function submitListing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError('');
    const form = new FormData(event.currentTarget);
    if (!requestIdentifier.current) requestIdentifier.current = crypto.randomUUID();
    form.set('requestId', requestIdentifier.current);
    const result = listingSchema.safeParse(Object.fromEntries(form));
    const nextFields: FieldErrors = result.success ? {} : validationFields(result.error);
    if (!photo) nextFields.photo = 'Choose a product photo.';
    setFields(nextFields);
    if (Object.keys(nextFields).length) {
      document.getElementById(Object.keys(nextFields)[0])?.focus();
      return;
    }
    form.set('photo', photo!);
    setSubmitting(true);
    try {
      const response = await fetch('/api/listings', { method: 'POST', body: form });
      const payload = await response.json();
      if (!response.ok) {
        setFields(payload.fields ?? {});
        throw new Error(payload.error ?? 'Your listing could not be saved. Please try again.');
      }
      router.push(`/listings/${payload.id}?created=1`);
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Please try again.');
      setSubmitting(false);
    }
  }
  const fieldError = (name: string) =>
    fields[name] ? (
      <span id={`${name}-error`} className="field-error">
        {fields[name]}
      </span>
    ) : null;
  return (
    <form className="create-layout" onSubmit={submitListing} noValidate aria-busy={submitting}>
      <div className="create-fields">
        <section className="form-section">
          <div className="section-heading">
            <span className="step-number">01</span>
            <h2>Start with a photo</h2>
          </div>
          <div
            className={`photo-upload ${preview ? 'has-photo' : ''} ${fields.photo ? 'invalid' : ''}`}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              choosePhoto(event.dataTransfer.files[0] ?? null);
            }}
          >
            {preview ? (
              <>
                <Image
                  src={preview}
                  alt="Your selected product photo"
                  fill
                  unoptimized
                  sizes="600px"
                />
                <button
                  className="remove-photo"
                  type="button"
                  aria-label="Remove photo"
                  onClick={() => {
                    choosePhoto(null);
                    if (fileReference.current) fileReference.current.value = '';
                  }}
                >
                  ×
                </button>
                <span className="photo-replace-label">Click to replace photo</span>
              </>
            ) : (
              <div className="upload-copy">
                <span className="upload-symbol" aria-hidden="true">
                  <svg width="30" height="30" viewBox="0 0 32 32" fill="none">
                    <path
                      d="M16 21V7m0 0-5 5m5-5 5 5M8 21v5h16v-5"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <strong>Add a product photo</strong>
                <span>Drop it here, or click to browse</span>
                <small>JPEG, PNG or WebP · Up to 4 MB</small>
              </div>
            )}
            <label className="visually-hidden" htmlFor="photo">
              Product photo
            </label>
            <input
              className="upload-input"
              ref={fileReference}
              id="photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-invalid={!!fields.photo}
              aria-describedby={fields.photo ? 'photo-error' : undefined}
              onChange={(event) => choosePhoto(event.target.files?.[0] ?? null)}
            />
          </div>
          {fieldError('photo')}
        </section>
        <section className="form-section">
          <div className="section-heading">
            <span className="step-number">02</span>
            <h2>Tell us about it</h2>
          </div>
          <div className="field">
            <label htmlFor="title">Title</label>
            <input
              id="title"
              name="title"
              placeholder="e.g. Oak dining chair"
              maxLength={120}
              required
              aria-invalid={!!fields.title}
              aria-describedby={fields.title ? 'title-error' : undefined}
              onChange={(event) =>
                setValues((previous) => ({ ...previous, title: event.target.value }))
              }
            />
            {fieldError('title')}
          </div>
          <div className="form-row">
            <div className="field">
              <label htmlFor="price">
                Price <span className="label-note">USD</span>
              </label>
              <div className="price-input">
                <span aria-hidden="true">$</span>
                <input
                  id="price"
                  name="price"
                  inputMode="decimal"
                  placeholder="0.00"
                  maxLength={11}
                  required
                  aria-invalid={!!fields.price}
                  aria-describedby={fields.price ? 'price-error' : undefined}
                  onChange={(event) =>
                    setValues((previous) => ({ ...previous, price: event.target.value }))
                  }
                />
              </div>
              {fieldError('price')}
            </div>
            <div className="field">
              <label htmlFor="category">Category</label>
              <select
                id="category"
                name="category"
                defaultValue=""
                required
                aria-invalid={!!fields.category}
                aria-describedby={fields.category ? 'category-error' : undefined}
                onChange={(event) =>
                  setValues((previous) => ({ ...previous, category: event.target.value }))
                }
              >
                <option value="" disabled>
                  Select a category
                </option>
                {categories.map((category) => (
                  <option value={category.slug} key={category.slug}>
                    {category.label}
                  </option>
                ))}
              </select>
              {fieldError('category')}
            </div>
          </div>
          <div className="field">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              name="description"
              rows={5}
              maxLength={3000}
              placeholder="A few details about the item, its condition, and what makes it worth a second look."
              required
              aria-invalid={!!fields.description}
              aria-describedby={fields.description ? 'description-error' : undefined}
              onChange={(event) =>
                setValues((previous) => ({ ...previous, description: event.target.value }))
              }
            />
            {fieldError('description')}
          </div>
        </section>
        <section className="form-section contact-section">
          <div className="section-heading">
            <span className="step-number">03</span>
            <h2>Where can buyers reach you?</h2>
          </div>
          <div className="field">
            <label htmlFor="sellerEmail">Your email</label>
            <input
              id="sellerEmail"
              name="sellerEmail"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              maxLength={254}
              required
              aria-invalid={!!fields.sellerEmail}
              aria-describedby={`email-help${fields.sellerEmail ? ' sellerEmail-error' : ''}`}
            />
            <span className="field-help" id="email-help">
              This email will be visible on your listing.
            </span>
            {fieldError('sellerEmail')}
          </div>
        </section>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <p>No account needed. Just a good find.</p>
          <button className="button button-primary" type="submit" disabled={submitting}>
            {submitting ? 'Publishing your listing…' : 'Publish listing'}
          </button>
        </div>
      </div>
      <aside className="listing-preview" aria-label="Your listing preview">
        <div className="preview-label">
          <span>YOUR LISTING</span>
          <span>Live preview</span>
        </div>
        <div className="preview-image">
          {preview ? (
            <Image src={preview} alt="Preview of your listing" fill unoptimized sizes="400px" />
          ) : (
            <span>Your photo goes here</span>
          )}
        </div>
        <div className="preview-content">
          <p className="preview-price">
            {values.price && Number.isFinite(Number(values.price))
              ? formatPrice(Number(values.price))
              : '$0'}
          </p>
          <h2>{values.title || 'Your next great find'}</h2>
          <span className="preview-category">
            {values.category ? categoryName(values.category) : 'Choose a category'}
          </span>
          {values.description && <p className="preview-description">{values.description}</p>}
        </div>
        <div className="preview-note">A clear photo and a few honest details go a long way.</div>
      </aside>
    </form>
  );
}
