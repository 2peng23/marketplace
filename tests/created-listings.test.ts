import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCreatedListingIds } from '../src/lib/created-listings';
import { browseFilters, MAX_SAVED_LISTINGS } from '../src/lib/marketplace';

test('browser listing storage handles corrupted data, duplicates, and invalid identifiers', () => {
  const identifier = '00000000-0000-4000-8000-000000000001';
  for (const input of ['', 'broken JSON', '{}', 'null'])
    assert.deepEqual(parseCreatedListingIds(input), []);
  assert.deepEqual(
    parseCreatedListingIds(JSON.stringify([identifier, identifier, null, 123, 'invalid'])),
    [identifier],
  );
  const identifiers = Array.from(
    { length: MAX_SAVED_LISTINGS + 1 },
    (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  );
  assert.equal(parseCreatedListingIds(JSON.stringify(identifiers)).length, MAX_SAVED_LISTINGS);
});

test('page filters normalize untrusted URL values consistently', () => {
  assert.deepEqual(browseFilters({ category: 'furniture', q: '  chair & lamp  ' }), {
    category: 'furniture',
    query: 'chair & lamp',
  });
  assert.deepEqual(browseFilters({ category: 'invented', q: ['unexpected'] }), {
    category: '',
    query: '',
  });
  assert.equal(browseFilters({ q: 'a'.repeat(200) }).query.length, 100);
});
