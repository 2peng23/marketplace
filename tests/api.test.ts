import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, requestJson } from '../src/lib/api';
import { listingCreatedSchema } from '../src/lib/validation';

const identifier = '00000000-0000-4000-8000-000000000001';

test('API responses are validated before a successful listing is used', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => Response.json({ id: identifier }));
  assert.deepEqual(await requestJson('/api/listings', listingCreatedSchema), { id: identifier });
  context.mock.method(globalThis, 'fetch', async () => Response.json({ id: 'not-a-uuid' }));
  await assert.rejects(requestJson('/api/listings', listingCreatedSchema), ApiError);
});

test('API errors preserve field errors and hide non-JSON server responses', async (context) => {
  context.mock.method(globalThis, 'fetch', async () =>
    Response.json(
      { error: 'Check your information.', fields: { title: 'Add a title.' } },
      { status: 400 },
    ),
  );
  await assert.rejects(requestJson('/api/listings', listingCreatedSchema), (error: unknown) => {
    assert(error instanceof ApiError);
    assert.equal(error.status, 400);
    assert.deepEqual(error.fields, { title: 'Add a title.' });
    return true;
  });
  context.mock.method(
    globalThis,
    'fetch',
    async () => new Response('<html>Unavailable</html>', { status: 503 }),
  );
  await assert.rejects(requestJson('/api/listings', listingCreatedSchema), (error: unknown) => {
    assert(error instanceof ApiError);
    assert.equal(error.status, 503);
    assert(!error.message.includes('<html>'));
    assert(!error.message.includes('JSON'));
    return true;
  });
});

test('aborted requests remain distinguishable from connection failures', async (context) => {
  const controller = new AbortController();
  controller.abort();
  context.mock.method(globalThis, 'fetch', async () => {
    throw controller.signal.reason;
  });
  await assert.rejects(
    requestJson('/api/listings', listingCreatedSchema, { signal: controller.signal }),
    (error: unknown) => error === controller.signal.reason,
  );
});
