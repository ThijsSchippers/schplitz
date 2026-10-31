# Schplitz v2

Schplitz 2 for pairs, served as a preview at `/v2/` next to Schplitz 1 (same site, so it can read v1 data).
The design is in [`docs/v2.0.md`](../../docs/v2.0.md) and [`docs/v2.0-migration.md`](../../docs/v2.0-migration.md).

```
npm run dev      # then open http://localhost:5173/v2/
npm run build    # builds Schplitz 1 (dist/index.html) and the preview (dist/v2/index.html)
```

## Modules

| File | What it does |
|---|---|
| `app.js` | What the screens do, without React: start, join, open links, record payments, share, convert v1. Saves after every change. |
| `cache.js` | The phone's cache (IndexedDB): tallies, keys (non-extractable), and phone-only state. Losing it costs convenience, never the tally. |
| `tally.js` | The tally: writers, entries, summaries, balances, disputes, merging a link. |
| `link.js` | Links: key derivation, the correction window, the size budget, encrypt/decrypt. |
| `migrate.js` | Bringing in v1 tallies: device storage, old links, deterministic IDs, rates. |
| `schema.js` | **Field reference** for entries, summaries and payloads, limits, validation, `SchplitzError`. |
| `encoding.js` | Hex, base64url, deflate with a size cap, minor units, day numbers. |
| `categories.js` | The category codes and their social units. Codes are permanent. |
| `ui/` | The React screens. `App.jsx` holds the screen state and wires actions to `app.js`. `format.js` (copy, money, whose turn) and `numpad.js` (amount entry) are pure and unit-tested. `icons.js` holds Material Symbols path data (Apache-2.0, see `material-symbols-LICENSE.txt`). |

## Core rules

- **One writer per device.** A writer only ever appends to its own log, so phones never edit the same thing.
- **Summaries carry the balance.** Every link carries every writer's running summary. Per writer, the highest sequence number wins, so links can be opened in any order, more than once, and old links can't roll anything back.
- **Money is integers** in minor units. `v` is always in the tally currency, with the exchange rate locked when the entry is written.
- **Corrections are entries too** (`edit`, `void`, `notme`, `query`, `resolve`, `recat`, `fresh`). A correction travels like any other change, however old the entry it corrects.
- **Converted v1 history is frozen.** It can be sorted (`recat`) and disputed, but not edited.

## Conventions

- **Functions mutate the tally in place.** Writes are queued per tally, so concurrent calls (rapid taps) are applied one after another. UI state should hold a version counter or a clone, not the tally object.
- **Errors are `SchplitzError` with a stable `code`** for the UI to map to a message:
  - input and permission: `invalid-input`, `not-allowed`, `not-found`;
  - links: `not-a-link`, `unsupported-version`, `cannot-decrypt`, `invalid-payload`, `too-large`.
- **Everything from a link is validated** (`schema.js → checkPayload`) before it touches a tally. Entry types from a newer app version are kept and ignored.
- **Days are whole days since 1970-01-01** in the phone's own calendar. An entry's `d` is the day it was written, and that day decides the correction window. A payment's own date is `pd` when it differs.

## Trust model

- **Anyone who knows the answer can produce links.** Summaries are trusted as received, because signing each writer's summary would not fit the 2,000-character link budget.
- **Forgery is detected, not prevented:**
  - a phone notices a forged summary for its own writer (`conflicts` in the merge report);
  - `verify()` notices any summary that doesn't match a complete log on the phone.
- **Details:** `docs/v2.0.md` §8.

## Tests

```
npm test -- src/v2      # unit tests
npm run lint            # ESLint, scoped to src/v2
```

| File | Covers |
|---|---|
| `test/v2.test.js` | Tally behaviour, links, the window, disputes. |
| `test/migrate.test.js` | v1 conversion. Fixtures are produced with the real v1 code in `src/utils.js`. |
| `test/hardening.test.js` | Validation, hostile links, concurrency, rounding, and the other fixes from the code review. |
| `test/app.test.js` | The cache and the app layer: two phones from invite to dispute, currencies, converting v1 data. |
| `test/ui-logic.test.js` | The numpad rules and the text on screen. |

Each tally derives its key with 600,000 PBKDF2 iterations, so tests that create many tallies take a few seconds.

**In a real browser**, `e2e/` drives the built preview with separate browser profiles as separate phones: invite, join, logging, review, *Not me*, edits, a wiped phone, and two converted v1 phones meeting. See the comment at the top of each script.
