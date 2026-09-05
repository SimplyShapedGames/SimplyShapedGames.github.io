import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { privateProjectIds } from './verify-privacy.mjs';

// Check the running server, not dist/: a successful build can coexist with a
// stale dev process that returns HTTP 200 and an entirely empty content store.
const origin = new URL(process.argv[2] || 'http://127.0.0.1:4321/');
assert(['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname), 'Only a local preview can be checked');
assert.equal(origin.protocol, 'http:');
const decode = value => value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const images = new Set();
let pages = 0;
async function page(path) {
  const response = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(15000), redirect: 'error' });
  assert.equal(response.status, 200, `${path}: expected a working page`);
  const html = await response.text();
  assert.match(response.headers.get('content-type') || '', /text\/html/, `${path}: expected HTML`);
  assert.match(html, /class="theme-toggle"/, `${path}: missing site layout`);
  for (const [, src] of html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)) {
    const url = new URL(decode(src), origin);
    if (url.origin === origin.origin) images.add(url.href);
  }
  pages++;
  return html;
}

const projects = [];
for (const file of (await readdir('src/content/projects')).filter(file => file.endsWith('.md'))) {
  const source = await readFile(`src/content/projects/${file}`, 'utf8');
  if (/^published: false$|^status: In development$/m.test(source)) continue;
  projects.push({
    id: file.replace(/\.md$/, ''),
    category: source.match(/^category: (.+)$/m)?.[1].trim(),
    status: source.match(/^status: (.+)$/m)?.[1].trim(),
    gallery: (source.match(/^  - image: /gm) || []).length,
  });
}
assert(projects.length > 0, 'No source projects found');
const categories = ['games', 'mods', 'websites', 'design'];
const expectedCounts = [projects.length, ...categories.map(category => projects.filter(p => p.category === category).length)];
const home = await page('/');
const actualCounts = [...home.matchAll(/<sup>(\d+)<\/sup>/g)].map(match => Number(match[1]));
assert.deepEqual(actualCounts, expectedCounts, 'Live category counts do not match the catalogue. Fully stop and restart the dev process if content collections were added after startup.');
const categoryPages = new Map();
for (const category of categories) categoryPages.set(category, await page(`/${category}/`));
let galleries = 0;
for (const project of projects) {
  const href = `href="/projects/${project.id}/"`;
  assert(home.includes(href), `${project.id}: missing from live home page`);
  assert(categoryPages.get(project.category)?.includes(href), `${project.id}: missing from live category`);
  const html = await page(`/projects/${project.id}/`);
  assert(html.includes(project.status), `${project.id}: missing status`);
  if (project.id === 'slide') {
    assert(html.includes('Google Play'), 'Slide must retain its Android store link');
    assert.doesNotMatch(html, /\biOS\b|App\s*Store|apps\.apple\.com|itunes\.apple\.com/i, 'Slide still advertises iOS availability');
  }
  const gallery = (html.match(/class="gallery-item(?:\s|\")/g) || []).length;
  assert.equal(gallery, project.gallery, `${project.id}: incomplete gallery`);
  galleries += gallery;
}

const journal = await page('/journal/');
const search = await page('/search/');
const posts = (await readdir('_posts')).filter(file => file.endsWith('.md'));
const journalDates = [...journal.matchAll(/<time datetime="([^"]+)"/g)].map(match => match[1].slice(0, 10));
assert.deepEqual(journalDates, posts.map(file => file.slice(0, 10)).sort().reverse(), 'Journal is not in newest-first date order');
assert.equal((search.match(/class="search-result"/g) || []).length, projects.length + posts.length, 'Live search index is incomplete');
for (const post of posts) {
  const path = `/${post.replace(/\.md$/, '')}/`;
  assert(journal.includes(`href="${path}"`), `${post}: missing from live journal`);
  const html = await page(path);
  if (post === '2020-06-16-SSG-Published-Slide.md') {
    assert(html.includes('play.google.com/store/apps/details?id=com.SimplyShapedGames.Slide_'), 'Slide journal entry must retain its Android store link');
    assert.doesNotMatch(html, /\biOS\b|App\s*Store|apps\.apple\.com|itunes\.apple\.com/i, 'Slide journal entry still advertises iOS availability');
  }
}
assert((await page('/privacypolicy/')).includes('request-user-data-deletion'), 'Live privacy content is missing');
const about = await page('/aboutme/');
assert(about.includes('about-collage'), 'About collage is missing');
assert(about.includes('class="collage-artwork"'), 'Theme-independent About collage is missing');
assert(about.includes('One person.') && about.includes('Many shapes.'), 'About headline is missing');
for (const id of await privateProjectIds()) {
  assert(!home.includes(id) && !search.includes(id), 'A private project is still discoverable');
  const response = await fetch(new URL(`/projects/${id}/`, origin), { signal: AbortSignal.timeout(15000), redirect: 'error' });
  assert.equal(response.status, 404, 'A hidden project still has a live detail page');
  await response.body?.cancel();
}
const feedResponse = await fetch(new URL('/feed.xml', origin), { signal: AbortSignal.timeout(15000), redirect: 'error' });
assert.equal(feedResponse.status, 200, 'Live RSS is unavailable');
assert.equal(((await feedResponse.text()).match(/<item>/g) || []).length, posts.length, 'Live RSS is empty or incomplete');

// Keep image requests bounded; Astro transforms these on demand in dev mode.
const pendingImages = [...images];
async function checkImages() {
  while (pendingImages.length) {
    const url = pendingImages.pop();
    const response = await fetch(url, { signal: AbortSignal.timeout(20000), redirect: 'error' });
    assert.equal(response.status, 200, `Image unavailable: ${url}`);
    assert.match(response.headers.get('content-type') || '', /^image\//, `Not an image: ${url}`);
    assert((await response.arrayBuffer()).byteLength > 0, `Empty image: ${url}`);
  }
}
await Promise.all(Array.from({ length: 3 }, checkImages));
console.log(`Live preview verified: ${projects.length} projects, category counts ${expectedCounts.join('/')}, ${galleries} gallery images, ${posts.length} posts, ${pages} pages and ${images.size} image responses.`);
console.log('Checks server-rendered content, search entries, RSS and image responses; does not verify browser rendering or external websites.');
