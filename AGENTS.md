# AGENTS.md

Instructions for coding agents working in this repository.

## Project Overview

A Scryfall-based Magic: The Gathering collection tracker. The frontend is a
vanilla JavaScript SPA bundled with **Vite** and styled with plain CSS. It is
deployed on **Netlify**, using Netlify Functions for the backend API and a
**Neon Postgres** database accessed through **Drizzle ORM**. Authentication is
handled by **Clerk**. The Scryfall public API
provides card data.

## Commands

Run from the repository root:

```bash
npm run dev            # Frontend only: Vite dev server (port 5173, strict)
npm run dev:netlify    # Full stack: Vite dev server + Netlify Functions (port 8080)
npm run build          # Production build (sourcemaps enabled)
npm run lint           # ESLint (JS/TS across the repo)
npm test               # Vitest (jsdom), single run
npm run test:coverage  # Vitest with v8 coverage

npm run db:generate    # Generate Drizzle migrations from db/schema.ts
npm run db:migrate     # Run migrations via `netlify dev:exec`
npm run db:studio      # Open Drizzle Studio
```

Netlify functions only run under Netlify Dev (`npm run dev:netlify`, port 8080) —
the bare Vite server on 5173 does not serve them, so `/.netlify/functions/*` 404s
there. DB scripts require `NETLIFY_DATABASE_URL`; Clerk verification requires
`VITE_CLERK_ISSUER_URL`. Environment values live in `.env` (gitignored, never
commit it).

## Architecture

- `src/main.js` — app entry point; wires up all UI modules.
- `src/api/` — Scryfall API client (`scryfall.js`), bulk-data loader
  (`bulkData.js`), search-response cache (`responseCache.js`), and
  auth/share helpers (`authenticatedFetch.js`, `share.js`).
- `src/auth/` — Clerk setup and theme.
- `src/state/` — module-level state objects (`appState`, `cardState`, `cardStore`,
  `cardSettings`). State is plain exported objects, not a framework store.
- `src/ui/` — DOM rendering and interactions (`layout`, `cards`, `search`,
  `settingsUI`, `statistics`, etc.), including `components/` (modals, sidebar,
  toast, counter, buttons) and their colocated CSS.
- `src/utils/` — small helpers (`colors`, `debounce`, `cardImages`, `imageCache`).
- `db/` — Drizzle schema (`schema.ts`, `userSettings.ts`, `shareLinks.ts`) and
  DB client (`index.ts`).
- `netlify/functions/` — HTTP handlers (owned cards, toggling, batch operations,
  `share-link`).
- `netlify/utils/auth.ts` — JWT verification via `jose` against Clerk's JWKS
  (`verifyToken`, `getUserId`).
- Share links use `?share=<token>` backed by the `share_links` table. Rotating the
  token (`share-link` with `{ regenerate: true }`) invalidates old links; the
  user's Clerk id is never exposed in the URL.
- `src/__tests__/` and `src/**/__tests__/` — Vitest tests. Mock Clerk lives in
  `src/__mocks__/@clerk/clerk-js.js`.

## Conventions

- ES modules throughout (`"type": "module"`); use `import`/`export`.
- Vanilla JS/DOM for the frontend — no React/Vue. Prefer existing component
  factory patterns (e.g. `createXModal()` returning `{ show }`).
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
- Add or update Vitest tests for behavior changes. Run `npm run lint` and
  `npm test` before finishing.

## Known Caveats

- `db/schema.ts` targets Postgres (`pg-core`), matching `drizzle.config.ts` and
  `db/index.ts` (Neon). Migrations live in `migrations/` (`0000` creates
  `owned_cards`/`user_settings`, `0001` adds `share_links`). If the Neon database
  was created outside Drizzle, baseline existing migrations before
  `npm run db:migrate`, otherwise it fails with "table already exists".
- Keep `drizzle-kit` on the 0.31+ line. `drizzle.config.ts` and the `db:*`
  scripts use the current `dialect`/`generate`/`migrate`/`studio` API, which the
  old 0.18.x CLI (split `generate:pg`/`up:pg` commands) does not support.
- Clerk is the only auth integration (the Auth0 dependency was removed).
