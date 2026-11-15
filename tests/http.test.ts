import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readForm, readJson } from '../src/lib/server/http';
import { RequestError } from '../src/lib/server/errors';

const localUrl = 'http://localhost/api/messages';

test('JSON bodies are limited by received bytes even when Content-Length is absent or incorrect', async () => {
  const headerVariants: HeadersInit[] = [{}, { 'content-length': '1' }];
  for (const headers of headerVariants) {
    const request = new Request(localUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message: 'x'.repeat(100) }),
    });
    await assert.rejects(
      readJson(request, 20),
      (error: unknown) => error instanceof RequestError && error.status === 413,
    );
  }
});

test('malformed JSON and cross-origin writes produce readable client errors', async () => {
  await assert.rejects(
    readJson(new Request(localUrl, { method: 'POST', body: '{broken' }), 100),
    (error: unknown) => error instanceof RequestError && error.status === 400,
  );
  await assert.rejects(
    readJson(
      new Request(localUrl, {
        method: 'POST',
        headers: { origin: 'https://elsewhere.example' },
        body: '{}',
      }),
      100,
    ),
    (error: unknown) => error instanceof RequestError && error.status === 403,
  );
});

test('multipart parsing preserves form values and rejects a malformed boundary', async () => {
  const form = new FormData();
  form.set('title', 'A good chair');
  form.set('photo', new File(['fixture'], 'chair.webp', { type: 'image/webp' }));
  const request = new Request(localUrl, { method: 'POST', body: form });
  const parsed = await readForm(request, 10_000);
  assert.equal(parsed.get('title'), 'A good chair');
  assert(parsed.get('photo') instanceof File);
  await assert.rejects(
    readForm(
      new Request(localUrl, {
        method: 'POST',
        headers: { 'content-type': 'multipart/form-data' },
        body: 'broken',
      }),
      100,
    ),
    (error: unknown) => error instanceof RequestError && error.status === 400,
  );
});
