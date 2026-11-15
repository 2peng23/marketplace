'use client';

import { useMemo, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { browseUrl } from '@/lib/marketplace';
import { useListingFeed, type ListingFeedOptions } from '@/hooks/use-listing-feed';
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
  const identifiers = useMemo(() => parseCreatedListingIds(snapshot), [snapshot]);
  return (
    <ListingFeed
      key={`${query}:${snapshot}`}
      query={query}
      category=""
      createdListingIds={identifiers}
      returnTo={browseUrl({ path: '/my-listings', query })}
    />
  );
}

export function ListingFeed({ returnTo, ...options }: ListingFeedOptions & { returnTo: string }) {
  const { feed, loading, initialLoading, error, sentinelReference, requestMore } =
    useListingFeed(options);
  const browserList = options.createdListingIds !== undefined;
  const filtered = Boolean(options.query || options.category);

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
          <h2>{filtered ? 'No items found' : 'No listings yet'}</h2>
          <p>
            {filtered
              ? 'Try another search or category.'
              : browserList
                ? 'Listings you create in this browser appear here.'
                : 'Create the first listing.'}
          </p>
          {filtered ? (
            <Button asChild>
              <Link href={browserList ? '/my-listings' : '/'}>Clear search</Link>
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
          <Button variant="outline" onClick={() => void requestMore()}>
            Try again
          </Button>
        ) : feed.nextPage !== null ? (
          <Button variant="ghost" onClick={() => void requestMore()}>
            Load more
          </Button>
        ) : feed.items.length > 0 ? (
          <p>You’ve seen all listings.</p>
        ) : null}
      </div>
    </>
  );
}
