# SimplyShapedGames website

The redesigned site is an Astro static game-development services website for Cloudflare Pages. It uses the original Games logo and artwork, self-hosted Fredoka/Nunito fonts, light/dark themes and Markdown content. No backend, database, paid hosting or external font request is needed. The current Games-only catalogue and migration boundaries are specified in [GAMES-SITE-SPLIT.md](GAMES-SITE-SPLIT.md); wider portfolio-editing notes below are historical context, not permission to add non-game content back to this activity site.

## Work locally

Use Node.js 24 and pnpm 11.19.0 (pinned in package.json).

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm check
pnpm test
pnpm build
```

The build creates `dist/`; the build check validates local links, game/mod coverage, retained post URLs, RSS, policy anchors, fonts, CNAME and the unchanged app-ads.txt/game-policy sources. It also verifies the exact merged migration redirects, Cloudflare security/preview headers, canonical, robots, custom 404 and dashboard upload limits. It is not a browser or external-service availability test.

With the local server running, also run `pnpm verify:preview` (default `http://127.0.0.1:4321/`). This separately checks actual served category counts, every project, gallery counts, journal, search entries, privacy content, RSS and image responses. A successful build or HTTP 200 alone does not prove the live preview has loaded its collections. For a different local port, run `node scripts/verify-preview.mjs http://127.0.0.1:PORT/`.

If collections are first added while Astro 7.3.1 is already running, fully stop and restart the dev process. Its hot restart can leave the content layer uninitialized, showing zero creations despite a complete build. For a background server use `pnpm exec astro dev stop`, then `pnpm dev --background`. The regression test simulates that empty HTTP 200 response to ensure the live check rejects it. No application-content workaround is needed after a full restart.

## Add a creation

Copy an entry in `src/content/projects/` to a new slug-named Markdown file. Its filename becomes `/projects/your-slug/`. Required fields are title, category, status, summary, role and order. Categories: `games`, `mods`, `websites`, `design`. Statuses: `Released`, `In development`, `Ongoing maintenance`, `Completed`.

Optional fields: platforms, technologies, cover, icon, imageNote, gallery, links, related, featured and published. Keep unpublished ideas and their artwork outside the public source folders, in the ignored `.private/` folder. `published: false` and `In development` are excluded from every page and search, but hiding a record alone is not sufficient privacy if its source is committed to a public repository. Use `featured: true` for the three lead game-icon cards. The Markdown below the metadata becomes the project description.

Store approved public artwork in `src/assets/projects/` and import it with a short key in `src/lib/art.ts`. Set the entry's `cover` to that key, and `icon` to the original square icon when available. The image selector chooses the closest available proportions. Website covers are real page screenshots without device frames; do not substitute generated screenshots or artwork for the real site. Never import private draft assets into this shared artwork map.

For a gallery, add `gallery` entries with an `image` key from `src/lib/art.ts`, descriptive `alt` text and an accurate `caption`. Screenshots, concept images and 3D renders must be distinguished in the caption. The site generates appropriately sized WebP previews and larger views automatically; no browser script or carousel is required. Gallery counts and local image links are checked during the build.

The About collage uses `src/assets/projects/about-collage-transparent.png`: an alpha cutout of the existing artwork, not a regenerated composition. Its container uses the same `--surface` token as journal previews (#f5f5f1 in light mode, #1d1d1b in dark mode); the overlaid headline uses `--ink`. Keep its background transparent instead of baking a theme colour into the image. The earlier opaque variants remain as source references.

Each published entry automatically appears on the home page, its category, search and its own detail page. Keep related IDs valid. Sort order is numeric and shared across the site.

## Journal and existing URLs

Keep adding posts to `_posts/YYYY-MM-DD-Title.md`. The three original Android game posts keep their dated filenames and URLs; their titles, subtitles and copy were rewritten on 5 September 2026 to match the journal's editorial voice. Slide's unavailable iOS listing is no longer advertised. `related_projects` links posts to project slugs. The journal, tags and RSS are generated from those files.

Retained game posts use original-case canonical URLs. Linux can generate both case variants; Windows may store only one physical directory. Cloudflare `_redirects` therefore appends twelve explicit lowercase-to-canonical rules for the six retained posts, keeping Windows-built uploads compatible. The thirty existing non-game redirects to SimplyShaped remain unchanged. No game privacy or advertising redirect is permitted.

`/aboutme/`, `/privacypolicy/`, `/tags/`, their `.html` aliases, `/feed.xml`, `/app-ads.txt`, `/assets/img/*` and the custom domain are retained. The root privacy policy remains the source; its opening game examples now list released titles only, with the terms otherwise unchanged. The domain and advertising file remain root sources and are copied without modification. Generated copies in `public/` are ignored by Git.

The old Jekyll theme sources are retained as migration reference; Astro builds only `src/`, the selected content collections and `public/`. Do not edit the old layouts for new site changes. Its LICENSE remains in place.

The old Jekyll RSS template is preserved at `docs/legacy/feed.xml`. Leaving it at the repository root makes Vite serve that unprocessed template instead of the Astro `/feed.xml` endpoint during development.

## Publish when approved

The intended provider setup matches SimplyShapedSites: GitHub source, Cloudflare Pages Direct Upload, Squarespace domain registration and Cloudflare DNS. The existing SimplyShapedGames/SimplyShapedGames.github.io repository remains the intended Games source destination. Do not publish this replacement through its old GitHub Pages workflow or replace the live site before the coordinated cutover.

The updated workflow checks and produces a downloadable `simplyshapedgames-cloudflare-pages-<commit>` ZIP of the public `dist/` output only. It has read-only repository permissions and no deployment job, API token or account binding. Local `pnpm package:cloudflare` reruns complete output checks and creates a byte-verified `validation/cloudflare-pages/release-*/site/` folder plus a separate private manifest. Upload only the `site` folder or the checked CI artifact, never the source checkout.

Follow [the Cloudflare Pages cutover guide](CLOUDFLARE-PAGES.md). Preview the new Games site first, verify the SimplyShaped parent is live for all thirty non-game migration destinations, preserve DNS mail records and rollback evidence, then change only the verified domain mappings. Retained CNAME/.nojekyll files are compatibility artifacts, not Cloudflare configuration.

No account, repository setting, source visibility, DNS record or public deployment is changed by these scripts.
