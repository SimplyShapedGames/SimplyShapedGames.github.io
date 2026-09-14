import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

test('Witch gallery uses the exact video still while journal and main artwork retain the approved poster', async () => {
  const mapping = await readFile('src/lib/art.ts', 'utf8');
  assert.match(mapping, /import witchPlayback from '\.\.\/assets\/projects\/gallery\/witch-sitting-video\.png'/);
  const bytes = await readFile('src/assets/projects/gallery/witch-sitting-video.png');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), 'fb239395c7fd7a17834950ce749a99c369771dbfa708ab348e67d42a09efcffd');
  const metadata = await sharp(bytes).metadata();
  assert.deepEqual([metadata.width, metadata.height], [1280, 674]);
  const project = await readFile('src/content/projects/the-witch-who-laughs.md', 'utf8');
  assert.match(project, /^icon: witchIcon$/m);
  assert.match(project, /- image: witchPlayback\s+alt: The sitting Witch/);
  assert.doesNotMatch(project, /TumTaRA|Wandering Witch playback test/);
  const journal = await readFile('_posts/2026-09-02-SSG-Witch-Audio-Update.md', 'utf8');
  assert.match(journal, /^wide-image: witch$/m);
  assert.match(project, /^cover: witch$/m);
  assert.match(mapping, /import witch from '\.\.\/assets\/projects\/witch-who-laughs-approved\.png'/);
  const posterBytes = await readFile('src/assets/projects/witch-who-laughs-approved.png');
  assert.equal(createHash('sha256').update(posterBytes).digest('hex'), '3ee85b4c2e65f9759da67ed5734391f7f65b534c73c8f06635c688fcbf4f4a12');
  const poster = await sharp(posterBytes).metadata();
  assert.deepEqual([poster.width, poster.height], [1280, 720]);
  assert.match(journal, /^image: witchIcon$/m);
});

test('only the Witch gallery uses native proportions and single-column responsive sizing', async () => {
  const template = await readFile('src/pages/projects/[id].astro', 'utf8');
  const css = await readFile('src/styles/catalogue-content.css', 'utf8');
  assert.match(template, /'gallery-native': id === 'the-witch-who-laughs'/);
  assert.match(css, /\.gallery-item\.gallery-native img\{aspect-ratio:auto\}/);
  assert.match(css, /\.gallery-item img\{[^}]*aspect-ratio:1\.55;/, 'Other galleries retain their current fitting');
  assert.match(css, /\.gallery-grid:has\(>\.gallery-item:only-child\)\{[^}]*max-width:900px\}/);
  assert(template.includes("widths={id === 'the-witch-who-laughs' ? [400, 700, 1100, 1280] : [400, 700, 1100]}"), 'Offer the original still resolution without changing other gallery sources');
  assert(template.includes("sizes={id === 'the-witch-who-laughs' ? '(max-width: 760px) calc(100vw - 48px), (max-width: 900px) calc(100vw - 72px), (max-width: 1012px) calc(100vw - 112px), 900px' : '(max-width: 560px) 90vw, 45vw'}"), 'The single image follows Games page margins and the 900px cap, not a half-width column');
});
