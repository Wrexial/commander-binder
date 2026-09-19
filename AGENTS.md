# AGENTS.md

Instructions for coding agents working in this repository.

## Project Overview

A Scryfall-based Magic: The Gathering collection tracker. The frontend is a
vanilla JavaScript SPA bundled with **Vite** and styled with plain CSS. It is
deployed on **Netlify**, using Netlify Functions for the backend API and a
**Neon Postgres** database accessed through **Drizzle ORM**. Authentication is
handled by **Clerk**. The Scryfall public API provides card data.

## Commands

Run from the repository root:

```bash
npm start              # Alias for `npm run dev`
npm run dev            # Frontend only: Vite dev server (port 5173, strict)
npm run dev:netlify    # Full stack: Netlify Dev + Functions (port 8080)
npm run build          # Production build (sourcemaps enabled)
npm run lint           # ESLint (JS/TS across the repo)
npm run typecheck      # tsc --noEmit (netlify/**/*.ts, db/*.ts, drizzle.config.ts)
npm run format         # Prettier (write)
npm run format:check   # Prettier (check only)
npm test               # Vitest (jsdom), single run
npm run test:coverage  # Vitest with v8 coverage
npm run verify:bulk    # Scryfall bulk-data coverage check (network; see scripts/)

npm run db:generate    # Generate Drizzle migrations from db/schema.ts
npm run db:migrate     # Run migrations via `netlify dev:exec`
npm run db:studio      # Open Drizzle Studio
```

Netlify functions only run under Netlify Dev (`npm run dev:netlify`, port 8080) —
the bare Vite server on 5173 does not serve them, so `/.netlify/functions/*` 404s
there.

### Environment

Environment values live in `.env` (gitignored, never commit it). `.env.example`
is the one env file `.gitignore` whitelists, so document any new key there too
(the file is not checked in yet).

- `VITE_CLERK_PUBLISHABLE_KEY` — frontend Clerk initialization.
- `VITE_CLERK_ISSUER_URL` — function-side JWT verification (`netlify/utils/auth.ts`).
- `NETLIFY_DATABASE_URL` — required by the `db:*` scripts and the Neon client.

## Architecture

- Frontend code is plain JavaScript (ES modules). TypeScript is limited to
  `netlify/**/*.ts`, `db/*.ts`, and `drizzle.config.ts` (the function/db files
  run through Netlify's/esbuild transpilation; `drizzle.config.ts` is loaded by
  drizzle-kit). Typecheck with `npm run typecheck` (see `tsconfig.json`).
- `src/main.js` — app entry point; wires up all UI modules.
- `src/api/` — Scryfall API client (`scryfall.js`), bulk-data loader
  (`bulkData.js`), search-response cache (`responseCache.js`), and
  auth/share helpers (`authenticatedFetch.js`, `share.js`, `userSettings.js`). `scryfall.js` is
  deliberately DOM-free: it only caches/paces/retries requests and exposes
  `fetchPage`, `setRequestThrottle`, and the bulk-source controls.
- `src/auth/` — Clerk setup (`clerk.js`) and theme (`clerk-dark-theme.js`).
- `src/config/constants.js` — shared constants (cards per page, binders, Clerk key).
- `src/state/` — module-level state objects (`appState`, `mainState`, `cardState`,
  `cardStore`, `cardSettings`, `viewState`, `onboarding`, `filters`,
  `settingsSync`). State is
  plain exported objects, not a framework store. `mainState.js` holds session
  state so `cardState.js` can read it without importing `main.js` (avoids a
  cycle). `viewState.js` persists the active search, scroll offset and filter
  state in `sessionStorage` (per-tab, best-effort); `onboarding.js` keeps
  first-run flags such as the dismissed guest welcome in `localStorage`;
  `filters.js` holds the filter-bar state (including the sort option) and the
  `cardMatchesFilters` predicate; `settingsSync.js` mirrors `cardSettings` to the
  account via the `user-settings` function (best-effort, signed-in only).
