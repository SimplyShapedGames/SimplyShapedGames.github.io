// Local coordination check only: build each independent site first, then run
// node scripts/verify-shared-references.mjs --portfolio <SS root> --sites <SSS root>
// No other repository is required by a site's normal build or public runtime.
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, relative, resolve, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

export const sharedBrands = [
  { label: 'SS', name: 'SimplyShaped', url: 'https://simplyshaped.fr/', email: 'stormeckhart@simplyshaped.fr', role: 'The shared portfolio', description: 'Games, mods, websites and design, with a journal connecting the stories behind them.' },
  { label: 'SSS', name: 'SimplyShapedSites', url: 'https://simplyshapedsites.fr/', email: 'stormeckhart@simplyshapedsites.fr', role: 'Website design & development', description: 'Website design and development for businesses and independent professionals.' },
  { label: 'SSG', name: 'SimplyShapedGames', url: 'https://simplyshapedgames.fr/', email: 'stormeckhart@simplyshapedgames.fr', role: 'Game development & mods', description: 'Games, mods and game-development services, with a scope and quote shaped around each project’s needs.' },
];

export function normalizeSharedSource(source) {
  // Do not hide changed prose, punctuation, indentation or frontmatter order.
  return source.replaceAll('\r\n', '\n').replace(/[\t ]+$/gm, '');
}

export function firstDifferentLine(left, right) {
  const a = normalizeSharedSource(left).split('\n');
  const b = normalizeSharedSource(right).split('\n');
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) return i + 1;
  return null;
}

export function gamePolicyTail(source) {
  const normalized = normalizeSharedSource(source);
  const marker = '*Last updated: September 5, 2026*';
  const parts = normalized.split(marker);
  if (parts.length !== 2 || (parts[0] && !parts[0].endsWith('\n'))) throw new Error('privacypolicy.md: expected exactly one original game-policy date marker');
  return marker + parts[1];
}

