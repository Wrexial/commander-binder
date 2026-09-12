# AGENTS.md

Instructions for coding agents working in this repository.

## Project Overview

A Scryfall-based Magic: The Gathering collection tracker. The frontend is a
vanilla JavaScript SPA bundled with **Vite** and styled with plain CSS. It is
deployed on **Netlify**, using Netlify Functions for the backend API and a
**Neon Postgres** database accessed through **Drizzle ORM**. Authentication is
handled by **Clerk** (with some Auth0 code remaining). The Scryfall public API
provides card data.

## Commands

Run from the repository root:

```bash
npm run dev            # Start Vite dev server (port 5173, strict)
npm run build          # Production build (sourcemaps enabled)
npm run lint           # ESLint over src/**/*.js
npm test               # Vitest (jsdom), single run
npm run test:coverage  # Vitest with v8 coverage

npm run db:generate    # Generate Drizzle migrations from db/schema.ts
npm run db:migrate     # Run migrations via `netlify dev:exec`
npm run db:studio      # Open Drizzle Studio
```

Netlify functions run with `netlify dev` (port 8080). DB scripts require
`NETLIFY_DATABASE_URL`; Clerk verification requires `VITE_CLERK_ISSUER_URL`.
Environment values live in `.env` (gitignored, never commit it).

## Architecture

- `src/main.js` — app entry point; wires up all UI modules.
- `src/api/scryfall.js` — Scryfall API client (uses `node-fetch`).
- `src/auth/` — Clerk setup and theme.
- `src/state/` — module-level state objects (`appState`, `cardState`, `cardStore`,
  `cardSettings`). State is plain exported objects, not a framework store.
- `src/ui/` — DOM rendering and interactions, including `components/` (modals,
  sidebar, toast, counter, buttons) and their colocated CSS.
- `src/utils/` — small helpers (`colors`, `debounce`, `search`).
- `db/` — Drizzle schema (`schema.ts`, `userSettings.ts`) and DB client (`index.ts`).
- `netlify/functions/` — HTTP handlers (owned cards, toggling, batch operations).
- `netlify/utils/auth.ts` — JWT verification via `jose` against Clerk's JWKS.
- `src/__tests__/` and `src/**/__tests__/` — Vitest tests. Mock Clerk lives in
  `src/__mocks__/@clerk/clerk-js.js`.

## Conventions

- ES modules throughout (`"type": "module"`); use `import`/`export`.
- Vanilla JS/DOM for the frontend — no React/Vue. Prefer existing component
  factory patterns (e.g. `createXModal()` returning `{ show }`).
- Keep modules focused; add new UI logic under `src/ui/` and new state under
  `src/state/`.
- Netlify function handlers are `async` and return `{ statusCode, body }` with
  `JSON.stringify`, checking `context.netlifyContext.user` before falling back
  to a body `userId`.
- Never edit generated Drizzle migrations by hand. Change `db/schema.ts`, then
  run `npm run db:generate` and `npm run db:migrate`.
- Add or update Vitest tests for behavior changes. Run `npm run lint` and
  `npm test` before finishing.

## Known Caveats

- `db/schema.ts` defines `ownedCards` with `drizzle-orm/sqlite-core` while
  `drizzle.config.ts` and `db/index.ts` target Postgres (Neon). Verify which
  dialect is actually intended before adding migrations or tables.
- Both Clerk and Auth0 dependencies are present; Clerk is the active integration.
- The `netlify.toml` references an edge function named `test` that does not
  appear in the repo.
