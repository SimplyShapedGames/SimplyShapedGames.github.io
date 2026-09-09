import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, relative, dirname, extname } from 'node:path';
import assert from 'node:assert/strict';
import { verifyPrivacy } from './verify-privacy.mjs';

const root = resolve('dist');
const origin = 'https://simplyshapedgames.fr';
const errors = [];
const htmlCache = new Map();
const walk = async directory => (await Promise.all((await readdir(directory, { withFileTypes: true })).map(entry => entry.isDirectory() ? walk(resolve(directory, entry.name)) : resolve(directory, entry.name)))).flat();
const files = await walk(root);
const htmlFiles = files.filter(file => file.endsWith('.html'));
const decode = text => text.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
const readHtml = async file => { if (!htmlCache.has(file)) htmlCache.set(file, await readFile(file, 'utf8')); return htmlCache.get(file); };
let checkedLinks = 0;
for (const file of htmlFiles) {
  const html = await readHtml(file);
  const path = '/' + relative(root, file).replaceAll('\\','/').replace(/index\.html$/, '');
  const page = new URL(path, origin);
  if ((html.match(/<h1(?:\s|>)/g) || []).length !== 1) errors.push(`${path}: expected exactly one main heading`);
  if (!html.includes('class="theme-toggle"')) errors.push(`${path}: missing persistent theme control`);
  if (!html.includes('<title>') || !html.includes('name="description"')) errors.push(`${path}: missing page metadata`);
  if (/C:\\Users\\|C:\\Unity\\|TODO|Lorem ipsum/.test(html)) errors.push(`${path}: private source path or unfinished content in output`);
  const urls = [...html.matchAll(/\b(?:href|src|action)="([^"]*)"/g)].map(m => m[1]);
  for (const [, srcset] of html.matchAll(/\bsrcset="([^"]*)"/g)) urls.push(...srcset.split(',').map(part => part.trim().split(/\s+/)[0]));
  for (const raw of urls) {
    if (!raw || raw === '#') { errors.push(`${path}: empty link`); continue; }
    const url = new URL(decode(raw), page);
    if (url.origin !== origin) continue;
    const pathname = decodeURIComponent(url.pathname);
    let target = resolve(root, '.' + pathname);
    if (!target.startsWith(root)) { errors.push(`${path}: path outside output`); continue; }
    try {
      if ((await stat(target)).isDirectory()) target = resolve(target, 'index.html');
      await stat(target);
      checkedLinks++;
      if (url.hash && target.endsWith('.html')) {
        const id = decodeURIComponent(url.hash.slice(1));
        if (!(await readHtml(target)).includes(`id="${id}"`)) errors.push(`${path}: missing anchor ${raw}`);
      }
    } catch { errors.push(`${path}: missing local target ${raw}`); }
  }
}

