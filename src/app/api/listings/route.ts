import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { listingSchema, validationFields } from '@/lib/validation';
import { MAX_IMAGE_BYTES } from '@/lib/marketplace';
import { getSupabase } from '@/lib/server/supabase';
import { checkRequest, enforceRateLimit, errorResponse, RequestError } from '@/lib/server/requests';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    checkRequest(request, MAX_IMAGE_BYTES + 64_000);
    const form = await request.formData();
    const parsed = listingSchema.safeParse(
      Object.fromEntries(
        ['requestId', 'title', 'description', 'price', 'category', 'sellerEmail'].map((key) => [
          key,
          form.get(key),
        ]),
      ),
    );
    if (!parsed.success)
      return NextResponse.json(
        { error: 'Check the highlighted fields.', fields: validationFields(parsed.error) },
        { status: 400 },
      );
    const input = parsed.data;
    const supabase = getSupabase();
    const existing = await supabase
      .from('listings')
      .select('id')
      .eq('id', input.requestId)
      .maybeSingle();
    if (existing.error)
      throw new RequestError('The marketplace is temporarily unavailable. Please try again.', 503);
    if (existing.data) return NextResponse.json({ id: existing.data.id });
    const file = form.get('photo');
    if (!(file instanceof File) || file.size === 0)
      throw new RequestError('Choose a product photo.');
    if (file.size > MAX_IMAGE_BYTES)
      throw new RequestError('Choose an image smaller than 4 MB.', 413);
    const bytes = Buffer.from(await file.arrayBuffer());
    let image: Buffer;
    try {
      const pipeline = sharp(bytes, { limitInputPixels: 24_000_000, animated: false });
      const metadata = await pipeline.metadata();
      if (
        !metadata.format ||
        !['jpeg', 'png', 'webp'].includes(metadata.format) ||
        (metadata.pages ?? 1) > 1
      )
        throw new Error('Unsupported image');
      image = await pipeline
        .rotate()
        .resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer();
    } catch {
      throw new RequestError('Choose a valid JPEG, PNG, or WebP image.');
    }
    await enforceRateLimit(request, 'listing');
    const path = `${input.requestId}/photo.webp`;
    const upload = await supabase.storage
      .from('listing-images')
      .upload(path, image, { contentType: 'image/webp', upsert: false });
    if (upload.error) {
      const concurrent = await supabase
        .from('listings')
        .select('id')
        .eq('id', input.requestId)
        .maybeSingle();
      if (concurrent.data) return NextResponse.json({ id: concurrent.data.id });
      throw new RequestError('The photo could not be uploaded. Please try again in a moment.', 503);
    }
    const result = await supabase
      .from('listings')
      .insert({
        id: input.requestId,
        title: input.title,
        description: input.description,
        price: input.price,
        category: input.category,
        seller_email: input.sellerEmail,
        image_path: path,
      });
    if (result.error) {
      await supabase.storage.from('listing-images').remove([path]);
      throw new RequestError('Your listing could not be saved. Please try again.', 503);
    }
    return NextResponse.json({ id: input.requestId }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
