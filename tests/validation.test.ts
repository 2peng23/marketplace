import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { listingSchema, messageSchema, priceSchema } from '../src/lib/validation';
import { browseReturnUrl, browseUrl, formatPrice } from '../src/lib/marketplace';

test('money accepts free and cents, rejects negative, exponent and excess precision', () => {
  assert.equal(priceSchema.parse('0'), 0);
  assert.equal(priceSchema.parse('25.99'), 25.99);
  for (const input of ['-1', '0.001', '1e3', 'Infinity', 'NaN', '100000000', ''])
    assert.equal(priceSchema.safeParse(input).success, false, input);
  assert.equal(formatPrice(0), 'Free');
});
test('listing fields are trimmed and unsupported categories are rejected', () => {
  const input = {
    requestId: randomUUID(),
    title: ' A good chair ',
    description: ' Solid wood. ',
    price: '85',
    category: 'furniture',
    sellerEmail: '  Seller@example.com  ',
  };
  assert.equal(listingSchema.parse(input).title, 'A good chair');
  assert.equal(listingSchema.parse(input).sellerEmail, 'seller@example.com');
  assert.equal(listingSchema.safeParse({ ...input, title: '   ' }).success, false);
  assert.equal(listingSchema.safeParse({ ...input, category: 'invented' }).success, false);
});
test('message contract never accepts a caller-supplied seller', () => {
  const input = {
    requestId: randomUUID(),
    listingId: randomUUID(),
    buyerEmail: 'buyer@example.test',
    message: 'Is this available?',
  };
  assert.equal(messageSchema.safeParse(input).success, true);
  assert.equal(
    messageSchema.safeParse({ ...input, sellerEmail: 'attacker@example.test' }).success,
    false,
  );
  assert.equal(messageSchema.safeParse({ ...input, message: ' '.repeat(10) }).success, false);
});
test('browse URLs preserve literal search input and category without losing encoding', () => {
  const url = browseUrl({ category: 'home-garden', query: 'chair & lamp?' });
  const parsed = new URL(url, 'https://marketplace.example');
  assert.equal(parsed.searchParams.get('q'), 'chair & lamp?');
  assert.equal(parsed.searchParams.get('category'), 'home-garden');
  assert.equal(parsed.searchParams.has('page'), false);
});

test('listing return URLs preserve browse filters and reject external destinations', () => {
  assert.equal(browseReturnUrl('/my-listings?q=chair'), '/my-listings?q=chair');
  assert.equal(browseReturnUrl('/?category=furniture&q=chair'), '/?category=furniture&q=chair');
  for (const input of [
    'https://elsewhere.example',
    '//elsewhere.example',
    '/listings/not-a-browse-page',
    ['/'],
    null,
  ])
    assert.equal(browseReturnUrl(input), '/');
});