// Every published Markdown record must have a page and be reachable from its category.
const projectSources = (await readdir('src/content/projects')).filter(file => file.endsWith('.md'));
const home = await readHtml(resolve(root, 'index.html'));
const indexNowKey = '895587a45b4a41d2a0b4f8e2c126ffcc';
assert.equal((await readFile(resolve(root, `${indexNowKey}.txt`), 'utf8')).trim(), indexNowKey, 'IndexNow ownership key is missing or invalid');
for (const favicon of ['/favicon-96x96.png', '/favicon.ico', '/apple-touch-icon.png', '/site.webmanifest']) {
  assert(home.includes(`href="${favicon}"`), `Home page is missing ${favicon}`);
}
assert(home.includes('"@type":"Organization"'), 'Home page is missing Organization structured data');
assert(home.includes('"name":"SimplyShapedGames"'), 'Organization structured data is missing the company name');
assert(home.includes('https://simplyshapedgames.fr/web-app-manifest-512x512.png'), 'Organization structured data is missing the stable company logo');
const brandIconDimensions = new Map([
  ['favicon-96x96.png', [96, 96]],
  ['apple-touch-icon.png', [180, 180]],
  ['web-app-manifest-192x192.png', [192, 192]],
  ['web-app-manifest-512x512.png', [512, 512]],
]);
for (const [name, dimensions] of brandIconDimensions) {
  const data = await readFile(resolve(root, name));
  assert(data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), `${name} is not a PNG`);
  assert.deepEqual([data.readUInt32BE(16), data.readUInt32BE(20)], dimensions, `${name} has the wrong dimensions`);
}
assert((await stat(resolve(root, 'favicon.ico'))).size > 0, 'favicon.ico is empty');
const manifest = JSON.parse(await readFile(resolve(root, 'site.webmanifest'), 'utf8'));
assert.equal(manifest.name, 'SimplyShapedGames', 'Web app manifest has the wrong company name');
assert.deepEqual(manifest.icons.map(icon => icon.src), ['/web-app-manifest-192x192.png', '/web-app-manifest-512x512.png'], 'Web app manifest icons changed');
let projectCount = 0;
let galleryCount = 0;
for (const source of projectSources) {
  const content = await readFile(resolve('src/content/projects', source), 'utf8');
  if (/^published: false$|^status: In development$/m.test(content)) continue;
  const id = source.replace(/\.md$/, '');
  const category = content.match(/^category: (.+)$/m)?.[1].trim();
  const status = content.match(/^status: (.+)$/m)?.[1].trim();
  const target = `/projects/${id}/`;
  const projectHtml = await readHtml(resolve(root, `projects/${id}/index.html`));
  assert(home.includes(`href="${target}"`), `${id} not reachable from all creations`);
  assert((await readHtml(resolve(root, `${category}/index.html`))).includes(`href="${target}"`), `${id} missing from category`);
  assert(projectHtml.includes(status), `${id} missing status`);
  const hero = projectHtml.match(/<img\b[^>]*\bclass="project-banner"[^>]*>/)?.[0];
  assert(hero, `${id} missing landscape project banner`);
  const heroWidth = Number(hero.match(/\bwidth="(\d+)"/)?.[1]);
  const heroHeight = Number(hero.match(/\bheight="(\d+)"/)?.[1]);
  assert(heroWidth > heroHeight && heroHeight > 0, `${id} is using a square or portrait image in its banner slot`);
  assert(heroWidth >= 1000, `${id} is using a low-resolution preview in its banner slot`);
  const expectedGallery = (content.match(/^  - image: /gm) || []).length;
  const renderedGallery = (projectHtml.match(/class="gallery-item(?:\s|\")/g) || []).length;
  assert.equal(renderedGallery, expectedGallery, `${id} gallery does not match its source`);
  galleryCount += renderedGallery;
  projectCount++;
}
const flyerId = 'gymboree-reopening-flyer';
const stickerId = 'geneva-window-sticker';
const assertAdjacentDesigns = (ids, page) => {
  const stickerIndex = ids.indexOf(stickerId);
  const flyerIndex = ids.indexOf(flyerId);
  assert(stickerIndex >= 0 && flyerIndex === stickerIndex + 1, `${page}: reopening flyer must appear immediately after the newer window sticker`);
};
assertAdjacentDesigns([...home.matchAll(/<a class="project-row row-design" href="\/projects\/([^/]+)\//g)].map(match => match[1]), 'All creations');
const designHtml = await readHtml(resolve(root, 'design/index.html'));
assertAdjacentDesigns([...designHtml.matchAll(/<article class="collection-card collection-([^"]+)"/g)].map(match => match[1]), 'Design creations');
const flyerHtml = await readHtml(resolve(root, `projects/${flyerId}/index.html`));
assert(flyerHtml.includes('9 June 2026'), 'Reopening flyer is missing its completion date');
assert(flyerHtml.includes('/_astro/gymboree-reopening-flyer-banner.'), 'Reopening flyer is missing its landscape banner');
assert(/\/_astro\/gymboree-reopening-flyer\.[^"\s]+/.test(flyerHtml), 'Reopening flyer is missing its complete portrait artwork');
const flyerPostId = '2026-06-09-SSG-Gymboree-Reopening-Flyer';
const flyerPostUrl = `/${flyerPostId}/`;
const journalHtml = await readHtml(resolve(root, 'journal/index.html'));
assert(journalHtml.includes(`href="${flyerPostUrl}"`), 'Reopening flyer journal entry is missing from the journal');
assert(flyerHtml.includes(`href="${flyerPostUrl}"`), 'Reopening flyer journal entry is not linked from its creation page');
const flyerPostHtml = await readHtml(resolve(root, flyerPostId, 'index.html'));
assert(flyerPostHtml.includes('9 June 2026'), 'Reopening flyer journal entry is missing its event date');
assert(flyerPostHtml.includes('href="/projects/gymboree-reopening-flyer/"'), 'Reopening flyer journal entry is not linked back to its creation');
const gymboreeWebsiteHtml = await readHtml(resolve(root, 'projects/gymboree-geneva/index.html'));
assert(gymboreeWebsiteHtml.includes('captured 8 September 2026'), 'Gymboree Geneva is missing the current screenshot date');
assert(gymboreeWebsiteHtml.includes('/_astro/gymboree-website.'), 'Gymboree Geneva is missing its live responsive screenshot');
for (const name of ['app-ads.txt', 'CNAME']) assert.deepEqual(await readFile(resolve(root, name)), await readFile(name), `${name} changed in output`);
for (const page of ['aboutme', 'privacypolicy', 'tags']) assert.deepEqual(await readFile(resolve(root, `${page}.html`)), await readFile(resolve(root, `${page}/index.html`)), `${page}.html compatibility alias differs`);
const posts = (await readdir('_posts')).filter(file => file.endsWith('.md'));
const feed = await readFile(resolve(root, 'feed.xml'), 'utf8');
assert.equal((feed.match(/<item>/g) || []).length, posts.length, 'RSS should contain every post');
for (const post of posts) {
  const id = post.replace(/\.md$/, '');
  for (const slug of new Set([id, id.toLowerCase()])) await stat(resolve(root, slug, 'index.html'));
  assert(feed.includes(`/${id}/`), `${id} missing from RSS`);
}
assert((await readHtml(resolve(root,'privacypolicy/index.html'))).includes('request-user-data-deletion'), 'Data deletion section is missing');
assert((await readFile(resolve(root, 'robots.txt'), 'utf8')).includes('sitemap-index.xml'));
await stat(resolve(root, 'sitemap-index.xml'));
await stat(resolve(root, '.nojekyll'));
await stat(resolve(root, '404.html'));
for (const file of files.filter(file => extname(file) === '.css')) {
  for (const [,raw] of (await readFile(file, 'utf8')).matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
    if (/^(data:|https?:)/.test(raw)) continue;
    const target = raw.startsWith('/') ? resolve(root, '.' + raw) : resolve(dirname(file), raw);
    try { await stat(target); } catch { errors.push(`Missing stylesheet asset ${raw}`); }
  }
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
await verifyPrivacy();
await import('./verify-square-previews.mjs');
console.log(`Verified ${projectCount} project pages, ${galleryCount} gallery images, ${posts.length} original posts, ${htmlFiles.length} HTML files and ${checkedLinks} local links/assets.`);
console.log('Legacy URLs, RSS, privacy section, CNAME and app-ads.txt passed. External service availability and browser rendering are not covered by this static check.');
