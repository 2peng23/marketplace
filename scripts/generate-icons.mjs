import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
const source = await readFile(new URL('../public/icon.svg', import.meta.url));
for (const [size, name] of [
  [180, 'apple-touch-icon.png'],
  [192, 'icon-192.png'],
  [512, 'icon-512.png'],
])
  await sharp(source)
    .resize(size, size)
    .png()
    .toFile(fileURLToPath(new URL(`../public/${name}`, import.meta.url)));
const sizes = [16, 32, 48];
const images = await Promise.all(
  sizes.map((size) => sharp(source).resize(size, size).png().toBuffer()),
);
const header = Buffer.alloc(6);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);
let offset = 6 + 16 * images.length;
const directory = images.map((image, index) => {
  const entry = Buffer.alloc(16);
  entry[0] = sizes[index];
  entry[1] = sizes[index];
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(image.length, 8);
  entry.writeUInt32LE(offset, 12);
  offset += image.length;
  return entry;
});
await writeFile(
  new URL('../public/favicon.ico', import.meta.url),
  Buffer.concat([header, ...directory, ...images]),
);
console.log('Generated SVG, ICO, Apple, and PNG application icons.');
