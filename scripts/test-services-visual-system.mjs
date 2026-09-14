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
