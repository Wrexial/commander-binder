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
is the one env file allowed by `.gitignore`, so add new keys there too.

- `VITE_CLERK_PUBLISHABLE_KEY` — frontend Clerk initialization.
- `VITE_CLERK_ISSUER_URL` — function-side JWT verification (`netlify/utils/auth.ts`).
- `NETLIFY_DATABASE_URL` — required by the `db:*` scripts and the Neon client.

## Architecture

- Frontend code is plain JavaScript (ES modules); only `netlify/**/*.ts` and
  `db/*.ts` are TypeScript (run through Netlify's/esbuild's transpilation).
- `src/main.js` — app entry point; wires up all UI modules.
- `src/api/` — Scryfall API client (`scryfall.js`), bulk-data loader
  (`bulkData.js`), search-response cache (`responseCache.js`), and
  auth/share helpers (`authenticatedFetch.js`, `share.js`). `scryfall.js` is
  deliberately DOM-free: it only caches/paces/retries requests and exposes
  `fetchPage`, `setRequestThrottle`, and the bulk-source controls.
- `src/auth/` — Clerk setup (`clerk.js`) and theme (`clerk-dark-theme.js`).
- `src/config/constants.js` — shared constants (cards per page, binders, Clerk key).
- `src/state/` — module-level state objects (`appState`, `mainState`, `cardState`,
  `cardStore`, `cardSettings`). State is plain exported objects, not a framework
  store. `mainState.js` holds session state so `cardState.js` can read it without
  importing `main.js` (avoids a cycle).
- `src/ui/` — DOM rendering and interactions (`layout`, `cards`, `search`,
  `searchHelp`, `settingsUI`, `statistics`, `lazyCardLoader`, `loadingIndicator`,
  `tooltip`, `cardInteractions`), including `components/` (the shared modal shell
  `modal.js`, the bulk/export modals, `sidebar`, `toast`, `ownedCounter`,
  `SignInButton`, `GuestModeText`) and their colocated CSS. `searchHelp.js` owns
  the syntax reference as data (rendered into `#search-tooltip`), so the docs and
  `parseQuery` cannot drift apart. `cardFeed.js` owns the fetch→render pagination
  loop and is the only place that drives rendering.
- `src/utils/` — small helpers (`colors`, `debounce`, `cardImages`, `imageCache`,
  `html`, `idb`, `prices`, `printings`, `pointer`, `viewport`). `idb.js` is the
  shared IndexedDB wrapper used by `responseCache.js` and `bulkData.js`;
  `pointer.js` answers "can this device hover?" and `viewport.js` publishes live
  toolbar height / keyboard inset as CSS variables.
- `db/` — Drizzle schema (`schema.ts`, `userSettings.ts`, `shareLinks.ts`) and
  DB client (`index.ts`).
- `netlify/functions/` — HTTP handlers (`owned-cards`, `toggle-card`,
  `batch-toggle-cards`, `share-link`).
- `netlify/utils/auth.ts` — JWT verification via `jose` against Clerk's JWKS
  (`verifyToken`, `getUserId`, `unauthorized`).
- `netlify/utils/ownedCards.ts` — shared add/remove DB logic for the toggle
  handlers.
- `scripts/verify-bulk-coverage.mjs` — checks that Scryfall's bulk file covers the
  app's legendary-creature search (used by `npm run verify:bulk`).
- Share links use `?share=<token>` backed by the `share_links` table. Rotating the
  token (`share-link` with `{ regenerate: true }`) invalidates old links; the
  user's Clerk id is never exposed in the URL.
- Tests are colocated under `__tests__/` folders (`src/__tests__/`,
  `src/api/__tests__/`, `src/state/__tests__/`, `src/ui/__tests__/`,
  `src/ui/components/__tests__/`, `src/utils/__tests__/`). Cross-module flows live
  in `src/__integration__/ownedFlow.test.js`. Mock Clerk lives in
  `src/__mocks__/@clerk/clerk-js.js`.

## Conventions

- ES modules throughout (`"type": "module"`); use `import`/`export`.
- One gesture, one action: a tap must never trigger two things. Gate hover-only
  affordances behind `isHoverCapable()` (`src/utils/pointer.js`), and make sure a
  long-press swallows the click the browser still fires on release.
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
  `owned_cards`/`user_settings`, `0001` adds `share_links`). If the Neon database
  was created outside Drizzle, baseline existing migrations before
  `npm run db:migrate`, otherwise it fails with "table already exists".
- Keep `drizzle-kit` on the 0.31+ line. `drizzle.config.ts` and the `db:*`
  scripts use the current `dialect`/`generate`/`migrate`/`studio` API, which the
  old 0.18.x CLI (split `generate:pg`/`up:pg` commands) does not support.
- Clerk is the only auth integration.
