import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
const source = async path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const css = await source('src/styles/services-interactions.css');

test('home displays the original Games identity and the exact approved PiecePerfect banner', async () => {
  const home = await source('src/pages/index.astro');
  const hero = await source('src/components/GamesHeroArtwork.astro');
  assert(home.includes('<GamesHeroArtwork />'));
  assert(hero.includes("import originalLogo from '../../assets/img/SSGLogo.png'"));
  const original = await readFile(new URL('../assets/img/SSGLogo.png', import.meta.url));
  assert.equal(createHash('sha256').update(original).digest('hex'), '438ff3537a5e4875cc84330bfafbe7f970826efa81c9450c5a0de2fdbd45c5d9');
  assert(hero.includes('src={originalLogo}'));
  assert(hero.includes('aspect-ratio: 1;'));
  assert(hero.includes('background: #fff;'), 'The opaque original must retain its clean white canvas in either theme');
  assert(hero.includes("import piecePerfectBanner from '../../assets/img/Sprite_GameFeature2.png'"));
  const banner = await readFile(new URL('../assets/img/Sprite_GameFeature2.png', import.meta.url));
  assert.equal(createHash('sha256').update(banner).digest('hex'), '5451941bf5515f0ca08ca47508e972918358967078726b19aea87659510b8242', 'Reuse the exact approved banner, not the old artwork or the cropped store feature graphic');
  const metadata = await sharp(banner).metadata();
  assert.deepEqual([metadata.width, metadata.height], [1750, 899]);
  assert(hero.includes('src={piecePerfectBanner}'));
  assert.deepEqual([...hero.matchAll(/\bhref="([^"]+)"/g)].map(match => match[1]), ['/projects/pieceperfect/'], 'The hero preview opens the matching PiecePerfect detail page');
  assert(hero.includes('alt="PiecePerfect: colourful puzzle pieces, a game board and a smiling robot companion"'));
  assert(hero.includes('<strong>PiecePerfect</strong><span>Unity · Android</span>'));
  assert(hero.includes('widths={[640, 1000, 1400, 1750]}'), 'Keep the responsive banner candidates within the native width');
  assert.doesNotMatch(hero, /shapedash/i, 'No stale ShapeDash artwork, label, alt text or destination in the hero only');
  assert(hero.includes('fetchpriority="high"'));
  assert(hero.includes('height: auto;'));
  assert(!hero.includes('object-fit: cover') && !hero.includes('overflow: hidden'), 'Do not crop the original logo or the game artwork');
  assert(hero.includes('@media (prefers-reduced-motion: reduce)'));
});

test('About reuses the exact approved Sites portrait with responsive native proportions', async () => {
  const portrait = await source('src/components/StormPortrait.astro');
  const about = await source('src/pages/aboutme.astro');
  assert(about.includes('<StormPortrait accent="var(--primary)" />'));
  assert(about.includes('<h2>It started<br /> with games.</h2>'), 'Keep a word separator when the mobile layout hides the line break');
  assert(about.includes('.story-layout > * { min-width: 0; }'), 'Portrait and prose must shrink below their intrinsic width');
  assert.match(about, /@media \(max-width: 900px\)\s*\{\s*\.story-layout \{ grid-template-columns: minmax\(0, 1fr\); \}/, 'The phone story grid must not use its contents as an automatic minimum width');
  assert(portrait.includes('alt="Storm Eckhart smiling outdoors, March 2026"'));
  assert(portrait.includes('width="640"') && portrait.includes('height="640"'));
  assert(portrait.includes('width: 100%; height: auto; aspect-ratio: 1'));
  for (const [size, expected] of [[320, '4fe4609f3033ecae83c06be4abbf850633b7deb9391efe990b1e12600ef26f3d'], [640, '9e64fdfded927bcd7d6b33d124358350fab27e91bdf44b21e60f953aa82d785f']]) {
    const file = `public/portraits/storm-eckhart-smiling-2026-${size}.webp`;
    const bytes = await readFile(file);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected, 'Reuse the approved real portrait without retouching');
    const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.width, size);
    assert.equal(metadata.height, size);
    assert(!metadata.exif && !metadata.xmp && !metadata.iptc, 'Do not publish private portrait metadata');
    assert(portrait.includes(`/portraits/storm-eckhart-smiling-2026-${size}.webp ${size}w`));
  }
});
test('Games owns the requested blue pair in both themes', () => {
  assert.match(css, /--primary: #3c82f6;/);
  assert.match(css, /--companion: #3068c5;/);
  assert.match(css, /--underlay: var\(--companion\)/);
  assert.doesNotMatch(css, /#ff615b|#ff7772|#cc4e4a/i);
});

test('small action text and link states retain AA contrast without changing the brand blue', () => {
  const luminance = hex => hex.replace('#', '').match(/../g).map(channel => parseInt(channel, 16) / 255).map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
  assert.match(css, /--on-action: #111;/);
  assert.match(css, /--link-ink: var\(--companion\);/);
  assert.match(css, /--link-ink: #80b0ff;/);
  for (const [foreground, background] of [['#111111', '#3c82f6'], ['#3068c5', '#ffffff'], ['#80b0ff', '#202020'], ['#80b0ff', '#292929']]) assert(contrast(foreground, background) >= 4.5, `${foreground} on ${background}`);
  assert.match(css, /width: 44px; height: 44px/);
});

test('service evidence and catalogue descriptions come from real released projects', async () => {
  const home = await source('src/pages/index.astro');
  const catalogue = await source('src/components/Catalogue.astro');
  assert.match(home, /Personal projects you can explore and play/);
  assert.match(home, /href: '\/projects\/copycat-expansion\/'/);
  assert.match(home, /href: '\/games\/'/);
  assert.match(home, /projects.filter\(project => project.data.category === 'games'\).length/);
  assert(catalogue.includes('{project.data.summary}'));
  assert(catalogue.includes('class="filter-count"'));
});
test('shared control contract preserves SSS pill, lift, press and stable fill', () => {
  for (const rule of ['border-radius: 999px', '0 3px 0 var(--underlay)', 'translateY(-4px)', '0 7px 0 var(--underlay)', 'translateY(1px)', '0 2px 0 var(--underlay)', 'transform .2s ease, box-shadow .2s ease', ':is(:hover, :focus-visible)', 'translate(2px, -2px)']) assert(css.includes(rule), rule);
});
test('theme switch remains still and reduced-motion removes positional effects', () => {
  assert.match(css, /\.theme-toggle:is\(:hover, :focus-visible\)[\s\S]*?transform: none/);
  const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert(reduced.includes('transform: none'));
  assert(reduced.includes('padding-left: 0'));
  assert(reduced.includes('scroll-behavior: auto !important'));
});
test('shared interactions load after legacy styling and all pages expose the same CTA', async () => {
  const layout = await source('src/layouts/SiteLayout.astro');
  assert(layout.indexOf("import '../styles/services-interactions.css'") > layout.indexOf("import '../styles/brand-lockup.css'"));
  assert.match(layout, /class="nav-contact" href="\/contact\/"/);
  const arrow = await source('src/components/Arrow.astro');
  assert(arrow.includes('M7 17 17 7M7 7h10v10'));
});
