import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import sharp from 'sharp';

// Exercise the actual inline/client scripts with small, deterministic interface
// doubles. These tests do not launch a browser or make visual claims.
const layout = await readFile('src/layouts/SiteLayout.astro', 'utf8');
const headScript = layout.match(/<script is:inline>([\s\S]*?)<\/script>/)[1];
const themeScript = ts.transpileModule(layout.match(/<script>([\s\S]*?)<\/script>/)[1], { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
const searchSource = await readFile('src/pages/search.astro','utf8');
const searchScript = ts.transpileModule(searchSource.match(/<script>([\s\S]*?)<\/script>/)[1], { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
function element() {
  return { hidden: true, content:'', textContent:'', value:'', dataset:{}, attributes:{}, events:{},
    setAttribute(name,value) { this.attributes[name] = value; },
    addEventListener(name,callback) { this.events[name] = callback; }
  };
}
function themeContext({ saved, dark = false, unavailable = false } = {}) {
  const values = new Map(saved ? [['ssg-theme',saved]] : []);
  const button = element(); const meta = element(); const media = element(); media.matches = dark;
  const html = { dataset:{} };
  const localStorage = {
    getItem(key) { if (unavailable) throw new Error('Storage blocked'); return values.get(key) || null; },
    setItem(key,value) { if (unavailable) throw new Error('Storage blocked'); values.set(key,value); }
  };
  const context = { document: { documentElement:html, querySelector: selector => selector === '.theme-toggle' ? button : meta }, localStorage, matchMedia: () => media };
  runInNewContext(headScript, context); runInNewContext(themeScript, context);
  return { values, button, meta, media, html, context };
}
test('theme starts from the system preference, revealing an accessible switch', () => {
  const t = themeContext({ dark:true });
  assert.equal(t.html.dataset.theme,'dark'); assert.equal(t.button.hidden,false);
  assert.equal(t.button.attributes['aria-label'],'Switch to light mode'); assert.equal(t.meta.content,'#121212');
});
test('theme toggles both ways and persists across page loads', () => {
  const t = themeContext(); t.button.events.click();
  assert.equal(t.html.dataset.theme,'dark'); assert.equal(t.values.get('ssg-theme'),'dark');
  assert.equal(themeContext({saved:t.values.get('ssg-theme')}).html.dataset.theme,'dark');
  t.button.events.click(); assert.equal(t.html.dataset.theme,'light'); assert.equal(t.meta.content,'#ffffff');
});
test('an explicit preference wins over system changes', () => {
  const t = themeContext({ saved:'light',dark:true }); t.media.events.change();
  assert.equal(t.html.dataset.theme,'light'); assert.equal(t.button.attributes['aria-label'],'Switch to dark mode');
});
test('an unsaved preference follows system changes', () => {
  const t = themeContext(); t.media.matches=true; t.media.events.change(); assert.equal(t.html.dataset.theme,'dark');
});
test('theme remains usable when storage is blocked', () => {
  const t = themeContext({unavailable:true}); t.button.events.click(); assert.equal(t.html.dataset.theme,'dark');
});
test('About collage uses the shared grey surface and text colour in both themes', async () => {
  const about = await readFile('src/pages/aboutme.astro', 'utf8');
  const css = await readFile('src/styles/portfolio-refresh.css', 'utf8');
  const site = await readFile('src/styles/site.css', 'utf8');
  const pages = await readFile('src/styles/pages.css', 'utf8');
  assert.match(about, /import collage from ['"]\.\.\/assets\/projects\/about-collage-transparent\.png['"]/);
  assert.match(about, /class="collage-artwork" src=\{collage\}/);
  assert.doesNotMatch(about, /collage-light|collage-dark/);
  // Check the style contract, not browser rendering: all panels use --surface,
  // and the root theme controls both this background and the headline colour.
  const rules = new Map([...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, declarations]) => [selector.replace(/\/\*[\s\S]*?\*\//g, '').trim(), declarations]));
  assert.match(rules.get('.about-art.about-collage'), /background:var\(--surface\);/);
  assert.match(rules.get('.about-art.about-collage>span'), /color:var\(--ink\);/);
  assert.match(pages, /\.journal-image\{[^}]*background:var\(--surface\)/);
  assert.match(site, /:root\{[^}]*--surface:#f5f5f1;/);
  assert.match(site, /:root\[data-theme=dark\]\{[^}]*--surface:#1d1d1b;/);
  assert(![...rules.keys()].some(selector => selector.includes('data-theme') && selector.includes('about-collage')), 'Do not override the shared collage colours for a theme');
});
test('About collage has real transparency with no opaque lower background', async () => {
  const file = 'src/assets/projects/about-collage-transparent.png';
  const metadata = await sharp(file).metadata();
  assert.equal(metadata.hasAlpha, true);
  assert.equal(metadata.width, 1122); assert.equal(metadata.height, 1402);
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject:true });
  const alpha = (x, y) => data[(y * info.width + x) * info.channels + 3];
  for (const [x, y] of [[0, 0], [1121, 0], [0, 1401], [1121, 1401], [548, 200], [10, 500]]) assert.equal(alpha(x,y), 0, `Opaque background at ${x},${y}`);
  for (let y=1050; y<info.height; y++) for (let x=0; x<info.width; x++) assert.equal(alpha(x,y), 0, 'The headline backdrop must be transparent');
});
test('original game stories retain their dates, artwork and Android links without the repeated announcement template', async () => {
  const originals = [
    ['2020-06-16-SSG-Published-Slide', 'slide', 'Slide_'],
    ['2026-03-18-SSG-Published-PiecePerfect', 'pieceperfect', 'PiecePerfect'],
    ['2026-08-17-SSG-Published-ShapeDash', 'shapedash', 'ShapeDash'],
  ];
  const titles = new Set(), subtitles = new Set();
  for (const [id, project, app] of originals) {
    const source = await readFile(`_posts/${id}.md`, 'utf8');
    titles.add(source.match(/^title: (.+)$/m)?.[1]);
    subtitles.add(source.match(/^subtitle: (.+)$/m)?.[1]);
    assert(source.includes(`related_projects: [${project}]`));
    assert(source.includes(`/projects/${project}/`));
    assert(source.includes(`https://play.google.com/store/apps/details?id=com.SimplyShapedGames.${app}`));
    assert.match(source, /^thumbnail-img: \/assets\/img\/.+\.png$/m);
    assert.doesNotMatch(source, /Another game published|New game published|don't hesitate to check|Have a great day|\biOS\b|App\s*Store/i);
  }
  assert.equal(titles.size, 3); assert.equal(subtitles.size, 3);
  assert(!titles.has(undefined) && !subtitles.has(undefined));
});
function searchContext(query = '') {
  const form=element(), input=element(), count=element(), empty=element();
  const entries=['shapedash a colourful runner game android unity released','create copycat expansion mod minecraft neoforge released','gymboree geneva website web wordpress ongoing maintenance'].map(text => ({...element(), dataset:{search:text}}));
  const elements={'.search-form':form,'#site-search':input,'.search-count':count,'.search-empty':empty};
  const location={href:`https://simplyshapedgames.fr/search/${query}`,search:query};
  let replaced;
  runInNewContext(searchScript,{document:{querySelector:s=>elements[s],querySelectorAll:()=>entries},location,history:{replaceState:(_a,_b,url)=>{replaced=url.toString();}},URL,URLSearchParams});
  return {form,input,count,empty,entries,getUrl:()=>replaced};
}
test('search matches multiple words irrespective of case', () => {
  const s=searchContext(); s.input.value='MINECRAFT mod'; s.input.events.input();
  assert.equal(s.count.textContent,'1 result'); assert.equal(s.entries[1].hidden,false); assert.equal(s.entries[0].hidden,true);
});
test('search handles no results and clearing the query', () => {
  const s=searchContext('?q=missing'); assert.equal(s.count.textContent,'0 results'); assert.equal(s.empty.hidden,false);
  s.input.value=''; s.input.events.input(); assert.equal(s.count.textContent,'3 results'); assert.equal(s.empty.hidden,true);
});
test('search supports bookmarked queries and explicit URL updates', () => {
  const s=searchContext('?q=Android'); assert.equal(s.count.textContent,'1 result');
  s.input.value='Geneva'; let prevented=false; s.form.events.submit({preventDefault(){prevented=true;}});
  assert(prevented); assert.equal(s.getUrl(),'https://simplyshapedgames.fr/search/?q=Geneva');
  s.input.value=''; s.form.events.submit({preventDefault(){}}); assert.equal(s.getUrl(),'https://simplyshapedgames.fr/search/');
});
