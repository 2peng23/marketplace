import 'server-only';
import sharp from 'sharp';
import { MAX_IMAGE_BYTES } from '@/lib/marketplace';
import { RequestError } from './errors';

export async function prepareListingImage(photo: FormDataEntryValue | null) {
  if (!(photo instanceof File) || photo.size === 0)
    throw new RequestError('Choose a product photo.');
  if (photo.size > MAX_IMAGE_BYTES)
    throw new RequestError('Choose an image smaller than 4 MB.', 413);
  try {
    const pipeline = sharp(Buffer.from(await photo.arrayBuffer()), {
      limitInputPixels: 24_000_000,
      animated: false,
    });
    const metadata = await pipeline.metadata();
    if (
      !metadata.format ||
      !['jpeg', 'png', 'webp'].includes(metadata.format) ||
      (metadata.pages ?? 1) > 1
    )
      throw new Error('Unsupported image');
    return await pipeline
      .rotate()
      .resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    throw new RequestError('Choose a valid JPEG, PNG, or WebP image.');
  }
}
