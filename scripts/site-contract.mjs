import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

export const gameProjectIds = ['shapedash', 'pieceperfect', 'slide', 'copycat-expansion', 'the-witch-who-laughs'];
export const movedProjectIds = ['gymboree-geneva', 'simplyshapedgames-website', 'geneva-window-sticker', 'gymboree-reopening-flyer'];
export const movedPostIds = ['2026-06-09-SSG-Gymboree-Reopening-Flyer', '2026-08-25-SSG-Gymboree-Geneva-Website', '2026-08-31-SSG-Geneva-Window-Sticker', '2026-09-05-SSG-A-Home-For-The-Collection'];
export const keptPostIds = ['2020-06-16-SSG-Published-Slide', '2026-03-18-SSG-Published-PiecePerfect', '2026-08-17-SSG-Published-ShapeDash', '2025-08-31-SSG-The-Witch-Who-Laughs', '2026-09-01-SSG-Copycat-Expansion', '2026-09-02-SSG-Witch-Audio-Update'];

export async function publicGameProjects() {
  const result = [];
  for (const file of (await readdir('src/content/projects')).filter(file => file.endsWith('.md'))) {
    const source = await readFile(`src/content/projects/${file}`, 'utf8');
    if (/^published: false$|^status: In development$/m.test(source)) continue;
    const category = source.match(/^category: (.+)$/m)?.[1].trim();
    if (!['games', 'mods'].includes(category)) continue;
    result.push({ file, source, id: file.replace(/\.md$/, ''), category, status: source.match(/^status: (.+)$/m)?.[1].trim(), gallery: (source.match(/^  - image: /gm) || []).length });
  }
  assert.deepEqual(result.map(item => item.id).sort(), [...gameProjectIds].sort(), 'Published Games catalogue must contain exactly the five approved games/mods');
  return result;
}

export async function publicGamePosts() {
  const available = await readdir('_posts');
  for (const id of keptPostIds) assert(available.includes(`${id}.md`), `Retained game story is missing: ${id}`);
  return keptPostIds.map(id => `${id}.md`).sort().reverse();
}

export function homeCatalogueCounts(home) {
  const kinds = [...home.matchAll(/\bdata-work-item="(games|mods)"/g)].map(match => match[1]);
  return [kinds.length, kinds.filter(kind => kind === 'games').length, kinds.filter(kind => kind === 'mods').length];
}

export const expectedRedirects = new Map();
for (const id of movedProjectIds) for (const suffix of ['', '/']) expectedRedirects.set(`/projects/${id}${suffix}`, `https://simplyshaped.fr/projects/${id}/`);
for (const [from, to] of [['websites', 'websites'], ['design', 'design'], ['graphic-design', 'design']]) for (const suffix of ['', '/']) expectedRedirects.set(`/${from}${suffix}`, `https://simplyshaped.fr/${to}/`);
for (const id of movedPostIds) for (const slug of [id, id.toLowerCase()]) for (const suffix of ['', '/']) expectedRedirects.set(`/${slug}${suffix}`, `https://simplyshaped.fr/${id}/`);

export async function verifyRedirects(file = 'public/_redirects') {
  const source = await readFile(file, 'utf8');
  const records = source.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#')).map(line => line.split(/\s+/));
  assert(records.every(parts => parts.length === 3 && parts[2] === '301'), 'All migration redirects must be explicit permanent 301 redirects');
  const actual = new Map(records.map(([from, to]) => [from, to]));
  assert.equal(actual.size, records.length, 'Duplicate redirect sources');
  assert.deepEqual(actual, expectedRedirects, 'Moved non-game URLs need exact, scoped redirects to the parent portfolio');
  for (const from of actual.keys()) assert(!from.includes('*') && !from.startsWith('/privacypolicy') && !from.startsWith('/app-ads'), 'No wildcard or game-policy/advertising redirects');
  return actual;
}

export async function verifyPreservedGameSources() {
  for (const [path, hash] of [
    ['app-ads.txt', '4d4c70ca753db3b3dd48c0ceadc258cf901e591163241d33d401f79cf24ce85b'],
    ['privacypolicy.md', '44fe362eeee849b99113e3312507b20570010cfa810a030b66a54adf9e2728f0'],
  ]) assert.equal(createHash('sha256').update(await readFile(path)).digest('hex'), hash, `${path}: original game service file must remain byte-for-byte unchanged`);
}
