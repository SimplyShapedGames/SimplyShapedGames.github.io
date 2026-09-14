import test from 'node:test';
import assert from 'node:assert/strict';
import {
  artworkReferences, explicitPublicIds, firstDifferentLine, gamePolicyTail, normalizeSharedSource,
  normalizedHtmlText, parseArguments, parseArtworkRegistry, resolveArtworkReference,
  sameArtworkBytes, sharedBrands, validateFamilyHtml, validateOrganizationHtml,
} from './verify-shared-references.mjs';

const registry = `
import witch from '../assets/projects/witch.png';
import witchIcon from '../assets/projects/witch-icon.jpg';
import sitting from '../assets/projects/gallery/sitting.png';
export const artwork: Record<string, ImageMetadata> = { witch, witchIcon, witchPlayback: sitting };
const legacyArtwork: Record<string, ImageMetadata> = { '/assets/old-witch.png': witch };
`;
const frontmatter = `---
title: The Witch Who Laughs
cover: witch
icon: witchIcon
gallery:
  - image: witchPlayback
    alt: Sitting Witch
---
Text with image: notARegistryReference
`;

function organizationFor(brand) {
  return {
    '@context': 'https://schema.org', '@type': 'Organization', '@id': `${brand.url}#organization`,
    name: brand.name, url: brand.url, email: brand.email,
    founder: { '@type': 'Person', name: 'Storm Eckhart' },
    ...(brand.label === 'SS'
      ? { brand: sharedBrands.filter(item => item.label !== 'SS').map(item => ({ '@type': 'Brand', name: item.name, url: item.url })) }
      : { parentOrganization: { '@type': 'Organization', '@id': 'https://simplyshaped.fr/#organization', name: 'SimplyShaped', url: 'https://simplyshaped.fr/' } }),
  };
}
const jsonLd = object => `<script type="application/ld+json">${JSON.stringify(object)}</script>`;
const familyHtml = site => sharedBrands.map(brand => `<a class="${site === 'SS' ? 'family-member' : 'family-site-link'}" href="${site === 'SSS' && brand.label === 'SSS' ? `${brand.url}en` : brand.url}">
  <h3>${brand.name}</h3><p class="${site === 'SS' ? 'family-role' : 'family-site-role'}">${brand.role.replaceAll('&', '&amp;')}</p><p>${brand.description.replaceAll('’', '&#x27;')}</p>
  </a>`).join('');

test('shared Markdown normalization accepts only CRLF and trailing horizontal whitespace', () => {
  assert.equal(normalizeSharedSource('one  \r\n  two\t\r\n'), 'one\n  two\n');
  assert.equal(firstDifferentLine('one\n  two\n', 'one\r\n  two  \r\n'), null);
  assert.equal(firstDifferentLine('one\n two\n', 'one\ntwo\n'), 2);
  assert.equal(firstDifferentLine('one\n', 'one'), 2);
  assert.equal(firstDifferentLine('Her cries.', 'Her laughter.'), 1);
});

test('frontmatter and the complete body both participate in drift detection', () => {
  assert.equal(firstDifferentLine(frontmatter, frontmatter.replace('title: The Witch Who Laughs', 'title: Witch')), 2);
  assert.equal(firstDifferentLine(frontmatter, frontmatter.replace('Text with image:', 'Changed body:')), 9);
});

test('game policies match while website-specific privacy introductions stay independent', () => {
  const original = '*Last updated: September 5, 2026*\n\nGame policy terms.\n';
  assert.equal(gamePolicyTail('Games website introduction.\n' + original), gamePolicyTail('Portfolio website introduction.\n' + original));
  assert.notEqual(gamePolicyTail(original), gamePolicyTail(original.replace('terms', 'changed terms')));
  assert.throws(() => gamePolicyTail('No game policy marker'), /exactly one/);
  assert.throws(() => gamePolicyTail(original + original), /exactly one/);
});

