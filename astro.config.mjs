import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { mergePagesRedirects } from './scripts/cloudflare-pages.mjs';
import { publicGamePosts, verifyRedirects } from './scripts/site-contract.mjs';

// Keep the legacy URLs for advertising verification and shared article images.
function preservePublicFiles() {
  return {
    name: 'ssg-preserve-public-files',
    hooks: {
      'astro:config:setup': async () => {
        // The same legacy asset URLs must also work in the local preview.
        const publicDir = new URL('./public/', import.meta.url);
        await mkdir(new URL('assets/img/', publicDir), { recursive: true });
        await cp(new URL('./assets/img/', import.meta.url), new URL('assets/img/', publicDir), { recursive: true });
        for (const file of ['app-ads.txt', 'CNAME']) {
          await cp(new URL(`./${file}`, import.meta.url), new URL(file, publicDir));
        }
      },
      'astro:build:done': async ({ dir }) => {
        await mkdir(new URL('assets/img/', dir), { recursive: true });
        await cp(new URL('./assets/img/', import.meta.url), new URL('assets/img/', dir), { recursive: true });
        for (const file of ['app-ads.txt', 'CNAME']) {
          await cp(new URL(`./${file}`, import.meta.url), new URL(file, dir));
        }
        // Preserve the extension-style addresses used by the previous theme.
        for (const page of ['aboutme', 'privacypolicy', 'tags']) {
          await cp(new URL(`${page}/index.html`, dir), new URL(`${page}.html`, dir));
        }
        // Preserve all 30 scoped non-game migrations, then add local aliases
        // for retained journal routes that differ only by case on Windows.
        await verifyRedirects();
        const migrations = await readFile(new URL('./public/_redirects', import.meta.url), 'utf8');
        await writeFile(new URL('_redirects', dir), mergePagesRedirects(migrations, await publicGamePosts()));
      }
    }
  };
}

export default defineConfig({
  site: 'https://simplyshapedgames.fr',
  output: 'static',
  trailingSlash: 'always',
  integrations: [sitemap({ filter: page => !/\/\d{4}-\d{2}-\d{2}-ssg-/.test(page) }), preservePublicFiles()],
  devToolbar: { enabled: false }
});
