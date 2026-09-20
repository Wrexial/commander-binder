# Legendex

[![CI](https://github.com/Wrexial/commander-binder/actions/workflows/ci.yml/badge.svg)](https://github.com/Wrexial/commander-binder/actions/workflows/ci.yml)

Legendex is a web app for browsing and tracking a **Magic: The Gathering** collection of
legendary creatures, ordered by the year they first appeared in the game. Cards stream in
oldest-first, so your collection reads like a history of Commander.

**Live site:** <https://commanders-binders.netlify.app/>

Card data and images come from the [Scryfall API](https://scryfall.com/docs/api). This is
unofficial Fan Content, not approved or endorsed by Wizards of the Coast.

---

## Features

- **Release-ordered card feed** of every legendary creature, streamed page by page from
  Scryfall's bulk data for fast first paint.
- **Ownership tracking** — tap the ownership button on a card to mark it owned. Signed-in
  marks are stored per user in Postgres and persist across devices. Signed-out visitors can
  track a collection too: it is saved to IndexedDB on this device and additively merged into
  their account the first time they sign in.
- **Accounts** via Clerk, with a first-run welcome for signed-out visitors.
- **Share links** — generate a revocable `?share=<token>` URL that shows your collection in
  view-only guest mode. Rotating the token invalidates old links immediately.
- **Powerful search** with the same syntax Scryfall users expect — `t:dragon`, `o:"draw a
card"`, `c>wg`, `d:2018-2020`, `price:1.50-20`, `is:owned`, `is:missing`, `!t:goblin`, `and`
  / `or`, and parentheses. An in-app help sheet documents each filter, and tests keep the docs
  and parser in sync.
- **Click filters and sorting** — filter by colour identity, rarity, price, set and more, and
  sort by release order (default), name, price, rarity or colour. Colour pips combine two
  ways: **Exclusive** (the default — selecting W+B shows W, B and WB cards) or **Exact**
  (only W+B). Clicking the set or colour chip on any tile filters the grid to that set or
  colour in one tap.
- **Year scrubber** — a draggable rail that jumps to any point in the timeline, with a readout
  that follows the page under your thumb.
- **Statistics** — a per-set completion breakdown of your collection. A "Sets completed: N"
  summary sits up top, and the list below shows the **in-progress** sets nearest to
  completion (with "Next 50%" goal badges), each with a one-tap "Copy" for its missing cards
  and a global "Copy missing" to turn the numbers into a shopping list.
- **Recent additions** — a timeline of when you marked each card owned, built from
  `owned_cards.created_at`.
- **Binders** — virtual groupings of the feed that make a large collection easier to page
  through.
- **Three tile layouts** — full artwork, text tiles, or a compact list with inline ownership
  toggles, for marking a whole page quickly.
- **Add & bulk check** — type names (with autocomplete), paste a list, or import a CSV / Moxfield
  / Archidekt file to mark many cards owned at once. Bulk Check reports where each pasted
  name lives — collection, wishlist, lists and binders — and copies the ones missing from all
  of them.
- **“Surprise me”** — jump to a random missing card, scroll to it and open its preview.
- **Export** — CSV, [Moxfield](https://moxfield.com/),
  [Archidekt](https://archidekt.com/), MTG Arena, MTGO and plain-text formats. The plain-text
  export is one card name per line, so it feeds straight back into Add Cards.
- **Modal card preview** — long-pressing a card (hold the mouse button on desktop, with a
  filling progress ring under the cursor, or press-and-hold on touch) opens a centred preview
  with the full artwork, set/price, an **owned/missing toggle**, and a "Next printing" control;
  swipe left/right on touch, or press `←`/`→` (or `J`/`K`) on desktop, to move between cards, and
  `↑`/`↓` to change printing (`Esc` closes). A normal click still toggles owned/missing.
- **Responsive, keyboard- and touch-friendly UI** — real buttons for card actions, long-press
  printings on touch, right-click on desktop, and swipe left/right in the card preview to move
  between cards. Alerts (such as the undo prompt) can be swiped away, and the list can be
  driven entirely from the keyboard: `/` focuses search, `?` opens the syntax help, `j`/`k`
  (or the arrow keys once a card is focused) move between cards, and `Esc` clears the search.
  With the card preview open, `←`/`→` (or `J`/`K`) change card, `↑`/`↓` change printing, and
  `Esc` closes it. Hover-only affordances are gated behind `isHoverCapable()`.
- **Synced preferences** — the display-mode and alert settings follow you across devices
  through the `user_settings` table (signed-in collectors only; localStorage is the offline
  fallback).
- **Aggressive caching** — Scryfall responses and images are cached in IndexedDB, and the
  bulk-data subset is reused on a TTL.
- **Installable app** — a web app manifest and service worker let you add the site to your
  home screen and launch it standalone, with an offline app shell. An “Install app” button
  appears in the header whenever the browser offers it; on iOS Safari it points to
  Share → Add to Home Screen.

---

## Tech stack

| Layer     | Choice                                                           |
| --------- | ---------------------------------------------------------------- |
| Frontend  | Vanilla JavaScript (ES modules), Vite, plain CSS — no React/Vue  |
| Backend   | Netlify Functions (TypeScript)                                   |
| Database  | Neon Postgres via Drizzle ORM                                    |
| Auth      | Clerk (`@clerk/clerk-js` on the client, `jose` JWT verification) |
| Card data | Scryfall search API + `default_cards` bulk data                  |
| Tests     | Vitest + jsdom                                                   |
| Hosting   | Netlify                                                          |

---

## Getting started

### Prerequisites

- Node.js **24** (see `.nvmrc`) and a matching npm.
- A Clerk application (publishable key + issuer URL).
- A Neon Postgres database (or any Postgres URL for Drizzle).

### Install

```bash
npm install
```

### Environment

Create a `.env` file in the project root (gitignored). Never commit it.

| Variable                     | Used by           | Purpose                                            |
| ---------------------------- | ----------------- | -------------------------------------------------- |
| `VITE_CLERK_PUBLISHABLE_KEY` | Frontend          | Initialises Clerk in the browser.                  |
| `VITE_CLERK_ISSUER_URL`      | Netlify functions | Verifies Clerk JWTs against the issuer's JWKS.     |
| `NETLIFY_DATABASE_URL`       | Drizzle / `db:*`  | Neon connection string for migrations and queries. |

### Run

```bash
npm run dev          # Vite dev server only, http://localhost:5173
npm run dev:netlify  # Full stack: Vite + Netlify Functions, http://localhost:8080
```

> Netlify functions only run under **`npm run dev:netlify`**. The bare Vite server does not
> serve them, so `/.netlify/functions/*` returns 404 there.

### Build

```bash
npm run build        # Production build (sourcemaps enabled)
```

---

## Scripts

| Script                      | What it does                                                                        |
| --------------------------- | ----------------------------------------------------------------------------------- |
| `npm start` / `npm run dev` | Vite dev server (port 5173, strict).                                                |
| `npm run dev:netlify`       | Netlify Dev + Functions (port 8080).                                                |
| `npm run build`             | Production build.                                                                   |
| `npm run lint`              | ESLint across the repo.                                                             |
| `npm run typecheck`         | `tsc --noEmit` for `netlify/**`, `db/**`, `drizzle.config.ts`.                      |
| `npm run format`            | Prettier (write). `format:check` for CI.                                            |
| `npm test`                  | Vitest (jsdom), single run.                                                         |
| `npm run test:coverage`     | Vitest with v8 coverage.                                                            |
| `npm run verify:bulk`       | Network check that Scryfall's bulk file covers the app's legendary-creature search. |
| `npm run db:generate`       | Generate Drizzle migrations from `db/schema.ts`.                                    |
| `npm run db:migrate`        | Run migrations via `netlify dev:exec`.                                              |
| `npm run db:studio`         | Open Drizzle Studio.                                                                |

---

## Project structure

```
src/
  main.js              App entry point; wires up all UI modules
  pwa.js               Service worker registration (production only)
  api/                 Scryfall client, bulk-data loader, response cache,
                       authenticatedFetch, share helpers, collection merge
  auth/                Clerk setup and dark theme
  config/constants.js  Shared constants (page size, binders, Clerk key)
  state/               Module-level state objects (plain exported objects)
  ui/                  DOM rendering and interactions
    components/        Modal shell, modals, sidebar, toast, sign-in, etc.
  utils/               Small helpers (colors, idb, prices, printings, sort, ...)
db/                    Drizzle schema, tables and Neon client
netlify/
  functions/           HTTP handlers (owned-cards, toggle-card,
                       batch-toggle-cards, merge-owned, share-link,
                       user-settings)
  utils/               Auth (JWT), shared owned-cards logic, request parsing
migrations/            Generated Drizzle migrations (do not edit by hand)
public/_headers        Netlify security + caching headers
public/manifest.webmanifest + public/sw.js   PWA manifest and offline service worker
public/icons/          Install icons (192/512 + maskable)
scripts/               Maintenance scripts (bulk-coverage check)
```

Tests are colocated in `__tests__/` folders next to the code, with cross-module flows in
`src/__integration__/` (ownership and guest sign-in merge).

---

## Architecture notes

- **No framework.** The frontend is plain ES modules; state lives in exported plain objects
  under `src/state/` rather than a store library. New UI work goes in `src/ui/`, new state in
  `src/state/`.
- **Backend is function-only.** Handlers are `async` and return `{ statusCode, body }`. Writes
  and `share-link` resolve the caller with `getUserId(event)` (a verified Clerk JWT). A raw
  `userId` in the request body is never trusted.
- **Share links are capabilities.** `owned-cards` accepts a `shareToken` that takes precedence
  over the session, so opening someone's link shows _their_ collection. Rotating the token
  (`share-link` with `{ regenerate: true }`) invalidates every old link, and the Clerk user id
  is never exposed in the URL.
- **Guest mode** comes in two flavours. A `?share=<token>` visitor is **view-only**: they
  cannot edit the owner's collection, but can still perform view actions such as cycling
  printings. A plain signed-out visitor is **local**: they can mark cards, which are kept in
  IndexedDB and merged into their account on sign-in (`merge-owned`).
- **Bulk data** replaces dozens of paginated search requests with a single download. Because
  only the default order can be streamed, choosing any other sort drops the set tags and
  rebuilds the grid once loaded.
- **Security headers** live in `public/_headers`. The CSP currently ships in
  **Report-Only** mode; promote it to enforcing once the production console is clean.
- **Installable / offline.** `public/manifest.webmanifest` plus `public/sw.js` make the app a
  PWA. The service worker serves navigations network-first with a cached shell fallback, and
  hashed assets / icons cache-first, but never caches `/.netlify/functions/*`, so auth and
  collection data stay fresh. It is registered in production only (`src/pwa.js`); the header
  install CTA lives in `src/ui/installPrompt.js` and falls back to Add-to-Home-Screen
  instructions on iOS Safari.
- **TypeScript** is limited to `netlify/**/*.ts`, `db/*.ts` and `drizzle.config.ts`. The rest
  of the app is JavaScript checked by ESLint.

---

## Database

Three tables, defined in `db/` and generated into `migrations/`:

- `owned_cards` — `(user_id, card_id)` primary key, one row per owned card, plus `created_at`
  for the "Recent additions" timeline.
- `user_settings` — per-user JSON settings blob (synced UI preferences).
- `share_links` — one revocable share token per user.

Change `db/schema.ts`, then run:

```bash
npm run db:generate   # write a new migration
npm run db:migrate    # apply it
```

Never edit generated migrations by hand. If the database was created outside Drizzle, baseline
the existing migrations first, or `db:migrate` fails with "table already exists".

---

## Search syntax

The in-app help (`#search-tooltip`, sourced from `src/ui/searchHelp.js`) is the canonical
reference. A quick taste:

```
t:dragon                    type line contains "dragon"
o:"draw a card"             rules text phrase
s:dom                       set code or name
r:mythic                    rarity
c:wug                       exactly these colours
c>wg                        includes these colours
c<wug                       only these colours
d:2018-2020                 release-year range
price:1.50-20               price range in €
is:owned                    cards you own
is:missing                  cards you have not marked
is:colorless                colourless cards
is:dfc                      double-faced cards
!t:goblin                   exclude
t:elf and c:g               both must match
c:wu or c:bg                either may match
(t:elf or t:goblin) and c:g grouping
```

Click filters in the filter bar are ANDed with the parsed query.

---

## Testing & quality

```bash
npm run lint
npm run format:check
npm run typecheck
npm test
```

CI runs all four on every push and pull request (`.github/workflows/ci.yml`) using the Node
version pinned in `.nvmrc`. Tests are hermetic: the Clerk publishable key defaults to a dummy
value in `vitest.config.js`, so no `.env` or secret is needed to run them.

---

## Deployment

The app deploys to **Netlify**:

- `npm run build` produces the static bundle.
- `netlify/functions/` are bundled automatically by Netlify.
- Set `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_ISSUER_URL` and `NETLIFY_DATABASE_URL` in the
  Netlify environment.
- Apply database migrations with `npm run db:migrate`.

Netlify reads `.nvmrc`, so keep it aligned with the Node/npm version that generated
`package-lock.json`.

---

## License

Released under the **GNU General Public License v2.0** (`GPL-2.0-only`). See [LICENSE](LICENSE).

Magic: The Gathering is a trademark of Wizards of the Coast. Card data and images are provided
by [Scryfall](https://scryfall.com/).
