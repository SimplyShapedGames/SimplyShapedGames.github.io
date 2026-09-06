import { readdir, readFile } from 'node:fs/promises';
import { resolve, basename, extname } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import sharp from 'sharp';

async function optionalFiles(directory) {
  try {
    return (await Promise.all((await readdir(directory, { withFileTypes: true })).map(entry => entry.isDirectory() ? optionalFiles(resolve(directory, entry.name)) : resolve(directory, entry.name)))).flat();
  } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}
export async function privateProjectIds() {
  return (await optionalFiles('.private/projects')).filter(file => file.endsWith('.md')).map(file => basename(file, '.md'));
}
export async function verifyPrivacy() {
  const hiddenSources = (await optionalFiles('.private/projects')).filter(file => file.endsWith('.md'));
  const privateTerms = new Set(await privateProjectIds());
  for (const file of hiddenSources) {
    const source = await readFile(file, 'utf8');
    const title = source.match(/^title: (.+)$/m)?.[1].trim().replace(/^['"]|['"]$/g, '');
    if (title) privateTerms.add(title.toLowerCase());
  }
  const privateAssets = (await optionalFiles('.private/art')).map(file => basename(file, extname(file)).toLowerCase());
  const outputFiles = await optionalFiles('dist');
  assert(outputFiles.length > 0, 'Build output is missing');
  for (const file of outputFiles) {
    const filename = basename(file).toLowerCase();
    assert(!privateAssets.some(name => filename.startsWith(name + '.')), `Private artwork remains in build: ${filename}`);
    if (!/\.(html|css|js|mjs|json|xml|txt)$/i.test(file)) continue;
    const text = (await readFile(file, 'utf8')).toLowerCase();
    for (const term of privateTerms) assert(!text.includes(term.toLowerCase()), `Private project reference remains in ${file}`);
    if (file.endsWith('.html')) {
      assert(!text.includes('in development'), `Unannounced work remains in ${file}`);
      assert(!/<h2[^>]*>taking shape/.test(text), `Work-in-progress section remains in ${file}`);
    }
  }
  const flyerAssets = [
    resolve('src/assets/projects/gallery/gymboree-reopening-flyer.png'),
    resolve('src/assets/projects/gymboree-reopening-flyer-banner.png'),
    resolve('src/assets/projects/gymboree-reopening-flyer-square.png'),
  ];
  for (const file of flyerAssets) {
    const metadata = await sharp(file).metadata();
    assert(!metadata.exif && !metadata.xmp && !metadata.iptc, `Private authoring metadata remains in ${file}`);
  }
  const flyerPixels = await sharp(flyerAssets[0]).raw().toBuffer();
  assert.equal(createHash('sha256').update(flyerPixels).digest('hex'), '0877e230004bf5006818a1ddd1fd12c0f0750813e4a15a7f814d162d89140153', 'Public reopening flyer pixels differ from the supplied artwork');
  console.log(`Privacy verified: no development entries in generated pages; ${hiddenSources.length} local private projects and ${privateAssets.length} private artwork names checked against output.`);
}
