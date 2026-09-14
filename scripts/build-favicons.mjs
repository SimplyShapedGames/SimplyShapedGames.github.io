import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

// favicon.svg is the native Sites-family geometry: a rounded tile and three
// white shapes. Keep transparent outer corners; never flatten against a canvas.
// PNG-in-ICO packaging follows the existing prepare-simplyshaped-brand script.
const mark = await readFile('public/favicon.svg');
for (const [filename, size] of [
  ['favicon-96x96.png', 96], ['apple-touch-icon.png', 180],
  ['web-app-manifest-192x192.png', 192], ['web-app-manifest-512x512.png', 512],
]) {
  await sharp(mark).resize(size, size).png().toFile(`public/${filename}`);
}
const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map(size => sharp(mark).resize(size, size).png().toBuffer()));
const directory = Buffer.alloc(6 + 16 * images.length);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(images.length, 4);
let offset = directory.length;
for (let index = 0; index < images.length; index++) {
  const entry = 6 + index * 16;
  directory[entry] = sizes[index];
  directory[entry + 1] = sizes[index];
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(images[index].length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += images[index].length;
}
await writeFile('public/favicon.ico', Buffer.concat([directory, ...images]));
console.log('Generated seven icon sizes from favicon.svg, preserving the outer alpha.');
