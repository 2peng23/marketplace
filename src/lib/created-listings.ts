import { identifierSchema } from '@/lib/validation';

export const CREATED_LISTINGS_STORAGE_KEY = 'marketplace.created-listings';
const changeEvent = 'marketplace-listings-changed';

export function parseCreatedListingIds(snapshot: string) {
  try {
    const values: unknown = JSON.parse(snapshot || '[]');
    if (!Array.isArray(values)) return [];
    return [
      ...new Set(
        values.filter((value): value is string => identifierSchema.safeParse(value).success),
      ),
    ].slice(0, 1000);
  } catch {
    return [];
  }
}

export function createdListingsSnapshot() {
  try {
    return localStorage.getItem(CREATED_LISTINGS_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function subscribeToCreatedListings(notify: () => void) {
  function storageChanged(event: StorageEvent) {
    if (event.key === CREATED_LISTINGS_STORAGE_KEY || event.key === null) notify();
  }
  window.addEventListener('storage', storageChanged);
  window.addEventListener(changeEvent, notify);
  return () => {
    window.removeEventListener('storage', storageChanged);
    window.removeEventListener(changeEvent, notify);
  };
}

export function rememberCreatedListing(identifier: string) {
  if (!identifierSchema.safeParse(identifier).success) return;
  try {
    const identifiers = [
      identifier,
      ...parseCreatedListingIds(createdListingsSnapshot()).filter((value) => value !== identifier),
    ];
    localStorage.setItem(CREATED_LISTINGS_STORAGE_KEY, JSON.stringify(identifiers.slice(0, 1000)));
    window.dispatchEvent(new Event(changeEvent));
  } catch {
    /* A successful listing stays published when browser storage is unavailable. */
  }
}
