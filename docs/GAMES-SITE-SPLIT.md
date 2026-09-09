# SimplyShapedGames services site — staged 9 September 2026

## Scope

This is the new games-and-mods activity site at simplyshapedgames.fr. The full creative portfolio belongs at simplyshaped.fr; website services belong at simplyshapedsites.fr. This staging work does not change the live site or any hosting/account settings.

The homepage uses the four coordinated ImageGen section references in the sibling design directory: hero v2, services v1, work v1, quote v1. The public site uses original logo and game assets; none of the generated game approximations is shipped. Actual landscape proportions and 1:1 catalogue images intentionally correct the generator's frame inaccuracies.

## Implemented surface

- Four-section service homepage: playable-project introduction, three open service rows, games/mods catalogue, project-specific quote/process.
- Shared existing SSG logo, service navigation, accessible light/dark switch, responsive expandable navigation, and cross-brand footer.
- All/Games/Mods filters with real selected state and announcements; non-JavaScript category links remain available.
- About story: Storm's 2017 start, released games and mods, and SimplyShaped/SimplyShapedGames/SimplyShapedSites roles.
- Contact page with an optional browser-only brief builder. It constructs an encoded mailto draft; it never submits to a backend or claims to send a message. Users review and send in their own email app.
- Five released project pages and six original game/mod posts. Original store/download links, Android package IDs, wide detail artwork, square previews and retained journal URLs are unchanged.
- Thirty exact, permanent Cloudflare redirects for non-game project/category/post URLs, preserved unchanged in public/_redirects. The build appends twelve explicit lowercase-to-canonical aliases for the six retained game posts, for Windows-built Direct Upload compatibility. No wildcard or game-policy redirects.

No fixed price/package, invented metrics, guarantees, client names, unsupported capability claims, or private/development projects are advertised.

## Content and safety contracts

The runtime allowlists are in src/lib/catalogue.ts. Independently asserted routes and original-source SHA-256 values are in scripts/site-contract.mjs.

The original app-ads.txt and privacypolicy.md are byte-for-byte unchanged. Existing icon/manifest/schema metadata remains appropriate for the games brand; Organization schema links the SimplyShaped parent.

Contact address remains the established stormeckhart@simplyshapedgames.fr. Publication operator must verify mail delivery/account ownership separately; a valid mailto link is not proof of inbox operation.

## Checks completed

- Astro check: 23 files, zero errors/warnings/hints.
- Behavioral/regression tests: 17/17 passing, including filter state, mobile navigation, mailto encoding, validation, no-send messaging, search and theme.
- Static build: 27 routes; five project pages, three gallery images, six original posts, 733 checked local links/assets.
- Square previews: 30 image slots, 19 responsive assets.
- Privacy exclusions: five private projects and 139 private artwork names, using the original private-reference folder.
- Served preview: 19 pages and 21 image responses; catalogue All/Games/Mods counts 5/3/2.

Current dedicated local preview: http://127.0.0.1:4328/ (PID 35292 when started).

## Validation boundaries and remaining work

Main agent owns browser visual review against all four section concepts (desktop/mobile, light/dark), any final responsive polish, and hosting setup. These static/served checks do not establish visual sign-off or successful external mail delivery.

Astro preview intentionally does not serve or execute Cloudflare's _redirects manifest. The exact packaged manifest was verified on disk; actual redirect behavior requires the Cloudflare preview/deployment.

No account creation, purchases, deployment changes, commits, pushes or publication were performed in this subtask. SSS-equivalent manual Cloudflare Pages support is now staged; see [CLOUDFLARE-PAGES.md](CLOUDFLARE-PAGES.md). The workflow packages checked static files without deployment rights. The site privacy wrapper discloses Cloudflare/browser-only enquiry handling while the original game-policy source remains hash-identical. The main agent must verify the deployed result before a completion claim.

## Existing-dependency commands

From this staging directory, use the already installed ancestor dependencies, without an install:

    node ../../../node_modules/astro/bin/astro.mjs check
    node --test scripts/test-interactions.mjs scripts/test-preview.mjs scripts/test-cloudflare-pages.mjs
    node ../../../node_modules/astro/bin/astro.mjs build
    node scripts/verify-build.mjs
    node scripts/cloudflare-pages.mjs verify
    node scripts/cloudflare-pages.mjs package

For the privacy reference audit set SS_PRIVATE_REFERENCE_ROOT to the original checkout's .private folder itself, not its repository root. Do not leave the original audit reporting zero reference projects when those reference files are accessible.

One attempted pnpm check invoked the environment's automatic dependency-install behavior; it was stopped immediately, with zero downloaded/added packages. Use the explicit existing-node commands above for this staged snapshot.