export function explicitPublicIds(source, variable) {
  if (!['gameProjectIds', 'gamePostIds'].includes(variable)) throw new Error('Unsupported public list');
  const body = source.match(new RegExp(`export\\s+const\\s+${variable}\\s*=\\s*\\[([^\\]]*)\\]`))?.[1];
  if (!body) throw new Error(`src/lib/catalogue.ts: missing explicit ${variable}`);
  const ids = [...body.matchAll(/(['"])([A-Za-z0-9][A-Za-z0-9-]*)\1/g)].map(match => match[2]);
  if (!ids.length || body.replace(/(['"])([A-Za-z0-9][A-Za-z0-9-]*)\1/g, '').replace(/[\s,]/g, '') || new Set(ids).size !== ids.length) {
    throw new Error(`src/lib/catalogue.ts: ${variable} must contain unique literal public IDs only`);
  }
  return ids;
}

function scalar(value) {
  const text = value.trim();
  if (/^".*"$/.test(text)) return JSON.parse(text);
  if (/^'.*'$/.test(text)) return text.slice(1, -1).replaceAll("''", "'");
  if (!text || /^(?:[>|\[{]|null\b|~)/.test(text)) throw new Error('Artwork references must be single-line string keys');
  return text;
}

export function artworkReferences(source) {
  const frontmatter = normalizeSharedSource(source).match(/^---\n([\s\S]*?)\n---(?:\n|$)/)?.[1];
  if (frontmatter === undefined) throw new Error('Missing Markdown frontmatter');
  const references = [];
  for (const line of frontmatter.split('\n')) {
    const match = line.match(/^(cover|icon|image|wide-image|thumbnail-img|cover-img):\s*(.*)$/)
      ?? line.match(/^\s+-\s+(image):\s*(.*)$/);
    if (!match) continue;
    references.push({ field: match[1], key: scalar(match[2]), registry: ['thumbnail-img', 'cover-img'].includes(match[1]) ? 'legacyArtwork' : 'artwork' });
  }
  return references;
}

export function parseArtworkRegistry(source) {
  const imports = new Map([...source.matchAll(/^import\s+([A-Za-z_$][\w$]*)\s+from\s+(['"])([^'"\n]+)\2\s*;?$/gm)].map(match => [match[1], match[3]]));
  const registries = {};
  for (const name of ['artwork', 'legacyArtwork']) {
    const body = source.match(new RegExp(`(?:export\\s+)?const\\s+${name}(?:\\s*:[^=]+)?\\s*=\\s*\\{([^}]*)\\}`))?.[1];
    if (body === undefined) throw new Error(`src/lib/art.ts: ${name} registry is missing`);
    const entries = new Map();
    for (const entry of body.split(',').map(value => value.trim()).filter(Boolean)) {
      const match = entry.match(/^(?:(['"])(.*?)\1|([A-Za-z_$][\w$]*))(?:\s*:\s*([A-Za-z_$][\w$]*))?$/);
      if (!match) throw new Error(`src/lib/art.ts: ${name} must use static imported artwork entries`);
      const key = match[2] ?? match[3];
      if (entries.has(key)) throw new Error(`src/lib/art.ts: duplicate ${name} key`);
      entries.set(key, match[4] ?? match[3]);
    }
    registries[name] = entries;
  }
  return { imports, ...registries };
}

export function resolveArtworkReference(parsed, reference) {
  const imported = parsed[reference.registry]?.get(reference.key);
  const path = parsed.imports.get(imported);
  if (!path) throw new Error(`src/lib/art.ts: ${reference.registry}[${reference.key}] does not resolve to an imported image`);
  if (!path.startsWith('.') || path.includes('\\')) throw new Error('src/lib/art.ts: artwork must resolve to a relative local import');
  const resolved = posix.normalize(posix.join('src/lib', path));
  if (resolved.startsWith('../') || !/\.(?:png|jpe?g|webp|avif|gif|svg)$/i.test(resolved)) throw new Error('src/lib/art.ts: artwork must stay inside its own repository');
  return resolved;
}

export const sameArtworkBytes = (left, right) => createHash('sha256').update(left).digest('hex') === createHash('sha256').update(right).digest('hex');

export function normalizedHtmlText(html) {
  const entities = { amp: '&', quot: '"', apos: "'", nbsp: ' ', rsquo: "'", lsquo: "'", lt: '<', gt: '>' };
  return html.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|nbsp|rsquo|lsquo|lt|gt);/gi, (all, value) => {
      if (!value.startsWith('#')) return entities[value.toLowerCase()];
      const point = value[1].toLowerCase() === 'x' ? parseInt(value.slice(2), 16) : Number(value.slice(1));
      return point <= 0x10ffff ? String.fromCodePoint(point) : all;
    }).replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
}

function attribute(tag, name) {
  return tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'))?.[2];
}

function hasType(value, type) {
  return value?.['@type'] === type || (Array.isArray(value?.['@type']) && value['@type'].includes(type));
}

export function validateOrganizationHtml(html, brand) {
  const issues = [];
  const objects = [];
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    if (hasType(value, 'Organization')) objects.push(value);
    for (const child of Object.values(value)) if (typeof child === 'object') Array.isArray(child) ? child.forEach(visit) : visit(child);
  };
  for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (attribute(script[1], 'type') !== 'application/ld+json') continue;
    try { visit(JSON.parse(script[2])); } catch { issues.push('Invalid JSON-LD'); }
  }
  const own = objects.filter(value => value['@id'] === `${brand.url}#organization`);
  if (own.length !== 1) return [...issues, `Expected exactly one ${brand.name} organization with its own @id`];
  const organization = own[0];
  for (const key of ['name', 'url', 'email']) if (organization[key] !== brand[key]) issues.push(`Organization ${key} must be ${brand[key]}`);
  if (!hasType(organization.founder, 'Person') || organization.founder.name !== 'Storm Eckhart') issues.push('Organization founder must be Person Storm Eckhart');
  if (brand.label !== 'SS') {
    const parent = organization.parentOrganization;
    if (!hasType(parent, 'Organization') || parent['@id'] !== 'https://simplyshaped.fr/#organization' || parent.name !== 'SimplyShaped' || parent.url !== 'https://simplyshaped.fr/') issues.push('parentOrganization must link to SimplyShaped and https://simplyshaped.fr/#organization');
  } else {
    const brands = Array.isArray(organization.brand) ? organization.brand : [];
    for (const child of sharedBrands.filter(value => value.label !== 'SS')) {
      const matches = brands.filter(value => value.name === child.name && value.url === child.url);
      if (matches.length !== 1) issues.push(`Organization brand must include ${child.name} at ${child.url}`);
    }
  }
  return issues;
}

export function validateFamilyHtml(html, site) {
  const cardClass = site === 'SS' ? 'family-member' : 'family-site-link';
  const roleClass = site === 'SS' ? 'family-role' : 'family-site-role';
  const cards = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)]
    .filter(match => attribute(match[1], 'class')?.split(/\s+/).includes(cardClass));
  const issues = [];
  if (cards.length !== 3) issues.push('Website family must contain exactly three member cards');
  for (const brand of sharedBrands) {
    // Preserve the SSS reader's language; identity/canonical URLs stay unchanged.
    const href = site === 'SSS' && brand.label === 'SSS' ? `${brand.url}en` : brand.url;
    const matches = cards.filter(match => attribute(match[1], 'href') === href);
    if (matches.length !== 1) { issues.push(`Website family must have one ${brand.name} link to ${href}`); continue; }
    const body = matches[0][2];
    const name = body.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/i)?.[1];
    if (normalizedHtmlText(name ?? '') !== brand.name) issues.push(`${brand.name}: family name differs`);
    const paragraphs = [...body.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/gi)];
    const role = paragraphs.find(match => attribute(match[1], 'class')?.split(/\s+/).includes(roleClass));
    if (normalizedHtmlText(role?.[2] ?? '') !== normalizedHtmlText(brand.role)) issues.push(`${brand.name}: family role differs`);
    if (!paragraphs.some(match => normalizedHtmlText(match[2]) === normalizedHtmlText(brand.description))) issues.push(`${brand.name}: family description differs`);
  }
  return issues;
}

async function readScoped(root, path, label, issues, binary = false) {
  const location = resolve(root, path);
  const within = relative(root, location);
  if (within.startsWith('..') || isAbsolute(within)) throw new Error('Scoped path escapes repository');
  try { return await readFile(location, binary ? undefined : 'utf8'); }
  catch (error) { issues.push(`${label}:${path}: ${error.code === 'ENOENT' ? 'missing file (build the site first for dist files)' : 'cannot read file'}`); return null; }
}

export async function verifySharedReferences({ games, portfolio, sites }) {
  const roots = { SSG: resolve(games), SS: resolve(portfolio), SSS: resolve(sites) };
  if (new Set(Object.values(roots)).size !== 3) throw new Error('Games, portfolio and Sites must be three distinct repository roots');
  for (const [label, root] of Object.entries(roots)) {
    try { if (!(await stat(root)).isDirectory()) throw new Error(); }
    catch { throw new Error(`${label}: expected an existing readable repository directory`); }
  }
  const issues = [];
  const counts = { projects: 0, posts: 0, artwork: 0, policies: 0, organizations: 0, families: 0 };
  const source = await readScoped(roots.SSG, 'src/lib/catalogue.ts', 'SSG', issues);
  if (source === null) return { issues, counts };
  const projects = explicitPublicIds(source, 'gameProjectIds');
  const posts = explicitPublicIds(source, 'gamePostIds');
  const maps = {};
  for (const label of ['SSG', 'SS']) {
    const art = await readScoped(roots[label], 'src/lib/art.ts', label, issues);
    if (art !== null) try { maps[label] = parseArtworkRegistry(art); } catch (error) { issues.push(`${label}:${error.message}`); }
  }
  const checkedArtwork = new Set();
  for (const [kind, ids, directory] of [['projects', projects, 'src/content/projects'], ['posts', posts, '_posts']]) {
    for (const id of ids) {
      const path = `${directory}/${id}.md`;
      const left = await readScoped(roots.SSG, path, 'SSG', issues);
      const right = await readScoped(roots.SS, path, 'SS', issues);
      if (left === null || right === null) continue;
      counts[kind]++;
      const line = firstDifferentLine(left, right);
      if (line !== null) issues.push(`SSG:${path} ↔ SS:${path}: shared source differs at line ${line}`);
      if (!maps.SSG || !maps.SS) continue;
      let references;
      try { references = [...artworkReferences(left), ...artworkReferences(right)]; }
      catch (error) { issues.push(`${path}: ${error.message}`); continue; }
      for (const reference of references) {
        const key = `${reference.registry}:${reference.key}`;
        if (checkedArtwork.has(key)) continue;
        checkedArtwork.add(key);
        const paths = {};
        for (const label of ['SSG', 'SS']) try { paths[label] = resolveArtworkReference(maps[label], reference); } catch (error) { issues.push(`${label}:${path}: ${error.message}`); }
        if (!paths.SSG || !paths.SS) continue;
        const a = await readScoped(roots.SSG, paths.SSG, 'SSG', issues, true);
        const b = await readScoped(roots.SS, paths.SS, 'SS', issues, true);
        if (a === null || b === null) continue;
        counts.artwork++;
        if (!sameArtworkBytes(a, b)) issues.push(`SSG:${paths.SSG} ↔ SS:${paths.SS}: shared artwork bytes differ (${key})`);
      }
    }
  }
  const policyGames = await readScoped(roots.SSG, 'privacypolicy.md', 'SSG', issues);
  const policyPortfolio = await readScoped(roots.SS, 'privacypolicy.md', 'SS', issues);
  if (policyGames !== null && policyPortfolio !== null) {
    try {
      const line = firstDifferentLine(gamePolicyTail(policyGames), gamePolicyTail(policyPortfolio));
      counts.policies++;
      if (line !== null) issues.push(`SSG:privacypolicy.md ↔ SS:privacypolicy.md: original game policy differs at policy line ${line} (website-specific introductions may differ)`);
    } catch (error) { issues.push(error.message); }
  }
  const extraAssets = [
    ...['320', '640'].flatMap(size => ['SS', 'SSS'].map(label => ['SSG', `public/portraits/storm-eckhart-smiling-2026-${size}.webp`, label, `public/portraits/storm-eckhart-smiling-2026-${size}.webp`])),
    ['SS', 'src/assets/projects/gymboree-website.png', 'SSS', 'public/images/gymboree-geneva.png'],
  ];
  for (const [leftLabel, leftPath, rightLabel, rightPath] of extraAssets) {
    const a = await readScoped(roots[leftLabel], leftPath, leftLabel, issues, true);
    const b = await readScoped(roots[rightLabel], rightPath, rightLabel, issues, true);
    if (a === null || b === null) continue;
    counts.artwork++;
    if (!sameArtworkBytes(a, b)) issues.push(`${leftLabel}:${leftPath} ↔ ${rightLabel}:${rightPath}: shared artwork bytes differ`);
  }
  for (const brand of sharedBrands) {
    const path = brand.label === 'SSS' ? 'dist/client/index.html' : 'dist/index.html';
    const html = await readScoped(roots[brand.label], path, brand.label, issues);
    if (html === null) continue;
    counts.organizations++;
    issues.push(...validateOrganizationHtml(html, brand).map(issue => `${brand.label}:${path}: ${issue}`));
  }
  for (const [label, path] of [['SS', 'dist/projects/simplyshapedgames-website/index.html'], ['SSS', 'dist/client/en/realisations.html']]) {
    const html = await readScoped(roots[label], path, label, issues);
    if (html === null) continue;
    counts.families++;
    issues.push(...validateFamilyHtml(html, label).map(issue => `${label}:${path}: ${issue}`));
  }
  return { issues, counts };
}

export function parseArguments(args) {
  const options = { games: resolve(dirname(fileURLToPath(import.meta.url)), '..') };
  const seen = new Set();
  for (let index = 0; index < args.length; index++) {
    const name = args[index];
    if (!['--games', '--portfolio', '--sites'].includes(name) || !args[index + 1] || args[index + 1].startsWith('--')) throw new Error('Usage: node scripts/verify-shared-references.mjs [--games <SSG root>] --portfolio <SS root> --sites <SSS root>');
    const key = name.slice(2);
    if (seen.has(key)) throw new Error(`Duplicate ${name}`);
    seen.add(key);
    options[key] = resolve(args[++index]);
  }
  if (!options.portfolio || !options.sites) throw new Error('Explicit --portfolio and --sites repository paths are required; build all three sites before this local-only check');
  return options;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { issues, counts } = await verifySharedReferences(parseArguments(process.argv.slice(2)));
    console.log(`Shared-reference check: ${counts.projects} projects, ${counts.posts} journal posts, ${counts.artwork} artwork comparisons, ${counts.policies} shared game policies, ${counts.organizations} organizations, ${counts.families} website-family packs.`);
    if (issues.length) { for (const issue of issues) console.error(`- ${issue}`); process.exitCode = 1; }
    else console.log('All checked shared references agree. Separate branding, site layouts and translated copy remain independent. Local builds only; this does not verify publication.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
