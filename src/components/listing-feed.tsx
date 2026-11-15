'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { type ListingFeedPage } from '@/lib/marketplace';
import {
  createdListingsSnapshot,
  parseCreatedListingIds,
  subscribeToCreatedListings,
} from '@/lib/created-listings';
import { ListingCard } from '@/components/listing-card';
import { CreateListingTrigger } from '@/components/create-listing-dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

const emptySnapshot = () => '';

export function MyListingsFeed({ query }: { query: string }) {
  const snapshot = useSyncExternalStore(
    subscribeToCreatedListings,
    createdListingsSnapshot,
    emptySnapshot,
  );
  const identifiers = parseCreatedListingIds(snapshot);
  return (
    <ListingFeed
      key={`${query}:${snapshot}`}
      query={query}
      category=""
      ownIdentifiers={identifiers}
      returnTo="/my-listings"
    />
  );
}

export function ListingFeed({
  initialPage,
  category,
  query,
  returnTo,
  ownIdentifiers,
}: {
  initialPage?: ListingFeedPage;
  category: string;
  query: string;
  returnTo: string;
  ownIdentifiers?: string[];
}) {
  const [feed, setFeed] = useState<ListingFeedPage>(
    initialPage ?? { items: [], count: 0, nextPage: 1 },
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const sentinelReference = useRef<HTMLDivElement>(null);
  const pendingRequest = useRef<AbortController | null>(null);
  const ownedKey = ownIdentifiers?.join(',');

  const loadNext = useCallback(async () => {
    if (pendingRequest.current || feed.nextPage === null) return;
    const controller = new AbortController();
    pendingRequest.current = controller;
    try {
      const parameters = new URLSearchParams({ page: String(feed.nextPage), category, q: query });
      const response = await fetch(
        `/api/${ownedKey === undefined ? 'listings' : 'my-listings'}?${parameters}`,
        {
          signal: controller.signal,
          ...(ownedKey !== undefined
            ? {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identifiers: ownedKey ? ownedKey.split(',') : [] }),
              }
            : {}),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Listings could not be loaded.');
      if (controller.signal.aborted) return;
      const nextFeed = result as ListingFeedPage;
      setFeed((previous) => {
        const existingIds = new Set(previous.items.map((listing) => listing.id));
        return {
          ...nextFeed,
          items: [
            ...previous.items,
            ...nextFeed.items.filter((listing) => !existingIds.has(listing.id)),
          ],
        };
      });
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(failure instanceof Error ? failure.message : 'Listings could not be loaded.');
    } finally {
      if (pendingRequest.current === controller) pendingRequest.current = null;
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [category, query, feed.nextPage, ownedKey]);

  const requestMore = useCallback(() => {
    if (pendingRequest.current || feed.nextPage === null) return;
    setLoading(true);
    setError('');
    void loadNext();
  }, [loadNext, feed.nextPage]);

  useEffect(
    () => () => {
      pendingRequest.current?.abort();
      pendingRequest.current = null;
    },
    [],
  );

  useEffect(() => {
    const target = sentinelReference.current;
    if (!target || loading || error || feed.nextPage === null) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) requestMore();
      },
      { rootMargin: '80px' },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [loading, error, feed.nextPage, requestMore]);

  const initialLoading = !initialPage && feed.nextPage === 1 && feed.items.length === 0 && !error;

  return (
    <>
      <div className="results-heading">
        <span className="result-count">
          {(loading || initialLoading) && !feed.items.length
            ? 'Loading listings…'
            : `${feed.count} ${feed.count === 1 ? 'listing' : 'listings'}`}
        </span>
        <span className="sort-label">Newest first</span>
      </div>
      {feed.items.length > 0 && (
        <div className="listing-grid">
          {feed.items.map((listing, index) => (
            <ListingCard
              listing={listing}
              image={listing.imageUrl}
              returnTo={returnTo}
              priority={index < 4}
              key={listing.id}
            />
          ))}
        </div>
      )}
      {!loading && !initialLoading && !error && feed.items.length === 0 && (
        <section className="empty-state">
          <h2>{query || category ? 'No items found' : 'No listings yet'}</h2>
          <p>
            {query || category
              ? 'Try another search or category.'
              : ownIdentifiers
                ? 'Listings you create in this browser appear here.'
                : 'Create the first listing.'}
          </p>
          {query || category ? (
            <Button asChild>
              <Link href={ownIdentifiers ? '/my-listings' : '/'}>Clear search</Link>
            </Button>
          ) : (
            <CreateListingTrigger />
          )}
        </section>
      )}
      {error && (
        <Alert variant="destructive" className="feed-error">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="feed-status" ref={sentinelReference}>
        {loading ? (
          <p role="status">Loading listings…</p>
        ) : error ? (
          <Button variant="outline" onClick={requestMore}>
            Try again
          </Button>
        ) : feed.nextPage !== null ? (
          <Button variant="ghost" onClick={requestMore}>
            Load more
          </Button>
        ) : feed.items.length > 0 ? (
          <p>You’ve seen all listings.</p>
        ) : null}
      </div>
    </>
  );
}
