import 'server-only';
import type { ListingInput } from '@/lib/validation';
import { getSupabase } from './supabase';
import { RequestError } from './errors';

export async function findPublishedListing(input: ListingInput) {
  const { data: listing, error } = await getSupabase()
    .from('listings')
    .select('id,title,description,price,category,seller_email')
    .eq('id', input.requestId)
    .maybeSingle();
  if (error)
    throw new RequestError('The marketplace is temporarily unavailable. Please try again.', 503);
  if (!listing) return null;
  if (
    listing.title !== input.title ||
    listing.description !== input.description ||
    Number(listing.price) !== input.price ||
    listing.category !== input.category ||
    listing.seller_email !== input.sellerEmail
  )
    throw new RequestError('This request was already used for a different listing.', 409);
  return { id: listing.id, created: false };
}

export async function publishListing(input: ListingInput, image: Buffer) {
  const supabase = getSupabase();
  const imagePath = `${input.requestId}/photo.webp`;
  const upload = await supabase.storage
    .from('listing-images')
    .upload(imagePath, image, { contentType: 'image/webp', upsert: false });
  if (upload.error) {
    const concurrentListing = await findPublishedListing(input);
    if (concurrentListing) return concurrentListing;
    throw new RequestError('The photo could not be uploaded. Please try again in a moment.', 503);
  }
  const result = await supabase.from('listings').insert({
    id: input.requestId,
    title: input.title,
    description: input.description,
    price: input.price,
    category: input.category,
    seller_email: input.sellerEmail,
    image_path: imagePath,
  });
  if (result.error) {
    // Delete only our upload, and only after confirming no listing references it.
    const existing = await supabase
      .from('listings')
      .select('id')
      .eq('id', input.requestId)
      .maybeSingle();
    if (!existing.error && !existing.data)
      await supabase.storage.from('listing-images').remove([imagePath]);
    if (existing.data) {
      const concurrentListing = await findPublishedListing(input);
      if (concurrentListing) return concurrentListing;
    }
    throw new RequestError('Your listing could not be saved. Please try again.', 503);
  }
  return { id: input.requestId, created: true };
}
