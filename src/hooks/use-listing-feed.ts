'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ListingFeedPage } from '@/lib/marketplace';
import { listingFeedSchema } from '@/lib/validation';
import { requestJson } from '@/lib/api';

export type ListingFeedOptions = {
  initialPage?: ListingFeedPage;
  category: string;
  query: string;
  createdListingIds?: string[];
};

export function useListingFeed({
  initialPage,
  category,
  query,
  createdListingIds,
}: ListingFeedOptions) {
  const emptyBrowserList = createdListingIds?.length === 0;
  const [feed, setFeed] = useState<ListingFeedPage>(
    initialPage ?? {
      items: [],
      count: 0,
      nextPage: emptyBrowserList ? null : 1,
    },
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const sentinelReference = useRef<HTMLDivElement>(null);
  const pendingRequest = useRef<AbortController | null>(null);

  const requestMore = useCallback(async () => {
    if (pendingRequest.current || feed.nextPage === null) return;
    const controller = new AbortController();
    pendingRequest.current = controller;
    setLoading(true);
    setError('');
    try {
      const parameters = new URLSearchParams({ page: String(feed.nextPage), category, q: query });
      const browserList = createdListingIds !== undefined;
      const result = await requestJson(
        `/api/${browserList ? 'my-listings' : 'listings'}?${parameters}`,
        listingFeedSchema,
        {
          signal: controller.signal,
          ...(browserList
            ? {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identifiers: createdListingIds }),
              }
            : {}),
        },
      );
      if (controller.signal.aborted) return;
      setFeed((previous) => {
        const knownIds = new Set(previous.items.map((listing) => listing.id));
        return {
          ...result,
          items: [
            ...previous.items,
            ...result.items.filter((listing) => !knownIds.has(listing.id)),
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
  }, [category, query, feed.nextPage, createdListingIds]);

  useEffect(
    () => () => {
      pendingRequest.current?.abort();
      pendingRequest.current = null;
    },
    [],
  );

  useEffect(() => {
    const target = sentinelReference.current;
    if (
      !target ||
      loading ||
      error ||
      feed.nextPage === null ||
      !('IntersectionObserver' in window)
    )
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void requestMore();
      },
      { rootMargin: '80px' },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [loading, error, feed.nextPage, requestMore]);

  return {
    feed,
    loading,
    error,
    sentinelReference,
    requestMore,
    initialLoading:
      !initialPage && !emptyBrowserList && feed.nextPage === 1 && feed.items.length === 0 && !error,
  };
}
