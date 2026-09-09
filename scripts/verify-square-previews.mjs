import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { gameProjectIds } from './site-contract.mjs';

const root = resolve('dist');
const files = (await readdir(root, { recursive: true })).filter(file => file.endsWith('.html'));
const assets = new Set();
let previews = 0;
for (const file of files) {
  const html = await readFile(resolve(root, file), 'utf8');
  for (const [tag] of html.matchAll(/<img\b[^>]*>/g)) {
    if (!/\bclass="[^"]*\bsquare-preview\b/.test(tag)) continue;
    const width = Number(tag.match(/\bwidth="(\d+)"/)?.[1]);
    const height = Number(tag.match(/\bheight="(\d+)"/)?.[1]);
    assert(width > 0 && width === height, `${file}: preview dimensions must be square`);
    assets.add(tag.match(/\bsrc="([^"]+)"/)[1]);
    for (const candidate of (tag.match(/\bsrcset="([^"]+)"/)?.[1] || '').split(',')) {
      const src = candidate.trim().split(/\s+/)[0];
      if (src) assets.add(src);
    }
    previews++;
  }
}
assert(previews > 0, 'No square previews were generated');
for (const src of assets) {
  assert(src.startsWith('/_astro/'), `Unexpected preview source: ${src}`);
  const metadata = await sharp(resolve(root, '.' + src)).metadata();
  assert.equal(metadata.width, metadata.height, `${src}: responsive image is not square`);
}
const home = await readFile(resolve(root, 'index.html'), 'utf8');
assert.equal((home.match(/\bdata-work-item="(?:games|mods)"/g) || []).length, gameProjectIds.length, 'Every approved game/mod must appear in the home showcase');
assert.equal((home.match(/<img\b[^>]*\bclass="[^"]*\bsquare-preview\b/g) || []).length, gameProjectIds.length, 'Each home game/mod needs its own intact square preview');
for (const page of ['index.html', 'journal/index.html', 'games/index.html', 'mods/index.html']) {
  const html = await readFile(resolve(root, page), 'utf8');
  assert(!/gymboree-website-square\.|ssg-website-square\.|gymboree-reopening-flyer-square\./.test(html), `${page}: non-game artwork leaked into the Games catalogue`);
}
console.log(`Square previews verified: ${previews} image slots and ${assets.size} responsive assets across the Games site.`);
