import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeSellerContext, decodeSellerContext } from '../src/lib/server/seller-context';

test('seller context rejects forged, expired, malformed and legacy cookies', () => {
  const previous = process.env.RATE_LIMIT_SALT;
  process.env.RATE_LIMIT_SALT = 'test-only-signing-key-not-a-real-secret';
  try {
    const sellerId = '00000000-0000-4000-8000-000000000001';
    const token = encodeSellerContext(sellerId, 1000);
    assert.equal(decodeSellerContext(token, 2000), sellerId);
    assert.equal(decodeSellerContext(token, 3_601_000), null);
    const [payload, signature] = token.split('.');
    assert.equal(decodeSellerContext(`${payload}.${signature.slice(0, -1)}!`, 2000), null);
    assert.equal(decodeSellerContext(`${payload}.${'é'.repeat(43)}`, 2000), null);
    assert.equal(decodeSellerContext(`e30.${signature}`, 2000), null);
    assert.equal(decodeSellerContext(`${token}.extra`, 2000), null);
    assert.equal(decodeSellerContext('old.jwt.cookie', 2000), null);
    assert.equal(decodeSellerContext('x'.repeat(1025), 2000), null);
  } finally {
    if (previous === undefined) delete process.env.RATE_LIMIT_SALT;
    else process.env.RATE_LIMIT_SALT = previous;
  }
});
