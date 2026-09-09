import test from 'node:test';
import assert from 'node:assert/strict';
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, truncate, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { assertPublishablePath, collectPagesFiles, createPostRedirects, limits, mergePagesRedirects, packagePages, verifyPagesHosting } from './cloudflare-pages.mjs';
import { keptPostIds, publicGamePosts, verifyPreservedGameSources, verifyRedirects } from './site-contract.mjs';

const sourceHeaders = await readFile('public/_headers', 'utf8');
const baseFiles = {
  'index.html': '<title>SimplyShapedGames</title><link rel="canonical" href="https://simplyshapedgames.fr/">',
  '404.html': '<h1>A missing piece</h1><p>Page not found</p>',
  '_headers': sourceHeaders,
  '_redirects': createPostRedirects([]),
  'robots.txt': 'User-agent: *\nAllow: /\nSitemap: https://simplyshapedgames.fr/sitemap-index.xml\n',
  'sitemap-index.xml': '<?xml version="1.0"?><sitemapindex/>',
  'feed.xml': '<?xml version="1.0"?><rss/>',
  'CNAME': 'simplyshapedgames.fr\n',
  'app-ads.txt': 'public-advertising-verification\n',
  '.nojekyll': '',
};
const records = (replacements = {}) => Object.entries({ ...baseFiles, ...replacements }).map(([path, content]) => {
  const data = Buffer.from(content);
  return { path, data, bytes: data.length };
});
async function fixture(t) {
  const tempParent = resolve(tmpdir());
  const root = await mkdtemp(resolve(tempParent, 'simplyshapedgames-pages-test-'));
  t.after(async () => {
    // This test owns only this freshly-created temporary directory.
    assert.equal(dirname(root), tempParent);
    assert(basename(root).startsWith('simplyshapedgames-pages-test-'));
    await rm(root, { recursive: true, force: true });
  });
  const distRoot = resolve(root, 'dist');
  await mkdir(distRoot);
  await Promise.all(Object.entries(baseFiles).map(([path, data]) => writeFile(resolve(distRoot, path), data)));
  return { root, distRoot, outputRoot: resolve(root, 'releases') };
}

test('upload paths exclude private/source/runtime material and traversal', () => {
  for (const path of ['index.html', '.nojekyll', '_headers', '_astro/logo.a123.webp', 'assets/img/original.png']) assertPublishablePath(path);
  for (const path of ['../secret', '/absolute', 'C:/secret', 'a\\b', 'a//b', '.private/art.png', 'node_modules/a.js', 'src/page.astro', 'assets/.env', 'file.map', 'key.pem', 'archive.zip', '_worker.js', 'functions/index.js', 'wrangler.jsonc', 'package.json', '_posts/draft.md']) {
    assert.throws(() => assertPublishablePath(path), undefined, path);
  }
});

test('Pages headers cover production previews and branch previews without noindex on custom domain', () => {
  const result = verifyPagesHosting(records());
  assert.equal(result.fileCount, Object.keys(baseFiles).length);
  verifyPagesHosting(records({ '_headers': sourceHeaders.replaceAll('\n', '\r\n') }));
});

test('case-only journal URLs redirect to the canonical route on every build platform', () => {
  const redirects = createPostRedirects(['2026-09-05-SSG-A-Home-For-The-Collection.md', '2026-09-01-already-lowercase.md', 'README.txt']);
  assert(redirects.includes('/2026-09-05-ssg-a-home-for-the-collection /2026-09-05-SSG-A-Home-For-The-Collection/ 301\n'));
  assert(redirects.includes('/2026-09-05-ssg-a-home-for-the-collection/ /2026-09-05-SSG-A-Home-For-The-Collection/ 301\n'));
  assert(!redirects.includes('already-lowercase'));
  assert.throws(() => createPostRedirects(['2026-09-05-A\n/malicious.md']), /Unsafe dated post/);
  const files = records({ '_redirects': redirects, '2026-09-05-SSG-A-Home-For-The-Collection/index.html': '<h1>Journal</h1>' });
  verifyPagesHosting(files);
  assert.throws(() => verifyPagesHosting(records({ '2026-09-05-SSG-A-Home-For-The-Collection/index.html': '<h1>Journal</h1>' })), /journal redirect/);
});

test('global noindex, wrong canonical, missing preview rules and missing custom 404 fail', () => {
  assert.throws(() => verifyPagesHosting(records({ '_headers': sourceHeaders.replace('/*\n', '/*\n  X-Robots-Tag: noindex\n') })), /global noindex/);
  assert.throws(() => verifyPagesHosting(records({ 'index.html': baseFiles['index.html'].replace('simplyshapedgames.fr', 'simplyshaped.fr') })), /canonical/);
  assert.throws(() => verifyPagesHosting(records({ '_headers': sourceHeaders.replace('https://:version.:project.pages.dev/*', 'https://unrelated.example/*') })), /Missing noindex/);
  assert.throws(() => verifyPagesHosting(records().filter(file => file.path !== '404.html')), /missing 404.html/);
});

