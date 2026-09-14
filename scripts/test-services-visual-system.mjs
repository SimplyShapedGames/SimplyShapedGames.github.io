import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = async path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const css = await source('src/styles/services-interactions.css');
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
