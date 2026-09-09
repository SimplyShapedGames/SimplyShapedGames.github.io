# SimplyShapedGames — Cloudflare Pages cutover

This is an implementation/checklist, not a deployment receipt. No command below changes an account, DNS record or production website unless the separate manual upload/cutover is explicitly performed.

## Intended provider mapping

Match the related SimplyShapedSites task's confirmed setup: **manual Cloudflare Pages Direct Upload**, Squarespace registrar, Cloudflare authoritative DNS, and GitHub as source storage rather than the public host. SSS uses the Pages project `simplyshapedsites`, no Git connection/automatic workflow, and both apex/www custom domains with HTTPS, apex canonical and no www redirect. Its latest handoff superseded the earlier parked-domain response; verify current live state again before copying account settings.

For Games:

- Public domain remains `simplyshapedgames.fr`; add/retain www as a separate Pages custom domain, with the same apex canonical and no www redirect.
- Source destination remains the existing `SimplyShapedGames/SimplyShapedGames.github.io` repository, under the user's Games identity associated with `stormeckhart.games@gmail.com`. Verify the actual authenticated GitHub owner/session and desired private-source visibility before writing. Do not change repository visibility or disable the old live deployment before the replacement is verified.
- The new **Games Cloudflare Pages account/project identifier and zone mapping are not yet verified**. Do not reuse the Sites/parent project or invent IDs. Registrar remains Squarespace; this is not a Workers application, GitHub Pages deployment or OpenAI Sites deployment.
- The parent portfolio at `simplyshaped.fr` must work before enabling the Games migration redirects. SimplyShapedSites remains separate and unchanged.

## Produce a checked static upload

For a normally installed checkout with Node 24 and pnpm 11.19.0:

```text
pnpm check
pnpm test
pnpm build
pnpm package:cloudflare
```

In this staged Windows snapshot, avoid the environment's automatic pnpm install fallback and use the existing ancestor dependencies instead:

```text
node ../../../node_modules/astro/bin/astro.mjs check
node --test scripts/test-interactions.mjs scripts/test-preview.mjs scripts/test-cloudflare-pages.mjs
node ../../../node_modules/astro/bin/astro.mjs build
node scripts/verify-build.mjs
node scripts/cloudflare-pages.mjs verify
node scripts/cloudflare-pages.mjs package
```

Set `SS_PRIVATE_REFERENCE_ROOT` to the original checkout's `.private` directory for the private-reference audit. Do not copy private assets into the staged source or upload.

Packaging creates a new `validation/cloudflare-pages/release-*/site/` folder. Upload **only the site folder**. Keep the adjacent `release-manifest.json` privately for its per-file SHA-256 values and rollback evidence. The script checks the complete static output, refuses symlinks/private source/runtime files, preserves previous releases and verifies copied bytes. It enforces Cloudflare dashboard Direct Upload's current 1,000-file and 25 MiB-per-file limits rather than silently dropping artwork.

The **Website checks and Cloudflare Pages package** workflow also offers a ZIP named `simplyshapedgames-cloudflare-pages-<commit>`. It contains the public output at its root, including `_headers`, `_redirects`, `404.html`, `.nojekyll`, images and other static files. No `dist` wrapper or source repository is needed. Only use the artifact from the reviewed successful run. The workflow has read-only permissions and no deployment credential/job.

Dashboard Direct Upload accepts a folder or ZIP. Direct Upload cannot later be switched to Git integration on that same Pages project, so confirm that intentional SSS parity before creating it. [Cloudflare Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/).

## Preserved Games contracts