test('packaging preserves bytes, hidden compatibility file and prior snapshots', async t => {
  const paths = await fixture(t);
  const first = await packagePages(paths);
  const second = await packagePages(paths);
  assert.notEqual(first.directory, second.directory);
  const original = await collectPagesFiles(paths.distRoot);
  const manifest = JSON.parse(await readFile(first.manifest, 'utf8'));
  assert.deepEqual(manifest.files, original.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 })));
  for (const file of original) assert.deepEqual(await readFile(resolve(first.directory, file.path)), file.data);
  assert((await readdir(first.directory)).includes('.nojekyll'));
  assert(!(await readdir(first.directory)).includes('release-manifest.json'));
  assert(await lstat(second.directory));
});

test('packaging refuses a release destination inside dist', async t => {
  const paths = await fixture(t);
  await assert.rejects(packagePages({ ...paths, outputRoot: resolve(paths.distRoot, 'release') }), /must not be inside/);
});

test('packaging refuses symlinks rather than importing outside files', async t => {
  const paths = await fixture(t);
  const outside = resolve(paths.root, 'outside');
  await mkdir(outside);
  await writeFile(resolve(outside, 'private.txt'), 'must never be uploaded');
  await symlink(outside, resolve(paths.distRoot, 'linked-assets'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(collectPagesFiles(paths.distRoot), /Symbolic link/);
});

test('packaging refuses oversized files instead of silently omitting them', async t => {
  const paths = await fixture(t);
  const file = resolve(paths.distRoot, 'oversized.png');
  await writeFile(file, '');
  await truncate(file, limits.fileBytes + 1);
  await assert.rejects(collectPagesFiles(paths.distRoot), /exceeds 25 MiB/);
});

test('packaging refuses too many dashboard files instead of truncating upload', async t => {
  const paths = await fixture(t);
  const extraCount = limits.files - Object.keys(baseFiles).length + 1;
  await Promise.all(Array.from({ length: extraCount }, (_, i) => writeFile(resolve(paths.distRoot, `extra-${i}.txt`), '')));
  await assert.rejects(collectPagesFiles(paths.distRoot), /exceeds 1,000 files/);
});

test('CI checks and packages only; no GitHub Pages or Cloudflare deployment authority', async () => {
  const workflow = await readFile('.github/workflows/ci.yml', 'utf8');
  assert(workflow.includes('contents: read'));
  for (const command of ['pnpm check', 'pnpm test', 'pnpm build']) assert(workflow.includes(command));
  assert(workflow.includes('actions/upload-artifact@'));
  assert(workflow.includes('include-hidden-files: true'));
  assert(!/deploy-pages|upload-pages-artifact|pages: write|id-token: write|wrangler|CLOUDFLARE_API_TOKEN|inputs\.publish/.test(workflow));
});

test('website hosting disclosure is separate and the original game files remain hash-identical', async () => {
  await verifyPreservedGameSources();
  const page = await readFile('src/pages/privacypolicy.astro', 'utf8');
  assert(page.includes('id="website-privacy-heading"'));
  assert(page.includes('hosted and delivered by Cloudflare'));
  assert(page.includes('does not submit the form to a server'));
  assert(page.includes('id="mobile-game-policy-heading"'));
  assert(page.includes('<Content />'));
  assert(!page.includes('GitHub Pages'));
});

test('the 30 non-game redirects remain exact and merge with only 12 retained-game case aliases', async () => {
  assert.equal((await verifyRedirects()).size, 30);
  const migrationSource = await readFile('public/_redirects', 'utf8');
  const combined = mergePagesRedirects(migrationSource, await publicGamePosts());
  assert(combined.startsWith(migrationSource), 'Original migration manifest must remain a byte-preserved prefix');
  const rules = combined.split(/\r?\n/).filter(line => line && !line.startsWith('#'));
  assert.equal(rules.length, 42);
  for (const id of keptPostIds) for (const suffix of ['', '/']) assert(rules.includes(`/${id.toLowerCase()}${suffix} /${id}/ 301`));
  assert(!rules.some(line => /^\/(?:privacypolicy|app-ads\.txt)/.test(line)));
  assert.throws(() => mergePagesRedirects('/2020-06-16-ssg-published-slide /unexpected/ 301\n', ['2020-06-16-SSG-Published-Slide.md']), /conflicts/);
});
