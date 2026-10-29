# Dossier landing page

The static page at https://dossier.victorc.dev: plain HTML, CSS and a little JavaScript for the copy buttons, with no build step. It runs as the `dossier-site` Worker (static assets only) on Victor's Cloudflare account, on the victorc.dev zone.

## Deploy

```sh
cd site
npm install
CLOUDFLARE_ACCOUNT_ID=41b9cba15d8fcd34204729b610670ac8 npx cf deploy
```

`cloudflare.config.ts` names the Worker and its custom domain; `wrangler.config.ts` makes this folder the assets directory, and `.assetsignore` keeps the tooling out of the upload. Check the result with `curl -sI https://dossier.victorc.dev`.

## Notes

- Below the hero, `media/dossier-demo.mp4` plays with sound when the visitor clicks Watch the demo; it never autoplays.
- `media/open-graph.jpg` is the 1200×630 link preview (Open Graph and Twitter), built from `media/dossier-screenshot.jpg`, the Example's Application page.
- Web Analytics comes from the victorc.dev zone's Cloudflare Web Analytics site, which injects its beacon on every host of the zone; filter by host `dossier.victorc.dev` in the dashboard.
- The fonts are copies of Dossier's `public/fonts/`, with their OFL licenses.
- `diagram-hub.html` (the hero) and `diagram-chat.html` (How it works) are the animated diagrams, embedded as iframes. Their logos in `media/logos/` come from Simple Icons (CC0).