- All five approved game/mod projects and six retained journal posts stay on the Games domain, with their artwork, store/download links and package IDs.
- `public/_redirects` retains the **original thirty** non-game project/category/post redirects byte-for-byte. The build appends **twelve** lowercase-to-original-case game-post aliases to `dist/_redirects`. Exact output checks prevent omissions, collisions or accidental cross-domain redirection of retained posts. No catch-all, www, privacy or app-ads redirect is introduced.
- `privacypolicy.md` remains byte-identical with SHA-256 `44fe362eeee849b99113e3312507b20570010cfa810a030b66a54adf9e2728f0`.
- `app-ads.txt` remains byte-identical with SHA-256 `4d4c70ca753db3b3dd48c0ceadc258cf901e591163241d33d401f79cf24ce85b`.
- `/privacypolicy/`, `/privacypolicy.html`, `#request-user-data-deletion`, `/app-ads.txt`, RSS and legacy image URLs continue locally. A separate section in the privacy page wrapper describes website hosting and the browser-only email-draft workflow without editing the game-service policy source.
- Ordinary custom-domain pages remain indexable. Both standard and branch/hash `pages.dev` addresses get noindex, with the SSS security-header baseline. Existing robots, canonical metadata, sitemap and real custom 404 are preserved. Noindex is not access control; only approved public material may be uploaded.

## Cutover checklist

1. Record the actual Games GitHub owner/repository, Cloudflare account/new Pages project, production branch, zone, Squarespace domain and current live host. Save the old source/deployment and DNS export for rollback; no broad deletion, repository transfer or visibility change.
2. In the correct account, choose **Pages Direct Upload**, not Workers. Upload the checked artifact to a preview first. Record the exact URL and deployment identifier. Do not infer success from a generic HTTP 200 or a placeholder.
3. Inspect actual SSG content, desktop/mobile layouts, themes, navigation, filters (5 All / 3 Games / 2 Mods), project pages, six game stories, contact draft creation and privacy/data deletion. Verify the draft is not sent automatically and the contact address has a separate delivery test.
4. On the Cloudflare preview, verify 404 status for an absent path, security and noindex response headers, each lower-case game-post alias, all thirty parent migration routes, assets and canonical URLs. Astro's local preview does not execute Cloudflare routing rules. [Cloudflare headers](https://developers.cloudflare.com/pages/configuration/headers/) and [route/404 behavior](https://developers.cloudflare.com/pages/configuration/serving-pages/).
5. Confirm all parent redirect destinations already work at `simplyshaped.fr`. Keep the old Games host available while publishing the verified artifact to the correct Pages production project.
6. Before changing DNS authority, export every record and preserve MX, SPF, DKIM, DMARC, service/ownership TXT and CNAME, CAA and relevant DNSSEC/DS configuration. Use the exact nameservers assigned to the Games zone, not a guessed copy of SSS's pair. Coordinate DNSSEC so the authority change does not break resolution.
7. Add apex and www to this exact Games Pages project's Custom domains. Follow its verified targets and certificate state before replacing only conflicting web/parking records. Keep registrar and all mail services. [Cloudflare custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/).
8. Verify apex/www serve the real approved Games site over valid HTTPS, canonical uses the Games apex, ordinary pages do not inherit noindex, and Pages previews still do. Keep SSS-equivalent no-www-redirect behavior and normal caching defaults; do not add unrelated Worker, cache or security rules.
9. Verify live `/app-ads.txt` byte-for-byte, both privacy URL forms and deletion anchor, all five projects, all six canonical/lowercase stories, RSS, static images, all thirty parent routes and a genuine 404. Check the parent/Sites family links and actual email receipt separately. Then confirm the coordinated source replacement with the owner.
10. Retain the former working deployment and DNS values until checks are complete. If website, certificates, routes or mail regress, stop further switches and restore only the recorded web mapping or prior deployment. Do not remove the domains, source repositories or historical evidence.

## Mail and verification limits

The established Games contact is `stormeckhart@simplyshapedgames.fr`; its syntax and mailto behavior do not prove inbox operation. Preserve this domain's own mail records, not a copy of SSS's records. SSS's known forwarding uses Squarespace/Mailgun, not Cloudflare Email Routing, and its actual receipt remained unconfirmed in the related task. Do not advertise new aliases or claim mail testing from configuration alone.

These source/build checks do not establish account ownership, actual Cloudflare deployment behavior, browser sign-off or email delivery. No account IDs or API secrets are included. Public-hosting completion requires the checks above on the actual custom domain.
