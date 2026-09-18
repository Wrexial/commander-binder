# Legendary Creature Collector

[![CI](https://github.com/Wrexial/commander-binder/actions/workflows/ci.yml/badge.svg)](https://github.com/Wrexial/commander-binder/actions/workflows/ci.yml)

A web app for browsing and tracking a **Magic: The Gathering** collection of legendary
creatures, ordered by the year they first appeared in the game. Cards stream in oldest-first,
so your collection reads like a history of Commander.

**Live site:** <https://commanders-binders.netlify.app/>

Card data and images come from the [Scryfall API](https://scryfall.com/docs/api). This is
unofficial Fan Content, not approved or endorsed by Wizards of the Coast.

---

## Features

- **Release-ordered card feed** of every legendary creature, streamed page by page from
  Scryfall's bulk data for fast first paint.
- **Ownership tracking** — tap the ownership button on a card to mark it owned. Marks are
  stored per user in Postgres and persist across devices.
- **Accounts** via Clerk, with a first-run welcome for signed-out visitors.
- **Share links** — generate a revocable `?share=<token>` URL that shows your collection in
  view-only guest mode. Rotating the token invalidates old links immediately.
- **Powerful search** with the same syntax Scryfall users expect — `t:dragon`, `o:"draw a
card"`, `c>wg`, `d:2018-2020`, `price:1.50-20`, `is:owned`, `!t:goblin`, `and` / `or`, and
  parentheses. An in-app help sheet documents each filter, and tests keep the docs and parser
  in sync.
- **Click filters and sorting** — filter by colour identity, rarity, price, set and more, and
  sort by release order (default), name, price, rarity or colour.
- **Year scrubber** — a draggable rail that jumps to any point in the timeline, with a readout
  that follows the page under your thumb.
- **Statistics** — a per-set completion breakdown of your collection.
- **Binders** — virtual groupings of the feed that make a large collection easier to page
  through.
- **Bulk add & bulk check** — add many cards at once or check which ones you already own.
- **Import & export** — CSV, [Moxfield](https://moxfield.com/) and
  [Archidekt](https://archidekt.com/) formats, parsed header-first and tolerant of messy files.
- **Responsive, keyboard- and touch-friendly UI** — real buttons for card actions, long-press
  printings on touch, right-click on desktop, hover-only affordances gated behind
  `isHoverCapable()`.
- **Aggressive caching** — Scryfall responses and images are cached in IndexedDB, and the
  bulk-data subset is reused on a TTL.

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
  api/                 Scryfall client, bulk-data loader, response cache,
                       authenticatedFetch, share helpers
  auth/                Clerk setup and dark theme
  config/constants.js  Shared constants (page size, binders, Clerk key)
  state/               Module-level state objects (plain exported objects)
  ui/                  DOM rendering and interactions
    components/        Modal shell, modals, sidebar, toast, sign-in, etc.
  utils/               Small helpers (colors, idb, prices, printings, sort, ...)
db/                    Drizzle schema, tables and Neon client
netlify/
  functions/           HTTP handlers (owned-cards, toggle-card,
                       batch-toggle-cards, share-link)
  utils/               Auth (JWT), shared owned-cards logic, request parsing
migrations/            Generated Drizzle migrations (do not edit by hand)
public/_headers        Netlify security + caching headers
scripts/               Maintenance scripts (bulk-coverage check)
```

Tests are colocated in `__tests__/` folders next to the code, with cross-module flows in
`src/__integration__/ownedFlow.test.js`.

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
- **Guest mode** blocks ownership edits but still allows view actions such as cycling
  printings.
- **Bulk data** replaces dozens of paginated search requests with a single download. Because
  only the default order can be streamed, choosing any other sort drops the set tags and
  rebuilds the grid once loaded.
- **Security headers** live in `public/_headers`. The CSP currently ships in
  **Report-Only** mode; promote it to enforcing once the production console is clean.
- **TypeScript** is limited to `netlify/**/*.ts`, `db/*.ts` and `drizzle.config.ts`. The rest
  of the app is JavaScript checked by ESLint.

---

## Database

Three tables, defined in `db/` and generated into `migrations/`:

- `owned_cards` — `(user_id, card_id)` primary key, one row per owned card.
- `user_settings` — per-user JSON settings blob.
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

Released under the **GNU General Public License v2.0**. See [LICENSE](LICENSE).

Magic: The Gathering is a trademark of Wizards of the Coast. Card data and images are provided
by [Scryfall](https://scryfall.com/).