test('public IDs come only from explicit literal allowlists', () => {
  const source = "export const gameProjectIds = ['shapedash', 'the-witch-who-laughs'] as const;\nexport const gamePostIds = ['2026-09-02-SSG-Witch-Audio-Update'] as const;";
  assert.deepEqual(explicitPublicIds(source, 'gameProjectIds'), ['shapedash', 'the-witch-who-laughs']);
  assert.deepEqual(explicitPublicIds(source, 'gamePostIds'), ['2026-09-02-SSG-Witch-Audio-Update']);
  assert.throws(() => explicitPublicIds("export const gameProjectIds = ['witch', ...privateProjects]", 'gameProjectIds'), /literal public IDs/);
  assert.throws(() => explicitPublicIds("export const gameProjectIds = ['witch', 'witch']", 'gameProjectIds'), /unique literal/);
  assert.throws(() => explicitPublicIds("export const gameProjectIds = ['../secret']", 'gameProjectIds'), /literal public IDs/);
  assert.throws(() => explicitPublicIds('', 'gamePostIds'), /missing explicit/);
});

test('artwork references include covers, square icons and gallery artwork, but not body prose', () => {
  assert.deepEqual(artworkReferences(frontmatter), [
    { field: 'cover', key: 'witch', registry: 'artwork' },
    { field: 'icon', key: 'witchIcon', registry: 'artwork' },
    { field: 'image', key: 'witchPlayback', registry: 'artwork' },
  ]);
  assert.throws(() => artworkReferences('No frontmatter'), /Missing Markdown frontmatter/);
  assert.throws(() => artworkReferences('---\nimage: |\n  dynamic\n---'), /single-line/);
});

test('modern and legacy journal fields resolve through their respective maps', () => {
  const references = artworkReferences('---\nimage: "witchIcon"\nwide-image: witch\nthumbnail-img: \'/assets/old-witch.png\'\ncover-img: /assets/old-witch.png\n---\n');
  assert.deepEqual(references.map(item => item.registry), ['artwork', 'artwork', 'legacyArtwork', 'legacyArtwork']);
  const parsed = parseArtworkRegistry(registry);
  assert.equal(resolveArtworkReference(parsed, references[1]), 'src/assets/projects/witch.png');
  assert.equal(resolveArtworkReference(parsed, references[2]), 'src/assets/projects/witch.png');
  assert.equal(resolveArtworkReference(parsed, artworkReferences(frontmatter)[2]), 'src/assets/projects/gallery/sitting.png');
});

test('registry parser supports CRLF and fails closed for unsupported/dynamic mappings', () => {
  assert.equal(parseArtworkRegistry(registry.replaceAll('\n', '\r\n')).artwork.get('witch'), 'witch');
  assert.throws(() => parseArtworkRegistry(registry.replace('witch, witchIcon,', '...secretMap, witchIcon,')), /static imported/);
  assert.throws(() => parseArtworkRegistry(registry.replace('witch, witchIcon,', 'witch, witch,')), /duplicate/);
  assert.throws(() => parseArtworkRegistry(''), /registry is missing/);
});

test('resolving an artwork key cannot silently ignore missing or external images', () => {
  const parsed = parseArtworkRegistry(registry);
  assert.throws(() => resolveArtworkReference(parsed, { key: 'missing', registry: 'artwork' }), /does not resolve/);
  parsed.imports.set('witch', 'https://example.com/witch.png');
  assert.throws(() => resolveArtworkReference(parsed, { key: 'witch', registry: 'artwork' }), /relative local/);
  parsed.imports.set('witch', '../../../private.png');
  assert.throws(() => resolveArtworkReference(parsed, { key: 'witch', registry: 'artwork' }), /inside its own repository/);
});

test('identical registry keys are insufficient when actual artwork bytes differ', () => {
  assert(sameArtworkBytes(Buffer.from([1, 2, 3]), Buffer.from([1, 2, 3])));
  assert(!sameArtworkBytes(Buffer.from([1, 2, 3]), Buffer.from([1, 2, 4])));
});