- `src/ui/` — DOM rendering and interactions (`layout`, `cards`, `search`,
  `searchHelp`, `settingsUI`, `statistics`, `lazyCardLoader`, `loadingIndicator`,
  `tooltip`, `cardInteractions`, `yearScrubber`, `scrollPosition`, `filterBar`,
  `randomCard`, `keyboardShortcuts`),
  including
  `components/` (the shared modal shell `modal.js` — focus trap, initial focus,
  and focus restore — the shared collection-modal chrome/helpers
  `collectionModal.js`, the bulk/export/import modals, `sidebar`, `toast`
  (swipe-any-direction to dismiss; toggled by the `swipeDismissToast` setting),
  `ownedCounter`, `SignInButton`, `GuestModeText`, `GuestWelcome`) and their
  colocated CSS. `statistics.js` and the
  bulk/export modals are loaded with dynamic `import()` from `main.js`, so they
  ship as separate chunks.
  `searchHelp.js` owns the syntax reference as data (rendered into
  `#search-tooltip`), so the docs and `parseQuery` cannot drift apart.
  `yearScrubber.js` builds the draggable rail from one mark per _visible_
  section (the section's first visible card, labelled by the active sort —
  release year + sets in the default order, or letter/price/rarity/colour
  identity), so the readout's sets follow the page under the thumb. Ticks and
  keyboard steps use `labelMarks()` (one per run of the same label). `search.js`
  dispatches a `cards:filtered` event after each filter pass so the marks follow
  filtering; the section `data-mark`/`data-markSets` stamps are the fallback when
  a section has no rendered cards. `cardFeed.js` owns the fetch→render pagination
  loop and renders
  each page; because only the default order can be streamed, any other sort makes
  it drop the set tags and rebuild the whole grid once loaded (and again on each
  sort change) via `applySort()`.
  `lazyCardLoader.js` bootstraps the default view and drives it through
  `fetchNextPage`. `scrollPosition.js` waits for the async grid to grow tall
  enough before restoring the saved offset, and `search.js` re-applies the active
  query via `reapplySearchFilter()` (called by `cardFeed.js` after each page) so
  later pages stay filtered. `filterBar.js`/`filters.js` add a separate
  click-driven filter state that `search.js` ANDs with the parsed query; tiles
  emit a `filter:set` event when their set/colour chip is clicked, which the bar
  applies and persists through the same commit path. `cards.js` supports three
  tile layouts (`images`, `text`, `list` — the last is a compact checklist row
  with an inline toggle), chosen in `settingsUI.js`; `randomCard.js` powers the
  sidebar “Surprise me” jump-to-a-missing-card action (it scrolls to the card
  and dispatches `card:preview`). The card preview (`tooltip.js`) is a centred
  modal on every viewport — opened by a long press (mouse or touch, with a
  filling progress ring under the cursor on desktop) or Surprise me — with a
  floating variant kept only for the statistics hover preview. It walks the
  visible grid on a left/right swipe and dismisses on a downward swipe, and its
  owned/missing badge is a toggle button (hidden in view-only mode); the host
  (`cardInteractions.js`) exposes
  `tooltip.onCycle`/`tooltip.onNavigate`/`tooltip.onToggle` so those controls
  follow the card on screen.
- `src/utils/` — small helpers (`colors`, `debounce`, `cardImages`, `imageCache`,
  `html`, `idb`, `prices`, `printings`, `pointer`, `viewport`, `collectionFormats`,
  `sortCards`).
  `idb.js` is the shared IndexedDB wrapper used by `responseCache.js` and
  `bulkData.js`; `pointer.js` answers "can this device hover?"; `viewport.js`
  publishes live toolbar height / keyboard inset as CSS variables;
  `collectionFormats.js` serializes/parses the CSV, Moxfield, Archidekt, MTG
  Arena, MTGO and plain-text files used by the export/import modals (parsing is
  header-driven and tolerant); and
  `sortCards.js` defines the sort options and the pure `sortCards`/`sortMark`
  helpers, including the WUBRG colour order.
- `db/` — Drizzle schema (`schema.ts`, `userSettings.ts`, `shareLinks.ts`) and
  DB client (`index.ts`).
- `netlify/functions/` — HTTP handlers (`owned-cards`, `toggle-card`,
  `batch-toggle-cards`, `share-link`, `user-settings`).
