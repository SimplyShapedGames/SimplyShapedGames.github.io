import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const limits = { files: 1000, fileBytes: 25 * 1024 * 1024 };
export const navigationCacheRules = ['/', '/:page', '/:page/', '/projects/:project', '/projects/:project/', '/*/index.html'];
const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const digest = data => createHash('sha256').update(data).digest('hex');

export function createPostRedirects(postFilenames) {
  const rules = [];
  for (const filename of [...postFilenames].filter(name => name.endsWith('.md')).sort()) {
    const canonical = filename.slice(0, -3);
    assert(/^\d{4}-\d{2}-\d{2}-[A-Za-z0-9-]+$/.test(canonical), `Unsafe dated post URL: ${filename}`);
    const lowercase = canonical.toLowerCase();
    if (lowercase === canonical) continue;
    rules.push(`/${lowercase} /${canonical}/ 301`, `/${lowercase}/ /${canonical}/ 301`);
  }
  return '# Dated journal aliases: preserve case-only URLs in Windows-built uploads.\n' + rules.join('\n') + '\n';
}

export function mergePagesRedirects(existingSource, postFilenames) {
  const combined = existingSource + (existingSource.endsWith('\n') ? '\n' : '\n\n') + createPostRedirects(postFilenames);
  const records = combined.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#')).map(line => line.split(/\s+/));
  assert(records.every(parts => parts.length === 3 && parts[2] === '301'), 'Every migration or case-alias redirect must be an explicit 301');
  assert.equal(new Set(records.map(([source]) => source)).size, records.length, 'A game case-alias conflicts with an existing migration redirect');
  return combined;
}

export function assertPublishablePath(path) {
  assert(path && !isAbsolute(path) && !/^[a-z]:/i.test(path) && !path.includes('\\'), `Unsafe upload path: ${path}`);
  const parts = path.split('/');
  assert(parts.every(part => part && part !== '.' && part !== '..'), `Unsafe upload path: ${path}`);
  assert(!parts.some(part => part.startsWith('.') && part !== '.nojekyll'), `Hidden/private file in upload: ${path}`);
  assert(!parts.some(part => /^(src|scripts|node_modules|docs|validation|functions|_posts|_layouts|_includes)$/i.test(part)), `Source directory in upload: ${path}`);
  assert(!/\.(?:astro|[cm]?tsx?|jsx|map|pem|key|zip)$/i.test(path), `Source, secret or archive in upload: ${path}`);
  assert(!/(?:^|\/)(?:_worker\.js|wrangler(?:\.[^/]*)?|package(?:-lock)?\.json|pnpm-lock\.yaml|AGENTS\.md)$/i.test(path), `Unexpected runtime/source file in static upload: ${path}`);
}

// Read a validated snapshot into memory before packaging. Never follow links or
// copy the project root: only the actual public dist files may be distributed.
export async function collectPagesFiles(distRoot) {
  const root = resolve(distRoot);
  const rootStat = await lstat(root);
  assert(rootStat.isDirectory() && !rootStat.isSymbolicLink(), 'Static output must be a real directory, not a link');
  const files = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      const absolute = resolve(directory, entry.name);
      const path = relative(root, absolute).split(sep).join('/');
      assertPublishablePath(path);
      const info = await lstat(absolute);
      assert(!info.isSymbolicLink(), `Symbolic link in upload: ${path}`);
      if (info.isDirectory()) { await visit(absolute); continue; }
      assert(info.isFile(), `Non-regular file in upload: ${path}`);
      assert(info.size <= limits.fileBytes, `Cloudflare drag-and-drop file exceeds 25 MiB: ${path}`);
      const data = await readFile(absolute);
      assert(data.length <= limits.fileBytes, `Cloudflare drag-and-drop file exceeds 25 MiB: ${path}`);
      files.push({ path, data, bytes: data.length, sha256: digest(data) });
      assert(files.length <= limits.files, 'Cloudflare dashboard upload exceeds 1,000 files; do not silently omit files');
    }
  }
  await visit(root);
  return files;
}

