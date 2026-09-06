import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';

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
for (const page of ['journal/index.html', 'websites/index.html']) {
  const html = await readFile(resolve(root, page), 'utf8');
  for (const website of ['gymboree', 'ssg']) assert(html.includes(`${website}-website-square.`), `${page}: missing square ${website} screenshot`);
}
for (const page of ['index.html', 'design/index.html', 'projects/geneva-window-sticker/index.html']) {
  const html = await readFile(resolve(root, page), 'utf8');
  assert(html.includes('gymboree-reopening-flyer-square.'), `${page}: missing dedicated square reopening flyer preview`);
}
const journal = await readFile(resolve(root, 'journal/index.html'), 'utf8');
assert(journal.includes('gymboree-reopening-flyer-square.'), 'journal/index.html: missing dedicated square reopening flyer preview');
const flyerPost = await readFile(resolve(root, '2026-06-09-SSG-Gymboree-Reopening-Flyer/index.html'), 'utf8');
assert(flyerPost.includes('gymboree-reopening-flyer-banner.'), 'Reopening flyer journal entry is missing its landscape article artwork');
console.log(`Square previews verified: ${previews} image slots and ${assets.size} responsive assets, including both website screenshots.`);