test('HTML comparison decodes browser-visible entities and typographic apostrophes', () => {
  assert.equal(normalizedHtmlText('<p>Games &amp; mods&#160;— project&rsquo;s needs.</p>'), "Games & mods — project's needs.");
  assert.equal(normalizedHtmlText('project&#x27;s <!-- hydration -->needs'), "project's needs");
});

test('all three organization schemas retain correct distinct identities and family links', () => {
  for (const brand of sharedBrands) assert.deepEqual(validateOrganizationHtml(jsonLd(organizationFor(brand)), brand), []);
  const games = sharedBrands.find(item => item.label === 'SSG');
  const organization = organizationFor(games);
  organization.email = 'stormeckhart@simplyshaped.fr';
  organization.parentOrganization['@id'] = 'https://wrong.example/#organization';
  delete organization.founder;
  const issues = validateOrganizationHtml(jsonLd(organization), games);
  assert(issues.some(issue => issue.includes('email')));
  assert(issues.some(issue => issue.includes('parentOrganization')));
  assert(issues.some(issue => issue.includes('founder')));
});

test('missing, duplicated or invalid structured data fails the check', () => {
  const brand = sharedBrands[0];
  assert.match(validateOrganizationHtml('', brand)[0], /exactly one/);
  assert(validateOrganizationHtml('<script type="application/ld+json">broken</script>', brand).includes('Invalid JSON-LD'));
  assert(validateOrganizationHtml(jsonLd(organizationFor(brand)).repeat(2), brand).some(issue => issue.includes('exactly one')));
  const organization = organizationFor(brand);
  organization.brand[0].url = 'https://simplyshaped.fr/';
  assert(validateOrganizationHtml(jsonLd(organization), brand).some(issue => issue.includes('Organization brand')));
});

test('JSON-LD graph envelopes are supported without treating a child parent as the own brand', () => {
  const brand = sharedBrands[2];
  assert.deepEqual(validateOrganizationHtml(jsonLd({ '@graph': [organizationFor(brand)] }), brand), []);
});

test('family roles and descriptions match on SS and the English SSS page', () => {
  for (const site of ['SS', 'SSS']) assert.deepEqual(validateFamilyHtml(familyHtml(site), site), []);
  assert(validateFamilyHtml(familyHtml('SSS').replace('https://simplyshapedsites.fr/en', 'https://simplyshapedsites.fr/'), 'SSS').some(issue => issue.includes('link to https://simplyshapedsites.fr/en')));
});

test('family membership, names, roles and descriptions cannot silently drift', () => {
  const source = familyHtml('SSS');
  assert(validateFamilyHtml(source.replace('The shared portfolio', 'A client site'), 'SSS').some(issue => issue.includes('role differs')));
  assert(validateFamilyHtml(source.replace('Website design and development for businesses and independent professionals.', 'A fixed price for every site.'), 'SSS').some(issue => issue.includes('description differs')));
  assert(validateFamilyHtml(source.replace('<h3>SimplyShapedGames</h3>', '<h3>Games</h3>'), 'SSS').some(issue => issue.includes('name differs')));
  assert(validateFamilyHtml(source.replace('href="https://simplyshapedgames.fr/"', 'href="https://simplyshaped.fr/"'), 'SSS').some(issue => issue.includes('one SimplyShapedGames link')));
  assert(validateFamilyHtml(source + source, 'SSS').some(issue => issue.includes('exactly three')));
});

test('the local checker requires explicit independent portfolio and Sites paths', () => {
  const args = parseArguments(['--portfolio', './portfolio', '--sites', './sites']);
  assert(args.games && args.portfolio && args.sites);
  assert.throws(() => parseArguments([]), /Explicit --portfolio/);
  assert.throws(() => parseArguments(['--portfolio', '--sites']), /Usage/);
  assert.throws(() => parseArguments(['--publish']), /Usage/);
  assert.throws(() => parseArguments(['--portfolio', './one', '--portfolio', './two', '--sites', './sites']), /Duplicate/);
});
