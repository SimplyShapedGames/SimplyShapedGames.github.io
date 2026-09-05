import { readdir, readFile } from 'node:fs/promises';
import { resolve, basename, extname } from 'node:path';
import assert from 'node:assert/strict';

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
  console.log(`Privacy verified: no development entries in generated pages; ${hiddenSources.length} local private projects and ${privateAssets.length} private artwork names checked against output.`);
}
