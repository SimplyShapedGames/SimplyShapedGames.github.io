import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';

const packageInfo = JSON.parse(await readFile('package.json', 'utf8'));
const games = packageInfo.name === 'simplyshapedgames-website';
const title = games ? 'SimplyShapedGames' : 'SimplyShaped';
const tileColour = games ? '#3C82F6' : '#000000';
const tileRGB = games ? [60, 130, 246, 255] : [0, 0, 0, 255];
const iconVersion = '20260914';
const svg = await readFile('public/favicon.svg');
// Verbatim native geometry from Sites' public/brand/simplyshapedsites-mark.svg.
// Only title and tile ink vary across the family. This test needs no sibling repo.
const canonical = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">
  <title>${title}</title>
  <rect x="4" y="4" width="72" height="72" rx="19" fill="${tileColour}"/>
  <g fill="#ffffff">
    <circle cx="27" cy="27" r="10"/>
    <rect x="43" y="17" width="20" height="20" rx="4"/>
    <path d="M40 43C41 43 41.7 43.7 42.2 44.7L49.5 58.5Q50 59.5 50 60.5Q50 63 47.5 63H32.5Q30 63 30 60.5Q30 59.5 30.5 58.5L37.8 44.7C38.3 43.7 39 43 40 43Z"/>
  </g>
</svg>`;

async function verifyPixels(input, size, label) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, size, label);
  assert.equal(info.height, size, label);
  const rgba = (x, y) => [...data.subarray((y * size + x) * 4, (y * size + x) * 4 + 4)];
  for (const [x, y] of [[0, 0], [size - 1, 0], [0, size - 1], [size - 1, size - 1]]) {
    assert.equal(rgba(x, y)[3], 0, `${label} outer corners must be transparent`);
  }
  // This point is away from every shape even at the smallest 16px ICO size.
  assert.deepEqual(rgba(Math.floor(15 * size / 80), Math.floor(50 * size / 80)), tileRGB, `${label} tile ink`);
  for (const [x, y] of [[27, 27], [53, 27], [40, 55]]) {
    assert.deepEqual(rgba(Math.floor(x * size / 80), Math.floor(y * size / 80)), [255, 255, 255, 255], `${label} white shape centre`);
  }
  const expected = await sharp(svg).resize(size, size).ensureAlpha().raw().toBuffer();
  assert(data.equals(expected), `${label} must derive exactly from the native SVG, without flattening or altered geometry`);
}

test('tab icon preserves exact Sites geometry with fixed family ink and white shapes', async () => {
  assert.equal(svg.toString().replaceAll('\r', '').trim(), canonical);
  await verifyPixels(svg, 80, 'SVG');
});

test('all raster icon sizes keep transparent outer corners and opaque white shapes', async () => {
  for (const [file, size] of [
    ['favicon-96x96.png', 96], ['apple-touch-icon.png', 180],
    ['web-app-manifest-192x192.png', 192], ['web-app-manifest-512x512.png', 512],
  ]) {
    const bytes = await readFile(`public/${file}`);
    assert((await sharp(bytes).metadata()).hasAlpha, `${file} must retain alpha`);
    await verifyPixels(bytes, size, file);
  }
});

test('ICO contains exact transparent 16px, 32px and 48px fallbacks', async () => {
  const ico = await readFile('public/favicon.ico');
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 3);
  let end = 54;
  for (const [index, size] of [16, 32, 48].entries()) {
    const entry = 6 + index * 16;
    assert.equal(ico[entry], size);
    assert.equal(ico[entry + 1], size);
    assert.equal(ico.readUInt16LE(entry + 4), 1);
    assert.equal(ico.readUInt16LE(entry + 6), 32);
    const length = ico.readUInt32LE(entry + 8);
    const offset = ico.readUInt32LE(entry + 12);
    assert.equal(offset, end, 'No hidden padding or missing ICO image bytes');
    await verifyPixels(ico.subarray(offset, offset + length), size, `ICO ${size}px`);
    end = offset + length;
  }
  assert.equal(ico.length, end);
});

test('all icon links request the new icon revision instead of stale browser caches', async () => {
  const layout = await readFile('src/layouts/SiteLayout.astro', 'utf8');
  for (const file of ['favicon.svg', 'favicon.ico', 'favicon-96x96.png', 'apple-touch-icon.png', 'site.webmanifest']) {
    assert(layout.includes(`href="/${file}?v=${iconVersion}"`), `${file} must use the new icon revision`);
  }
  const manifest = JSON.parse(await readFile('public/site.webmanifest', 'utf8'));
  assert.equal(manifest.name, title);
  assert.deepEqual(manifest.icons.map(icon => icon.src), [192, 512].map(size => `/web-app-manifest-${size}x${size}.png?v=${iconVersion}`));
});
