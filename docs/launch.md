# Launching Schplitz 2

Schplitz 2 has been running as a preview at `/v2/`. Launching moves it to `/`. It's a build setting, not a code change, so rolling back is a redeploy.

## What's where

| Path | Before launch | After launch |
|---|---|---|
| `/` | Schplitz 1 (landing page + app) | Schplitz 2 |
| `/v2/` | Schplitz 2 preview | Schplitz 2 (kept, because links shared during the preview point here) |
| `/classic/` | Schplitz 1 | Schplitz 1 (fallback, not indexed) |

All three are on one origin, so they share the phone's data: Schplitz 2 finds the Schplitz 1 tally on the phone, and Schplitz 1 still works at `/classic/` after launch.

Old Schplitz 1 links (`/#share=…`) in people's chats open in Schplitz 2 after launch. Schplitz 2 asks the answer and brings the tally in, or updates it (migration doc, step 5).

## The switch

`VITE_V2_AT_ROOT=true` at build time puts Schplitz 2 at `/` (`src/main.jsx`). Without it, `/` stays Schplitz 1. Vite replaces the flag at build time, so each build ships only one app at `/`.

On Vercel: Project → Settings → Environment Variables → add `VITE_V2_AT_ROOT` = `true` for **Production**, then redeploy. To try it first, add it for **Preview** only and open the branch's preview deployment.

## Before launch

- [ ] Real phones: run through `docs/v2.0.md` §4.1 "Verify on real devices", plus:
  - share sheet with a link and with a file (iPhone and Android)
  - scanning a QR code with the camera
  - *Install Schplitz* on Android
  - the backup reminder on Safari
- [ ] A v2 landing page at `/` (the current one describes Schplitz 1). Until then, people land straight in the app's home screen, which has a one-line intro.
- [ ] Update `index.html` meta and noscript text, and `public/llms.txt`, for Schplitz 2.
- [ ] Confirm the group "about even" rule (docs/v2.0.md §7).
- [ ] Run everything:
  ```
  npm test && npm run lint && npm run build
  npx vite preview --port 4173 &
  VITE_V2_AT_ROOT=true npx vite build --outDir dist-launch && npx vite preview --outDir dist-launch --port 4174 &
  npm run e2e && npm run e2e:launch
  ```

## Launch

1. Set `VITE_V2_AT_ROOT=true` for Production and redeploy.
2. Open `/`, `/v2/` and `/classic/`; open an old `#share=` link from a chat.

## Rolling back

Remove `VITE_V2_AT_ROOT` (or set it to anything but `true`) and redeploy. `/` is Schplitz 1 again.

- Data written in Schplitz 2 stays on phones and in links. It reappears when Schplitz 2 is back.
- Schplitz 1 never sees what was added in Schplitz 2. Its own data was never changed, apart from removing plain-text answers.

## After launch

- The installable app's manifest moves from `/v2/manifest.webmanifest` to `/manifest.webmanifest` (scope `/`). Anyone who installed the preview keeps a separate `/v2/` install that still works.
- Keep `/v2/` and `/classic/` for at least two years, like the v1 data (migration doc, step 6).
