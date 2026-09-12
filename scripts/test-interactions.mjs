import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { publicGameProjects, publicGamePosts, verifyRedirects, verifyPreservedGameSources } from './site-contract.mjs';

// Exercise the actual inline/client scripts with small, deterministic interface
// doubles. These tests do not launch a browser or make visual claims.
const layout = await readFile('src/layouts/SiteLayout.astro', 'utf8');
const headScript = layout.match(/<script is:inline>([\s\S]*?)<\/script>/)[1];
const themeScript = ts.transpileModule(layout.match(/<script>([\s\S]*?)<\/script>/)[1], { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
const searchSource = await readFile('src/pages/search.astro','utf8');
const searchScript = ts.transpileModule(searchSource.match(/<script>([\s\S]*?)<\/script>/)[1], { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
test('Games uses the exact family prefix and badge with a clean matching suffix mask', async () => {
  assert(layout.includes('class="brand brand-lockup"'));
  for(const name of ['brand-mark','brand-wordmark-prefix','brand-wordmark-suffix']) assert(layout.includes(`class="${name}"`));
  const prefixFile=await readFile('public/brand/simplyshaped-wordmark.png');
  assert.equal(createHash('sha256').update(prefixFile).digest('hex'),'63abae33c0b7310114cf201c1a5dac0c04a594aa8166d05a5f01d51c80ad33e3');
  const prefix=await sharp(prefixFile).ensureAlpha().raw().toBuffer();
  const combined=await sharp('public/brand/simplyshapedgames-wordmark.png').extract({left:0,top:0,width:1278,height:263}).ensureAlpha().raw().toBuffer();
  assert(prefix.equals(combined),'No generated or replacement font may change the common SimplyShaped letters');
  const suffix=await sharp('public/brand/games-wordmark-suffix.png').ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(suffix.info.width,545);assert.equal(suffix.info.height,263);
  let antialias=0;
  for(let y=0;y<263;y++) for(let x=0;x<545;x++) {
    const i=(y*545+x)*4,alpha=suffix.data[i+3];
    if(alpha>0 && alpha<255)antialias++;
    assert.equal(suffix.data[i]+suffix.data[i+1]+suffix.data[i+2],0,'Mask RGB must contain no checker/grey residue');
    if(y<9 || y>=192 || x<4 || x>=539)assert.equal(alpha,0,'No checkerboard may survive around the Games lettering');
  }
  assert(antialias>100,'Preserve antialiased edges');
  const mark=await readFile('public/brand/brand-lockup-mark.svg','utf8');
  assert(mark.includes('viewBox="0 0 80 80"') && mark.includes('x="4" y="4" width="72" height="72" rx="19"'));
  assert(mark.includes('<circle cx="27" cy="27" r="10" fill="#000000"/>'));
  assert(mark.includes('<rect x="43" y="17" width="20" height="20" rx="4" fill="#000000"/>'));
  const brandCss=await readFile('src/styles/brand-lockup.css','utf8');
  assert(brandCss.includes('color:var(--coral)') && brandCss.includes('gap:6px'));
  assert(brandCss.includes('width:54px;height:54px') && brandCss.includes('font-size:2.19rem'));
  for(const [viewport,size,font]of[[1150,46,1.86],[850,42,1.7],[620,32,1.3],[370,26,1.06]])assert(brandCss.includes(`@media(max-width:${viewport}px){.brand-lockup .brand-mark{width:${size}px;height:${size}px}.brand-lockup .brand-wordmark{font-size:${font}rem}}`));
});
test('Games active icons and standalone logo consistently use the coral family badge', async () => {
  const mark=await readFile('public/brand/brand-lockup-mark.svg');
  assert(mark.equals(await readFile('public/brand/simplyshapedgames-mark.svg')));
  assert(mark.equals(await readFile('public/favicon.svg')));
  assert(layout.includes('type="image/svg+xml" sizes="any" href="/favicon.svg"'));
  for(const [file,size]of[['favicon-96x96.png',96],['apple-touch-icon.png',180],['web-app-manifest-192x192.png',192],['web-app-manifest-512x512.png',512]]) {
    const actual=await sharp(`public/${file}`).raw().toBuffer();
    const expected=await sharp(mark).resize(size,size).flatten({background:'#fff'}).raw().toBuffer();
    assert(actual.equals(expected),`${file} must use the same coral badge`);
  }
  const combined=await sharp('public/brand/simplyshapedgames-wordmark.png').extractChannel(3).raw().toBuffer();
  const full=await sharp('public/brand/simplyshapedgames-logo.png').extract({left:450,top:72,width:1823,height:263}).extractChannel(3).raw().toBuffer();
  assert(combined.equals(full),'Standalone logo must preserve wordmark alpha while applying coral');
});
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
test('Games About identifies the founder, history and connected activities', async () => {
  const about = await readFile('src/pages/aboutme.astro', 'utf8');
  assert(about.includes('Storm') && about.includes('2017'));
  assert(about.includes('https://simplyshaped.fr/') && about.includes('https://simplyshapedsites.fr/'));
  assert(about.includes('SimplyShapedGames') && about.includes('SimplyShapedSites'));
  assert.doesNotMatch(about, /collage-artwork/, 'The wider parent-portfolio collage must not be passed off as a Games-only showcase');
});

test('the split preserves the five public games/mods, six game posts, game policy and advertising file', async () => {
  assert.equal((await publicGameProjects()).length, 5);
  assert.equal((await publicGamePosts()).length, 6);
  await verifyPreservedGameSources();
  assert.equal((await verifyRedirects()).size, 30);
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
test('Witch previews use the square Workshop image and retain wide article artwork', async () => {
  const artSource = await readFile('src/lib/art.ts', 'utf8');
  const artwork = {};
  for (const key of ['witchIcon', 'witch', 'witchPlayback']) {
    const asset = artSource.match(new RegExp(`import ${key} from ['"]([^'"]+)['"]`))?.[1];
    assert(asset, `Missing ${key} artwork import`);
    artwork[key] = await sharp(await readFile(new URL(asset, new URL('../src/lib/art.ts', import.meta.url)))).metadata();
  }
  assert.equal(artwork.witchIcon.width, artwork.witchIcon.height);
  const context = { artwork, legacyArtwork: {} };
  const selectors = artSource.slice(artSource.indexOf('export function closestArtwork')).replaceAll('export function', 'function');
  runInNewContext(ts.transpileModule(selectors, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText, context);
  const frontmatter = source => Object.fromEntries([...source.split('---')[1].matchAll(/^([\w-]+): (.+)$/gm)].map(([, key, value]) => [key, value.trim()]));
  for (const [file, wide] of [['2025-08-31-SSG-The-Witch-Who-Laughs', 'witch'], ['2026-09-02-SSG-Witch-Audio-Update', 'witchPlayback']]) {
    const data = frontmatter(await readFile(`_posts/${file}.md`, 'utf8'));
    assert.equal(context.journalArtwork(data, 1), artwork.witchIcon);
    assert.equal(context.journalArtwork(data, 1.875), artwork[wide]);
  }
  const project = frontmatter(await readFile('src/content/projects/the-witch-who-laughs.md', 'utf8'));
  assert.equal(context.projectArtwork(project, 1), artwork.witchIcon);
  assert.equal(context.projectArtwork(project, 16 / 9), artwork.witch);
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

const transpileClient = body => ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;

test('work filters show all five projects or the exact games/mods subset with accessible state', async () => {
  const source = await readFile('src/components/Catalogue.astro', 'utf8');
  const script = transpileClient(source.match(/<script>([\s\S]*?)<\/script>/)[1]);
  const controls = element(), status = element();
  const buttons = ['all', 'games', 'mods'].map(workFilter => ({ ...element(), dataset: { workFilter } }));
  controls.querySelectorAll = () => buttons;
  const entries = ['games', 'games', 'games', 'mods', 'mods'].map(workItem => ({ ...element(), hidden: false, dataset: { workItem } }));
  const groups = ['games', 'mods'].map(workGroup => ({ ...element(), hidden: false, dataset: { workGroup } }));
  const catalogue = {
    querySelector: selector => selector === '.work-filters[hidden]' ? controls : status,
    querySelectorAll: selector => selector === '[data-work-item]' ? entries : groups,
  };
  runInNewContext(script, { document: { querySelectorAll: () => [catalogue] } });
  assert.equal(controls.hidden, false);
  for (const [filter, expected] of [['mods', 2], ['games', 3], ['all', 5]]) {
    const clicked = buttons.find(button => button.dataset.workFilter === filter);
    clicked.events.click();
    assert.equal(entries.filter(entry => !entry.hidden).length, expected);
    assert(entries.every(entry => entry.hidden === (filter !== 'all' && entry.dataset.workItem !== filter)));
    assert(groups.every(group => group.hidden === (filter !== 'all' && group.dataset.workGroup !== filter)));
    assert.equal(status.textContent, `${expected} projects shown`);
    assert(buttons.every(button => button.attributes['aria-pressed'] === String(button === clicked)));
  }
  assert(source.includes('<noscript>') && source.includes('href="/games/"') && source.includes('href="/mods/"'), 'No-JavaScript category navigation must remain available');
});

async function briefContext(values = {}, valid = true) {
  const source = await readFile('src/pages/contact.astro', 'utf8');
  const script = transpileClient(source.match(/<script>([\s\S]*?)<\/script>/)[1]);
  const form = element(), mail = { href: 'mailto:stormeckhart@simplyshapedgames.fr' }, status = element(), result = element();
  const inputs = Object.fromEntries(['project-name', 'project-type', 'project-scope', 'project-platforms', 'project-timing', 'project-budget'].map(id => [id, { value: values[id] || '' }]));
  form.reportValidity = () => valid;
  form.querySelector = selector => selector === '[data-brief-email]' ? mail : selector === '[data-brief-status]' ? status : selector === '.draft-result' ? result : inputs[selector.slice(1)];
  runInNewContext(script, { document: { querySelector: () => form }, encodeURIComponent });
  return { form, mail, status, result, inputs };
}

test('project brief prepares an encoded email draft without sending or navigating', async () => {
  const brief = await briefContext({ 'project-name': 'A&B — prototype?', 'project-type': 'Mods & extensions', 'project-scope': 'Add a mechanic\nKeep existing saves.', 'project-platforms': 'Minecraft', 'project-timing': 'Flexible', 'project-budget': 'Discuss scope' });
  assert.equal(brief.form.hidden, false);
  let prevented = false;
  brief.form.events.submit({ preventDefault() { prevented = true; } });
  assert(prevented);
  const draft = new URL(brief.mail.href);
  assert.equal(draft.protocol, 'mailto:');
  assert.equal(draft.pathname, 'stormeckhart@simplyshapedgames.fr');
  assert.equal(draft.searchParams.get('subject'), 'Project enquiry: A&B — prototype?');
  const body = draft.searchParams.get('body');
  for (const value of ['Mods & extensions', 'Add a mechanic\nKeep existing saves.', 'Minecraft', 'Flexible', 'Discuss scope']) assert(body.includes(value));
  assert.equal(brief.result.hidden, false);
  assert.match(brief.status.textContent, /No message has been sent/);
});

test('brief validation blocks empty scope and optional fields have honest defaults', async () => {
  const invalid = await briefContext({}, false);
  invalid.form.events.submit({ preventDefault() {} });
  assert.equal(invalid.mail.href, 'mailto:stormeckhart@simplyshapedgames.fr');
  assert.equal(invalid.result.hidden, true);
  const minimal = await briefContext({ 'project-type': 'Game development', 'project-scope': 'A small prototype' });
  minimal.form.events.submit({ preventDefault() {} });
  const draft = new URL(minimal.mail.href);
  assert.equal(draft.searchParams.get('subject'), 'Game or mod project enquiry');
  assert(draft.searchParams.get('body').includes('To be discussed'));
  assert(!draft.searchParams.get('body').includes('500'));
});

test('mobile navigation opens and closes through links, Escape and desktop resize', () => {
  const script = transpileClient([...layout.matchAll(/<script>([\s\S]*?)<\/script>/g)][1][1]);
  const classList = () => { const values = new Set(); return { add: value => values.add(value), remove: value => values.delete(value), toggle: (value, active) => active ? values.add(value) : values.delete(value), contains: value => values.has(value) }; };
  const menu = { ...element(), getAttribute(name) { return this.attributes[name]; }, focus() { this.focused = true; } };
  menu.attributes['aria-expanded'] = 'false';
  const links = [element(), element()];
  const nav = { classList: classList(), querySelectorAll: () => links };
  const root = { classList: classList() }, events = {}, media = element();
  runInNewContext(script, { document: { documentElement: root, querySelector: selector => selector === '.menu-toggle' ? menu : nav, addEventListener: (name, callback) => { events[name] = callback; } }, matchMedia: () => media });
  assert.equal(menu.hidden, false);
  assert(root.classList.contains('navigation-enhanced'));
  menu.events.click();
  assert.equal(menu.attributes['aria-expanded'], 'true');
  assert(nav.classList.contains('is-open'));
  links[0].events.click();
  assert.equal(menu.attributes['aria-expanded'], 'false');
  menu.events.click(); events.keydown({ key: 'Escape' });
  assert.equal(menu.attributes['aria-expanded'], 'false'); assert(menu.focused);
  menu.events.click(); media.events.change({ matches: true });
  assert.equal(menu.attributes['aria-expanded'], 'false'); assert(!nav.classList.contains('is-open'));
});
