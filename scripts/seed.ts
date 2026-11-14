import nextEnvironment from '@next/env';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { createHash } from 'node:crypto';

nextEnvironment.loadEnvConfig(process.cwd());
const url = process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !secret) throw new Error('Set the Supabase server configuration in .env.local first.');
const supabase = createClient(url, secret, { auth: { persistSession: false } });
const samples = [
  {
    title: 'Vintage accent chair',
    price: 85,
    category: 'furniture',
    photo: '1567538096630-e0c55bd6374c',
    description:
      'A comfortable accent chair with a warm timber frame and an easy, understated shape. A little character, plenty of life left.',
  },
  {
    title: 'Everyday mirrorless camera',
    price: 240,
    category: 'electronics',
    photo: '1516035069371-29a1b244cc32',
    description:
      'A compact camera for slow weekends and everyday moments. Includes the lens cap and a simple shoulder strap.',
  },
  {
    title: 'City cruiser bicycle',
    price: 160,
    category: 'sports',
    photo: '1485965120184-e220f721d03e',
    description:
      'An easygoing ride for errands and weekend exploring. Classic frame, comfortable upright position, ready for another route.',
  },
  {
    title: 'Studio headphones',
    price: 65,
    category: 'electronics',
    photo: '1546435770-a3e426bf472b',
    description:
      'Over-ear headphones with soft cushions and a clean, balanced sound. A good companion for a desk or a long playlist.',
  },
  {
    title: 'A lamp for the reading corner',
    price: 45,
    category: 'home-garden',
    photo: '1507473885765-e6ed057f782c',
    description:
      'A simple lamp with a warm glow and a small footprint. Just right for a bedside table or your favorite reading corner.',
  },
  {
    title: 'Everyday backpack',
    price: 38,
    category: 'clothing',
    photo: '1553062407-98eeb64c6a62',
    description:
      'A practical everyday bag with enough space for the essentials. Neutral canvas, useful pockets, and a comfortable carry.',
  },
  {
    title: 'A few good books',
    price: 18,
    category: 'books',
    photo: '1507842217343-583bb7270b66',
    description:
      'A small collection for a slower afternoon. Previously read, carefully kept, and ready for a new shelf.',
  },
  {
    title: 'Low-top everyday sneakers',
    price: 42,
    category: 'clothing',
    photo: '1549298916-b41d501d3772',
    description:
      'A classic pair of low-top sneakers with plenty of wear left. Cleaned and ready for the next walk.',
  },
  {
    title: 'Warm wood workspace',
    price: 55,
    category: 'furniture',
    photo: '1499933374294-4584851497cc',
    description:
      'A small wooden table for the things you like to keep close. Simple lines and a warm finish that settles into almost any room.',
  },
  {
    title: 'An indoor green companion',
    price: 22,
    category: 'home-garden',
    photo: '1416879595882-3373a0480b5b',
    description:
      'A little greenery for a sunny corner. Includes the pot. A cheerful starting point for a shelf or a windowsill.',
  },
  {
    title: 'Weekend acoustic guitar',
    price: 110,
    category: 'other',
    photo: '1510915361894-db8b60106cb1',
    description:
      'A full-size acoustic guitar for picking up an old song or learning a new one. Natural finish and a familiar warm sound.',
  },
  {
    title: 'Classic chess set',
    price: 28,
    category: 'toys-games',
    photo: '1586165368502-1bad197a6461',
    description:
      'A classic chess set for an unhurried game. All pieces included. Ready for a new opponent and a few more good moves.',
  },
] as const;
for (const [index, sample] of samples.entries()) {
  const hex = createHash('sha256').update(`marketplace-sample-${index}`).digest('hex');
  const identifier = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  const existing = await supabase.from('listings').select('id').eq('id', identifier).maybeSingle();
  if (existing.data) {
    await supabase.from('listings').update({ title: sample.title }).eq('id', identifier);
    console.log(`Already present: ${sample.title}`);
    continue;
  }
  const response = await fetch(
    `https://images.unsplash.com/photo-${sample.photo}?auto=format&fit=crop&w=1100&q=85`,
  );
  if (!response.ok)
    throw new Error(`Sample image unavailable: ${sample.title} (${response.status})`);
  const image = await sharp(Buffer.from(await response.arrayBuffer()))
    .rotate()
    .resize(1100, 1100, { fit: 'cover' })
    .webp({ quality: 85 })
    .toBuffer();
  const path = `${identifier}/photo.webp`;
  const uploaded = await supabase.storage
    .from('listing-images')
    .upload(path, image, { contentType: 'image/webp', upsert: true });
  if (uploaded.error) throw new Error(uploaded.error.message);
  const inserted = await supabase
    .from('listings')
    .insert({
      id: identifier,
      title: sample.title,
      description: `Demonstration listing — this item is sample content, not offered for sale.\n\n${sample.description}`,
      price: sample.price,
      category: sample.category,
      seller_email: 'demo@marketplace.example',
      image_path: path,
      created_at: new Date(Date.now() - index * 3_600_000).toISOString(),
    });
  if (inserted.error) throw new Error(inserted.error.message);
  console.log(`Seeded: ${sample.title}`);
}
