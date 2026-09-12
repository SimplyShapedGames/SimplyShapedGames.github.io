import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mergePagesRedirects } from './cloudflare-pages.mjs';
import { privateProjectIds } from './verify-privacy.mjs';
import { movedProjectIds, movedPostIds, publicGameProjects, publicGamePosts, homeCatalogueCounts, verifyRedirects, verifyPreservedGameSources } from './site-contract.mjs';

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

const projects = await publicGameProjects();
const categories = ['games', 'mods'];
const expectedCounts = [projects.length, ...categories.map(category => projects.filter(p => p.category === category).length)];
const home = await page('/');
const actualCounts = homeCatalogueCounts(home);
assert.deepEqual(actualCounts, expectedCounts, 'Live category counts do not match the catalogue. Fully stop and restart the dev process if content collections were added after startup.');
assert.deepEqual(expectedCounts, [5, 3, 2]);
assert(home.includes('id="games-mods"') && home.includes('id="services"'), 'Live home is missing showcase/services destinations');
assert(!/(?:€\s*500|500\s*€)/.test(home), 'Games pricing must be scoped to client needs, not a fixed Sites package');
for (const [path, expectedType] of [
  ['/brand/brand-lockup-mark.svg', /^image\/svg\+xml/],
  ['/brand/simplyshaped-wordmark.png', /^image\/png/],
  ['/brand/games-wordmark-suffix.png', /^image\/png/],
  ['/favicon.svg', /^image\/svg\+xml/],
  ['/favicon-96x96.png', /^image\/png/],
  ['/favicon.ico', /^image\/(?:x-icon|vnd\.microsoft\.icon)/],
  ['/apple-touch-icon.png', /^image\/png/],
  ['/site.webmanifest', /^(?:application\/manifest\+json|application\/json)/],
]) {
  const response = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(15000), redirect: 'error' });
  const body = await response.arrayBuffer();
  assert.equal(response.status, 200, `${path}: expected a working brand asset`);
  assert.match(response.headers.get('content-type') || '', expectedType, `${path}: unexpected content type`);
  assert(body.byteLength > 0, `${path}: empty brand asset`);
}
assert(home.includes('"@type":"Organization"'), 'Live home page is missing Organization structured data');
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
const posts = await publicGamePosts();
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
assert(about.includes('Storm') && about.includes('2017'), 'Games About story must identify its independent founder and history');
for (const name of ['SimplyShapedGames', 'SimplyShapedSites', 'SimplyShaped']) assert(about.includes(name), `About must explain ${name}`);
const contact = await page('/contact/');
assert(contact.includes('data-project-brief') && /href="mailto:[^"\s]+@[^"\s]+"/.test(contact), 'Live contact must have a brief workflow and direct email alternative');
for (const id of movedProjectIds) assert(!home.includes(`href="/projects/${id}/"`) && !search.includes(`href="/projects/${id}/"`), `Moved project ${id} is still discoverable on Games`);
for (const id of movedPostIds) assert(!journal.includes(`href="/${id}/"`) && !search.includes(`href="/${id}/"`), `Moved journal entry ${id} is still discoverable on Games`);
// _redirects is host configuration, not a public page: Astro preview hides it.
// Verify the exact packaged rules, without claiming local Astro executes them.
await verifyRedirects();
assert.equal(
  await readFile('dist/_redirects', 'utf8'),
  mergePagesRedirects(await readFile('public/_redirects', 'utf8'), posts),
  'Cloudflare preview package must retain all 30 migrations and the exact 12 game-journal case aliases',
);
await verifyPreservedGameSources();
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
console.log('Checks server-rendered content, search, RSS, images and redirect packaging. Does not verify browser rendering, external sites or execution of Cloudflare edge redirects.');
