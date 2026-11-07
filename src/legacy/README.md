# Schplitz 1

The original two-person app is kept here for existing users and old links. It is served at `/classic/`, and at `/` when `VITE_V2_AT_ROOT` is not `true`. The entry point is `main.jsx`; the root entry point also loads `App.jsx` in the default build.

Keep storage keys, old link formats, encryption parameters, and answer normalization compatible. Schplitz 2 imports the old link utilities through `src/v2/migrate.js`; its migration tests generate fixtures with this implementation.

Currency definitions and identity rules live in `src/shared/`. `utils.js` re-exports them for the original app. New application features belong in `src/v2/`.

Run the original app's tests with `npm test -- src/legacy`. `npm run check` includes those tests and both builds; `npm run e2e` also exercises old-link migration and the `/classic/` route.