export function verifyPagesHosting(files) {
  const byPath = new Map(files.map(file => [file.path, file]));
  for (const path of ['index.html', '404.html', '_headers', '_redirects', 'robots.txt', 'sitemap-index.xml', 'feed.xml', 'CNAME', 'app-ads.txt', '.nojekyll']) {
    assert(byPath.has(path), `Static Pages output is missing ${path}`);
  }
  const text = path => byPath.get(path).data.toString('utf8');
  const headers = text('_headers').replaceAll('\r\n', '\n');
  const globalBlock = headers.match(/^\/\*\r?\n((?:[ \t]+[^\n]*\r?\n)+)/m)?.[1];
  assert(globalBlock, 'Missing global Cloudflare security headers');
  for (const header of [
    'X-Content-Type-Options: nosniff',
    'Referrer-Policy: strict-origin-when-cross-origin',
    'X-Frame-Options: DENY',
    'Permissions-Policy: camera=(), microphone=(), geolocation=()',
  ]) assert(globalBlock.includes(header), `Missing Cloudflare security header: ${header}`);
  assert(!/X-Robots-Tag/i.test(globalBlock), 'Custom-domain pages must not inherit global noindex');
  assert(!/Cache-Control/i.test(globalBlock), 'Do not override hashed asset caching globally');
  const headerLines = headers.split('\n');
  const headerBlock = rule => {
    const start = headerLines.indexOf(rule);
    const lines = [];
    for (let index = start + 1; start >= 0 && index < headerLines.length && /^[ \t]+/.test(headerLines[index]); index++) lines.push(headerLines[index].trim());
    return lines;
  };
  for (const rule of navigationCacheRules) {
    assert(headerBlock(rule).includes('Cache-Control: no-cache, must-revalidate'), `Missing browser revalidation rule for ${rule}`);
  }
  // These six non-overlapping path patterns follow Cloudflare's documented
  // placeholder/splat syntax. No broader cache override may catch hashed assets.
  const cacheRuleOwners = headerLines.flatMap((line, index) => {
    if (!/^[ \t]+Cache-Control:/i.test(line)) return [];
    let owner = index - 1;
    while (owner >= 0 && /^[ \t]+/.test(headerLines[owner])) owner--;
    return [headerLines[owner]];
  });
  assert.deepEqual(cacheRuleOwners, navigationCacheRules, 'Keep cache overrides limited to the intended navigation/root routes');
  for (const rule of ['https://:project.pages.dev/*', 'https://:version.:project.pages.dev/*', '/404.html', '/404']) {
    const start = headers.indexOf(`${rule}\n`);
    const block = start >= 0 ? headers.slice(start + rule.length + 1).split(/\n\s*\n/)[0] : '';
    assert(block.includes('X-Robots-Tag: noindex, follow'), `Missing noindex rule for ${rule}`);
  }
  assert.match(text('index.html'), /rel="canonical"[^>]*href="https:\/\/simplyshapedgames\.fr\/"/, 'Games homepage canonical must remain simplyshapedgames.fr');
  assert.match(text('robots.txt'), /^Allow: \/\s*$/m, 'Public domain must remain crawlable');
  assert(text('robots.txt').includes('https://simplyshapedgames.fr/sitemap-index.xml'), 'Robots sitemap must use the Games domain');
  assert.equal(text('CNAME').trim(), 'simplyshapedgames.fr', 'Compatibility CNAME has the wrong domain');
  assert.match(text('404.html'), /Page not found|A missing piece/, 'Preserve the real custom 404, not an SPA fallback');
  const redirects = text('_redirects').replaceAll('\r\n', '\n');
  assert(!/^\/\*\s/m.test(redirects), 'Do not replace missing pages with a catch-all redirect');
  for (const file of files) {
    const canonical = file.path.match(/^(\d{4}-\d{2}-\d{2}-[^/]+)\/index\.html$/)?.[1];
    if (!canonical || canonical === canonical.toLowerCase()) continue;
    for (const suffix of ['', '/']) {
      assert(redirects.includes(`/${canonical.toLowerCase()}${suffix} /${canonical}/ 301\n`), `Missing case-compatible journal redirect: ${canonical}${suffix}`);
    }
  }
  return { fileCount: files.length, totalBytes: files.reduce((sum, file) => sum + file.bytes, 0), largestFileBytes: Math.max(...files.map(file => file.bytes)) };
}

export async function packagePages({ distRoot, outputRoot }) {
  const input = resolve(distRoot);
  const output = resolve(outputRoot);
  const fromInput = relative(input, output);
  assert(fromInput && (fromInput === '..' || fromInput.startsWith(`..${sep}`) || isAbsolute(fromInput)), 'Release directory must not be inside the upload directory');
  const files = await collectPagesFiles(input);
  const summary = verifyPagesHosting(files);
  await mkdir(output, { recursive: true });
  const release = await mkdtemp(resolve(output, 'release-'));
  const directory = resolve(release, 'site');
  await mkdir(directory);
  for (const file of files) {
    const target = resolve(directory, ...file.path.split('/'));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.data, { flag: 'wx' });
    assert.equal(digest(await readFile(target)), file.sha256, `Packaged file changed: ${file.path}`);
  }
  const manifest = {
    format: 'simplyshapedgames-cloudflare-pages-v1',
    createdAt: new Date().toISOString(),
    canonicalOrigin: 'https://simplyshapedgames.fr',
    ...summary,
    files: files.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 })),
  };
  await writeFile(resolve(release, 'release-manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  return { directory, manifest: resolve(release, 'release-manifest.json'), ...summary };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2] || 'verify';
  assert(['verify', 'package'].includes(mode), 'Use verify or package; this script never deploys');
  const distRoot = resolve(projectRoot, 'dist');
  if (mode === 'package') {
    const result = await packagePages({ distRoot, outputRoot: resolve(projectRoot, 'validation/cloudflare-pages') });
    console.log(JSON.stringify({ ...result, publication: 'Not uploaded. Upload only the site folder after confirming the correct Cloudflare Pages project.' }, null, 2));
  } else {
    const summary = verifyPagesHosting(await collectPagesFiles(distRoot));
    console.log(`Cloudflare Pages package verified: ${summary.fileCount} static files, ${summary.totalBytes} bytes; security/preview headers, canonical, robots, sitemap and custom 404 present. No deployment performed.`);
  }
}
