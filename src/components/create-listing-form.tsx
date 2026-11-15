'use client';
import Image from 'next/image';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { categories, MAX_IMAGE_BYTES } from '@/lib/marketplace';
import { rememberCreatedListing } from '@/lib/created-listings';
import { listingCreatedSchema, listingSchema, validationFields } from '@/lib/validation';
import { ApiError, requestJson } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Alert, AlertDescription } from '@/components/ui/alert';

type FieldErrors = Record<string, string>;
export function CreateListingForm({
  onCancel,
  onSuccess,
  onSubmittingChange,
  submitting,
}: {
  onCancel: () => void;
  onSuccess: (identifier: string) => void;
  onSubmittingChange: (submitting: boolean) => void;
  submitting: boolean;
}) {
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [fields, setFields] = useState<FieldErrors>({});
  const [error, setError] = useState('');
  const requestIdentifier = useRef({ id: '', contents: '' });
  const fileReference = useRef<HTMLInputElement>(null);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  function choosePhoto(file: File | null) {
    requestIdentifier.current = { id: '', contents: '' };
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
    form.set('requestId', requestIdentifier.current.id || crypto.randomUUID());
    const result = listingSchema.safeParse(Object.fromEntries(form));
    const nextFields: FieldErrors = result.success ? {} : validationFields(result.error);
    if (!photo) nextFields.photo = 'Choose a product photo.';
    setFields(nextFields);
    if (!result.success || !photo) {
      document.getElementById(Object.keys(nextFields)[0])?.focus();
      return;
    }
    const contents = JSON.stringify([
      result.data.title,
      result.data.description,
      result.data.price,
      result.data.category,
      result.data.sellerEmail,
    ]);
    if (!requestIdentifier.current.id || requestIdentifier.current.contents !== contents)
      requestIdentifier.current = { id: crypto.randomUUID(), contents };
    form.set('requestId', requestIdentifier.current.id);
    form.set('photo', photo);
    onSubmittingChange(true);
    try {
      const payload = await requestJson('/api/listings', listingCreatedSchema, {
        method: 'POST',
        body: form,
      });
      rememberCreatedListing(payload.id);
      onSuccess(payload.id);
    } catch (failure) {
      if (failure instanceof ApiError) setFields(failure.fields);
      setError(failure instanceof Error ? failure.message : 'Please try again.');
      onSubmittingChange(false);
    }
  }
  const fieldError = (name: string) =>
    fields[name] ? (
      <span id={`${name}-error`} className="field-error">
        {fields[name]}
      </span>
    ) : null;

  return (
    <form className="create-form" onSubmit={submitListing} noValidate aria-busy={submitting}>
      <div className="create-form-grid">
        <div className="create-photo-column">
          <Label htmlFor="photo">Photo</Label>
          <div
            className={`photo-upload ${preview ? 'has-photo' : ''} ${fields.photo ? 'invalid' : ''}`}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (!submitting) choosePhoto(event.dataTransfer.files[0] ?? null);
            }}
          >
            {preview ? (
              <>
                <Image
                  src={preview}
                  alt="Your selected product photo"
                  fill
                  unoptimized
                  sizes="400px"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  className="remove-photo"
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    choosePhoto(null);
                    if (fileReference.current) fileReference.current.value = '';
                  }}
                >
                  Remove photo
                </Button>
              </>
            ) : (
              <div className="upload-copy">
                <strong>Add photo</strong>
                <span>Drop an image or choose a file</span>
                <small>JPEG, PNG or WebP · Up to 4 MB</small>
              </div>
            )}
            <Input
              className="upload-input"
              ref={fileReference}
              id="photo"
              type="file"
              aria-label="Product photo"
              accept="image/jpeg,image/png,image/webp"
              disabled={submitting}
              aria-invalid={!!fields.photo}
              aria-describedby={fields.photo ? 'photo-error' : undefined}
              onChange={(event) => choosePhoto(event.target.files?.[0] ?? null)}
            />
          </div>
          {fieldError('photo')}
        </div>
        <div className="create-details-fields">
          <div className="field">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              name="title"
              placeholder="What are you selling?"
              maxLength={120}
              required
              disabled={submitting}
              aria-invalid={!!fields.title}
              aria-describedby={fields.title ? 'title-error' : undefined}
            />
            {fieldError('title')}
          </div>
          <div className="form-row">
            <div className="field">
              <Label htmlFor="price">Price (USD)</Label>
              <Input
                id="price"
                name="price"
                inputMode="decimal"
                placeholder="0.00"
                maxLength={11}
                required
                disabled={submitting}
                aria-invalid={!!fields.price}
                aria-describedby={fields.price ? 'price-error' : undefined}
              />
              {fieldError('price')}
            </div>
            <div className="field">
              <Label htmlFor="category">Category</Label>
              <NativeSelect
                id="category"
                name="category"
                defaultValue=""
                required
                disabled={submitting}
                aria-invalid={!!fields.category}
                aria-describedby={fields.category ? 'category-error' : undefined}
              >
                <NativeSelectOption value="" disabled>
                  Select category
                </NativeSelectOption>
                {categories.map((category) => (
                  <NativeSelectOption value={category.slug} key={category.slug}>
                    {category.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              {fieldError('category')}
            </div>
          </div>
          <div className="field">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              rows={4}
              maxLength={3000}
              placeholder="Condition and details"
              required
              disabled={submitting}
              aria-invalid={!!fields.description}
              aria-describedby={fields.description ? 'description-error' : undefined}
            />
            {fieldError('description')}
          </div>
          <div className="field">
            <Label htmlFor="sellerEmail">Your email</Label>
            <Input
              id="sellerEmail"
              name="sellerEmail"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              maxLength={254}
              required
              disabled={submitting}
              aria-invalid={!!fields.sellerEmail}
              aria-describedby={`email-help${fields.sellerEmail ? ' sellerEmail-error' : ''}`}
            />
            <span className="field-help" id="email-help">
              Visible to buyers on your listing.
            </span>
            {fieldError('sellerEmail')}
          </div>
        </div>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="form-actions">
        <Button variant="outline" type="button" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Publishing…' : 'Publish listing'}
        </Button>
      </div>
    </form>
  );
}
