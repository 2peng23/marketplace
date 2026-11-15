import 'server-only';
import { PAGE_SIZE, type ListingPage, type ListingFeedPage } from '@/lib/marketplace';
import { imageUrl } from './supabase';

export function serializeListingFeed(listings: ListingPage, page: number): ListingFeedPage {
  return {
    items: listings.items.map((listing) => ({
      ...listing,
      imageUrl: imageUrl(listing.image_path),
    })),
    count: listings.count,
    nextPage: page * PAGE_SIZE < listings.count ? page + 1 : null,
  };
}
