import 'server-only';
import { cache } from 'react';
import { getSupabase } from './supabase';
import { PAGE_SIZE, type Listing, type ListingPage } from '../marketplace';
import { identifierSchema } from '../validation';

export async function browseListings(
  category: string,
  query: string,
  page: number,
): Promise<ListingPage> {
  const { data, error } = await getSupabase().rpc('browse_listings', {
    category_filter: category,
    search_term: query,
    page_offset: (page - 1) * PAGE_SIZE,
    page_size: PAGE_SIZE,
  });
  if (error) throw new Error('Listings could not be loaded.');
  return data ?? { items: [], count: 0 };
}
export const findListing = cache(async (identifier: string): Promise<Listing | null> => {
  if (!identifierSchema.safeParse(identifier).success) return null;
  const { data, error } = await getSupabase()
    .from('listings')
    .select('id,title,description,price,category,seller_email,image_path,created_at,sale_status')
    .eq('id', identifier)
    .maybeSingle();
  if (error) throw new Error('This listing could not be loaded.');
  return data;
});

export async function findBrowserListings(
  identifiers: string[],
  category: string,
  query: string,
  page: number,
): Promise<ListingPage> {
  if (!identifiers.length) return { items: [], count: 0 };
  const batches: string[][] = [];
  for (let index = 0; index < identifiers.length; index += 100)
    batches.push(identifiers.slice(index, index + 100));
  const results = await Promise.all(
    batches.map((batch) =>
      getSupabase()
        .from('listings')
        .select(
          'id,title,description,price,category,seller_email,image_path,created_at,sale_status',
        )
        .in('id', batch),
    ),
  );
  if (results.some((result) => result.error)) throw new Error('Your listings could not be loaded.');
  const normalizedQuery = query.toLowerCase();
  const matches = results
    .flatMap((result) => result.data ?? [])
    .filter(
      (listing) =>
        (!category || listing.category === category) &&
        (!query ||
          `${listing.title} ${listing.description}`.toLowerCase().includes(normalizedQuery)),
    )
    .sort(
      (first, second) =>
        second.created_at.localeCompare(first.created_at) || second.id.localeCompare(first.id),
    );
  return { items: matches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), count: matches.length };
}
