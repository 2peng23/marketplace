import 'server-only';
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
  return data as ListingPage;
}
export async function findListing(identifier: string): Promise<Listing | null> {
  if (!identifierSchema.safeParse(identifier).success) return null;
  const { data, error } = await getSupabase()
    .from('listings')
    .select('id,title,description,price,category,seller_email,image_path,created_at')
    .eq('id', identifier)
    .maybeSingle();
  if (error) throw new Error('This listing could not be loaded.');
  return data as Listing | null;
}