- `netlify/utils/auth.ts` — JWT verification via `jose` against Clerk's JWKS
  (exports `getUserId` and `unauthorized`; `verifyToken` is internal).
- `netlify/utils/ownedCards.ts` — shared add/remove DB logic for the toggle
  handlers.
- `netlify/utils/userSettings.ts` — load/save a user's JSON settings blob for
  the `user-settings` handler, with a size cap and shape validation.
- `netlify/utils/request.ts` — `parseJsonBody` (malformed JSON → 400 instead of
  a thrown 500) and `badRequest`, plus the `MAX_BATCH_SIZE` cap used by the batch
  toggle.
- `public/_headers` — Netlify security headers (report-only CSP; see the file for
  how to promote it to enforcing) and immutable caching for `/assets/*`.
- `scripts/verify-bulk-coverage.mjs` — checks that Scryfall's bulk file covers the
  app's legendary-creature search (used by `npm run verify:bulk`).
- Share links use `?share=<token>` backed by the `share_links` table. Rotating the
  token (`share-link` with `{ regenerate: true }`) invalidates old links; the
  user's Clerk id is never exposed in the URL. View-only/guest mode blocks
  ownership edits but still allows view actions such as cycling printings.
- Tests are colocated under `__tests__/` folders (`src/__tests__/`,
  `src/api/__tests__/`, `src/state/__tests__/`, `src/ui/__tests__/`,
  `src/ui/components/__tests__/`, `src/utils/__tests__/`, `netlify/utils/__tests__/`).
  Cross-module flows live
  in `src/__integration__/ownedFlow.test.js`. Mock Clerk lives in
  `src/__mocks__/@clerk/clerk-js.js`.

## Conventions

- ES modules throughout (`"type": "module"`); use `import`/`export`.
- One gesture, one action: a tap must never trigger two things. Gate hover-only
  affordances behind `isHoverCapable()` (`src/utils/pointer.js`), and make sure a
  long-press swallows the click the browser still fires on release.
- Card actions must be keyboard-reachable: ownership is the `.card-toggle` button
  and the printing cycle is the `.card-versions` button (pointer paths are
  right-click and touch). Keep new card controls real `<button>`s so they land in
  the tab order.
- Vanilla JS/DOM for the frontend — no React/Vue. Prefer existing component
  factory patterns (e.g. `createXModal()` returning `{ show }`).
- Escape untrusted strings with `escapeHtml` from `src/utils/html.js` before
  interpolating them into `innerHTML`.
- Use `authenticatedFetch` (`src/api/authenticatedFetch.js`) for requests that
  need the Clerk token rather than calling `fetch` directly.
- Keep modules focused; add new UI logic under `src/ui/` and new state under
  `src/state/`.
- Netlify function handlers are `async` and return `{ statusCode, body }` with
  `JSON.stringify`. Writes and `share-link` resolve the caller via
  `getUserId(event)` (verified Clerk JWT). `owned-cards` accepts a `shareToken`
  as a read-only capability that takes precedence when present; otherwise it
  falls back to the verified Clerk identity. Never trust a raw `userId` from the
  request body.
- Never edit generated Drizzle migrations by hand. Change `db/schema.ts`, then
  run `npm run db:generate` and `npm run db:migrate`.
- Add or update Vitest tests for behavior changes. Run `npm run lint`,
  `npm run format`, and `npm test` before finishing.

## Known Caveats

- `db/schema.ts` targets Postgres (`pg-core`), matching `drizzle.config.ts` and
  `db/index.ts` (Neon). Migrations live in `migrations/` (`0000` creates
  `owned_cards`/`user_settings`, `0001` adds `share_links`, `0002` adds
  `owned_cards.created_at` for the "Recent additions" log). If the Neon database
  was created outside Drizzle, baseline existing migrations before
  `npm run db:migrate`, otherwise it fails with "table already exists".
- Keep `drizzle-kit` on the 0.31+ line. `drizzle.config.ts` and the `db:*`
  scripts use the current `dialect`/`generate`/`migrate`/`studio` API, which the
  old 0.18.x CLI (split `generate:pg`/`up:pg` commands) does not support.
- Clerk is the only auth integration.
