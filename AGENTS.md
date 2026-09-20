# AGENTS.md

Instructions for coding agents working in this repository.

## Project Overview

**Legendex** is a Scryfall-based Magic: The Gathering collection tracker. The
frontend is a vanilla JavaScript SPA bundled with **Vite** and styled with plain
CSS. It is deployed on **Netlify**, using Netlify Functions for the backend API
and a **Neon Postgres** database accessed through **Drizzle ORM**.
Authentication is handled by **Clerk**. The Scryfall public API provides card
data.

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
- `src/main.js` — browse/collection entry point; wires up all UI modules on top
  of the shared shell.
- `src/app/shell.js` — the shared boot used by both entry points: Clerk auth,
  the sidebar and its collection tools, the guest welcome/install prompt,
  collection/wishlist/list/binder loading and the guest→account merges, settings
  sync and `setupUI` (binders load without seeding, so the bulk modals can list
  them on either page). The shell owns the Bulk Add / Bulk Check / Export buttons
  for both pages; their default target is the _visible binder_ on the Binder
  Builder page (`defaultTargetId()` reads `getActiveBinderId()` when
  `#binder-root` exists) and the collection elsewhere. Each page calls
  `bootShell()` and then mounts its own
  main content (`main.js` = the search/browse grid, `binderMain.js` = the Binder
  Builder).
- `src/binderMain.js` + `binder.html` — the separate Binder Builder page. It
  reuses the shell and renders the editor into `#binder-root`. A binder can hold
  any card, so the picker searches Scryfall live and the editor hydrates only the
  pockets it renders (see `src/api/cardSearch.js`). The legendary-creature bulk
  set is warmed into `cardStore` afterwards, in the background (non-blocking),
  because Statistics and Compare Collections label the collection from it. Vite
  builds both pages (`vite.config.js` `rollupOptions.input`).
- `src/api/` — Scryfall API client (`scryfall.js`), bulk-data loader
  (`bulkData.js`), search-response cache (`responseCache.js`), on-demand card
  lookup (`cardSearch.js`), and
  auth/share helpers (`authenticatedFetch.js`, `share.js`, `userSettings.js`) and the
  guest merge clients (`mergeCollection.js` factory, re-exported as `mergeOwned.js`
  / `mergeWishlist.js`), and the custom-list client (`lists.js` — read,
  create/update/delete, item add/remove and guest merge). `scryfall.js` is
  deliberately DOM-free: it only caches/paces/retries requests and exposes
  `fetchPage`, `fetchCardsByIds` (the batched collection endpoint),
  `setRequestThrottle`, and the bulk-source controls. `bulkData.js` streams the
  Scryfall `default_cards` file once and, in the same pass, keeps the legendary
  subset _and_ builds the all-cards name catalog (`state/cardCatalog.js`) — so
  every card name is available for the picker and compare tools with no extra
  download. The cached subset is versioned, so a shape change forces one rebuild;
  `cardCatalog` also derives a name→id lookup from its id→name map when reading
  an older cached record that predates that field.
  `cardSearch.js` is the
  Binder Builder's all-cards layer: autocomplete, exact-name printing lists and
  id hydration (added to `cardStore`), all through the same cache/rate limiter.
- `src/auth/` — Clerk setup (`clerk.js`) and theme (`clerk-dark-theme.js`).
- `src/config/constants.js` — shared constants (default grid/binder sizes, Clerk key).
- `src/state/` — module-level state objects (`appState`, `mainState`, `cardState`,
  `wishlistState`, `cardStore`, `cardSettings`, `preferredPrintings`,
  `cardCatalog`,
  `localCollection`, `localWishlist`, `listsState`, `localLists`, `bindersState`,
  `localBinders`, `localRecordStore`, `registrySupport`,
  `compareState`, `selectionState`, `viewState`,
  `onboarding`,
  `filters`,
  `settingsSync`). `localRecordStore.js` is the shared IndexedDB CRUD factory the
  device-local stores are built on, and `registrySupport.js` holds the
  list/binder plumbing (`isLocalView`/`isShareView`, the change announcer, the id
  factory and the serialized write queue). State is
  plain exported objects, not a framework store. `mainState.js` holds session
  state so `cardState.js` can read it without importing `main.js` (avoids a
  cycle). `cardState.js` and `wishlistState.js` are thin instances of the
  shared `collectionState.js` factory (owned vs wanted), each switching between
  the device-local store (`localCollection.js`/`localWishlist.js`, signed-out
  guest) and the server (signed in or share token). `listsState.js` is the
  custom named-list registry (many lists, each with list-level notes and a
  public/private flag); unlike the collections it is not a single flat set, so
  it has its own module, backed by `localLists.js` (IndexedDB, one self-contained
  record per list) for guests and read-only public lists in a share view. It
  dispatches `lists:changed` on every load/mutation; `main.js` repaints tile
  badges from it and `filterBar.js` refreshes its list dropdown.
  `bindersState.js` is the Binder Builder registry (many user-authored binders,
  each `{ columns, rows, pages, isPublic, slots }` where a slot is
  `"page:row:col" -> printingId`). It keeps an in-memory Map as the session
  source of truth and mirrors the collections/lists split: signed-in callers
  read/write the server (`binders`/`manage-binder`/`merge-binders`), signed-out
  visitors keep device-local binders in `localBinders.js` (one self-contained
  IndexedDB record) and merge them on sign-in, and a `?share=` visitor reads the
  owner's public binders read-only (`canEditBinders()` gates every mutation). It
  dispatches `binders:changed` on every mutation. `getBinderCards`/
  `getBinderPrintingIds` return a binder's contents in slot order (one per name /
  every id) and `getBinderSlotCards` returns one card per pocket with duplicates
  kept (used by per-binder statistics);
  `isCardInBinder` is a name-aware membership check, so the bulk add/check/export
  modals treat binders exactly like lists; `addCardsToBinder` bulk-fills the
  first empty pockets and grows the page count when needed, and
  `moveCardToFirstEmptySlot` moves a pocket's card into another binder's first
  empty pocket (growing it if full), powering the builder's "switch binder while
  moving" flow.
  `preferredPrintings.js`
  remembers the printing the user picked when cycling versions (saved tiles
  show a pin; the sidebar settings has a reset control). Binder pockets opt out:
  a tile carries `data-binder-slot`, so `applyPreferredPrintings()` skips it and
  cycling emits `binder:printing-changed` to save that exact printing on the
  pocket instead of the global preference (two pockets of the same card keep
  their own versions). In a share/guest view `canCyclePrinting()` blocks cycling
  on binder pockets entirely (it would look editable but could never save); the
  browse grid still allows cycling as a view action.
  `compareState.js` loads the viewer's _own_ collection separately from the
  share view's owner collection, so the two can be diffed. `selectionState.js`
  holds the bulk-edit multi-selection (keyed by card name), entered from the
  sidebar's "☑️ Bulk Edit" button (browse view only — the shell omits it on the
  Binder Builder page, where the grid-oriented bar isn't initialized);
  `bulkEdit.js` renders the floating action bar
  (hidden until the mode is active) and offers select-all-visible,
  hidden-selection pruning, per-batch undo, an "Add to list" action that opens
  the batch list picker, and Esc to exit; `cards.js` paints
  the selected tiles.
  `viewState.js`
  persists the active search, scroll offset and filter
  state in `sessionStorage` (per-tab, best-effort); `onboarding.js` keeps
  first-run flags such as the dismissed guest welcome and the completed app tour
  in `localStorage`;
  `filters.js` holds the filter-bar state (including the sort option, the
  collection lens — All/Owned/Wanted/Missing — a custom-list lens, plus
  rarity/colour/set/price
  controls, surfaced as removable chips) and the
  `cardMatchesFilters` predicate; `settingsSync.js` mirrors `cardSettings` to the
  account via the `user-settings` function (best-effort, signed-in only).
  `cardSettings.js` holds the display mode, the price currency
  (EUR/USD/TIX), the grid dimensions (`gridColumns` x `gridRows` = cards per
  page), the pages-per-binder capacity, the swipe-to-dismiss flag and the
  preferred-printing map; the
  currency is read by `utils/priceFields.js` so tiles, the filter bar, search,
  sort and statistics all agree on one unit. `getCardsPerPage()`/`getPagesPerBinder()`
  derive the live page and binder sizes from those settings, so `cardFeed.js`,
  `layout.js`, `cards.js` and the bulk-source pager follow a change immediately.
  `preferredPrintings.js` resolves
  the printing a tile shows: the saved pick, else the cheapest printing.
- `src/ui/` — DOM rendering and interactions (`layout`, `cards`, `search`,
  `searchHelp`, `settingsUI`, `statistics`, `lazyCardLoader`, `loadingIndicator`,
  `tooltip`, `cardInteractions`, `bulkEdit`, `yearScrubber`, `scrollPosition`,
  `filterBar`, `binderBuilder`,
  `randomCard`, `keyboardShortcuts`, `installPrompt`),
  including
  `components/` (the shared modal shell `modal.js` — focus trap, initial focus,
  focus restore and a page-scroll lock while any dialog is open — the shared collection-modal chrome/helpers
  `collectionModal.js`, the settings dialog `settingsModal.js` (display mode,
  currency, grid columns/rows, pages per binder, swipe-to-dismiss and the
  preferred-printings reset — with a live miniature of the grid page that
  updates as columns/rows change; the sidebar's “⚙️ Settings” entry opens it),
  the first-run tour `tour.js` (a spotlight/popover walk over the search,
  filters, a card and the menu; auto-started once for signed-in visitors, offered
  from the guest welcome and replayable from the sidebar's “❓ App Tour”), the
  add/check/export modals (the add, bulk-check, export
  and recent-activity modals share an Owned/Wishlist picker from
  `collectionModal.js`'s `createTargetToggle` (which can also pin a "+ New list"
  action). `cardPreview.js` is the shared hover/tap preview for card names shown
  outside the grid (the add/check/export previews, list membership, recent
  additions and compare groups): rows opt in with `data-card-preview` plus a
  `data-card-id`/`data-card-name`, and the preview is read-only (no ownership or
  printing controls). `collectionTargets.js` is the shared, dependency-light home of the
  target descriptors (`COLLECTION_TARGETS`, `binderTargetId`,
  `buildTargetOptions`, `resolveTarget`) — the add/check modals append every
  custom list and every binder as a target (binders are prefixed `binder:` so a
  binder id is never mistaken for a list id), the add modal's "+ New list"
  reveals an inline create form and selects the new
  list, and the export button feeds each list and binder in
  as a collection (hydrating a binder's not-yet-loaded cards first), so they all
  work on lists and binders exactly like the built-ins. The export modal also
  takes an `initialId`, so on the binder page it opens on the visible binder, and
  its search filter narrows both the preview and the actual copy/download.
  The add/check modals share `cardLookup.js` (the store-by-name/printing lookup
  and `resolveMissingCards`), which resolves pasted names against the all-cards
  `cardCatalog` when they are not in `cardStore`, batching a fetch for the
  missing printings, and falls back to a live lookup while the catalog is still
  loading, so _any_ card can be added/checked — not only ones a binder already
  hydrated. `isPendingName` distinguishes a real card that is still hydrating
  (shown as a pulsing “Loading…” group) from a genuine unknown, and picking a
  suggestion re-runs the resolver so the name moves into “Will add”/“Already in”
  without another keystroke; the copy/download actions also resolve pending names
  first. Plus the shared
  `cardNameInput.js` autocomplete (which suggests names from the catalog too and
  indexes cards under both their front-face and full printed names, so a
  multi-face card matches either way), the share-view `compareModal.js` diff,
  the Binder Builder editor `binderBuilder.js` (a top binder-tab switcher, pocket
  grid, page navigation, a
  per-binder Public toggle and the add/move/remove controls plus a `≡` choose
  printing control that opens the scrollable `printingPickerModal.js` (filterable
  by set code, set name, collector number or year); while a move is pending,
  clicking another binder tab sends the card to that binder's first empty pocket;
  it reuses
  `cards.js` tiles so ownership toggles and the preview keep working, and each
  pocket pins its own exact printing). A share-link view
  render it read-only: `canEditBinders()` hides the toolbar edits, the pocket
  controls and empty-slot adders, and binder pockets can't have their printing
  cycled either) and its card picker `cardPickerModal.js`
  (all-cards search: the `cardCatalog` name list answers instantly with no
  network, and only while it is still loading does the picker fall back to
  Scryfall autocomplete; picking loads the name's printings into `cardStore`),
  `sidebar`, `toast`
  (type-coloured — `success`/`error`/`warning` — with an explicit dismiss control
  plus swipe-any-direction to dismiss on touch; the swipe is toggled by the
  `swipeDismissToast` setting),
  `ownedCounter`, `SignInButton`, `GuestModeText`, `GuestWelcome`), the
  custom-list UI (`listsModal.js` — create/rename/notes/public/delete, the list's
  member cards with owned/missing status, per-card removal, “add selection”, and
  a “Compare with my collection” action; `listPicker.js` — one card from the
  preview or the whole bulk selection, with partial-membership state) and their
  colocated CSS. `statistics.js` and the
  bulk/export modals are loaded with dynamic `import()` from `main.js`, so they
  ship as separate chunks. Statistics takes an optional `{ cards, countAll,
exactPrintings, title, emptyMessage }`, so the shell scopes it to the visible
  binder on the Binder Builder page (hydrating that binder's pockets first,
  `countAll: true` so every pocket — duplicate or unowned, legendary or not — is
  counted, and `exactPrintings: true` so each pocket is valued at its own
  printing) and to the whole owned collection elsewhere. It includes a pinned
  section index of jump-to-section chips, so a long report is navigable rather
  than a single scroll. Its hover preview clears
  the grid's `onToggle`/`onWishlistToggle`/`onAddToList` handlers on open
  (`onNavigate` too), so the read-only preview can only cycle printings.
  Statistics includes a
  "Wishlist Targets" section that
  ranks sets by how many of their missing cards are on the wishlist; money
  metrics value each card at its `resolveDisplayPrinting` printing (the pinned
  or cheapest one) on the grid, so the totals match the tile prices.
  `searchHelp.js` owns the syntax reference as data (rendered into
  `#search-tooltip`), so the docs and `parseQuery` cannot drift apart. `is:wanted`
  reads the wishlist and `is:new` matches cards added to either collection in the
  last 30 days; `is:listed` matches cards on any custom list and `list:"name"`
  matches a named one. `sortCards.js` also offers wanted-first/not-wanted-first
  orders.
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
  later pages stay filtered. When the active search/filters hide every rendered
  card, `search.js` fills `#no-results-message` with an actionable empty state
  (a message plus a “Clear search & filters” button). `filterBar.js`/`filters.js` add a separate
  click-driven filter state that `search.js` ANDs with the parsed query; tiles
  emit a `filter:set` event when their set/colour chip is clicked, which the bar
  applies and persists through the same commit path. `cards.js` supports three
  tile layouts (`images`, `text`, `list` — the last is a compact checklist row
  with an inline toggle), chosen in the settings modal; `randomCard.js` powers the
  sidebar “Surprise me” jump-to-a-missing-card action (it scrolls to the card
  and dispatches `card:preview`). The card preview (`tooltip.js`) is a centred
  modal on every viewport — opened by a long press (mouse or touch, with a
  filling progress ring under the cursor on desktop) or Surprise me — with a
  floating variant kept only for the statistics hover preview. It walks the
  visible grid on a left/right swipe (touch) or `←`/`→` / `J`/`K` (desktop, `Esc`
  closes), changes printing on `↑`/`↓`, and dismisses on a downward swipe; the hint
  text is device-aware. Its
  owned/missing badge is a toggle button (hidden in view-only mode); the host
  (`cardInteractions.js`) exposes
  `tooltip.onCycle`/`tooltip.onNavigate`/`tooltip.onToggle` so those controls
  follow the card on screen.
- `src/utils/` — small helpers (`colors`, `debounce`, `cardImages`, `imageCache`,
  `html`, `idb`, `prices`, `priceFields`, `printings`, `pointer`, `viewport`,
  `collectionFormats`, `compareCollections`, `sortCards`).
  `priceFields.js` is the store-free place that reads Scryfall's per-currency
  `prices.eur`/`usd`/`tix` fields (plus `formatPrice`/`formatPriceRange`), so a
  currency switch is a settings change rather than a data change; `prices.js`
  re-exports it and adds `getCheapestPrice`. `printings.js` owns version
  ordering: `orderPrintingsByPrice`/`cheapestPrinting` sort by the selected
  currency (unpriced printings last, release date breaks ties), so the version
  badge's “1” and the printing cycle are always the cheapest version.
  `idb.js` is the shared IndexedDB wrapper used by `responseCache.js` and
  `bulkData.js`; `pointer.js` answers "can this device hover?"; `viewport.js`
  publishes live toolbar height / keyboard inset as CSS variables;
  `compareCollections.js` is the pure card-level diff behind the share view;
  `collectionFormats.js` serializes/parses the CSV, Moxfield, Archidekt, MTG
  Arena, MTGO and plain-text files used by the export/import modals (parsing is
  header-driven and tolerant); and
  `sortCards.js` defines the sort options and the pure `sortCards`/`sortMark`
  helpers, including the WUBRG colour order.
- `db/` — Drizzle schema (`schema.ts`, `userSettings.ts`, `shareLinks.ts`,
  `wishlistCards.ts`, `cardLists.ts`, `cardListItems.ts`, `binders.ts`) and DB
  client (`index.ts`).
- `netlify/functions/` — HTTP handlers (`owned-cards`, `toggle-card`,
  `batch-toggle-cards`, `merge-owned`, `wishlist-cards`, `toggle-wishlist`,
  `batch-toggle-wishlist`, `merge-wishlist`, `share-link`, `user-settings`,
  `lists`, `manage-list`, `list-items`, `merge-lists`, `binders`,
  `manage-binder`, `merge-binders`).
- `netlify/utils/mergeOwned.ts` — validates the `cardIds` payload for
  `merge-owned` (shape + `MAX_BATCH_SIZE`); the handler union-inserts them into
  the verified caller's account and ignores `shareToken`.
- `netlify/utils/auth.ts` — JWT verification via `jose` against Clerk's JWKS
  (exports `getUserId` and `unauthorized`; `verifyToken` is internal).
- `netlify/utils/collection.ts` — the `owned`/`wishlist` table map and the
  shared add/remove DB logic used by the toggle handlers.
- `netlify/utils/collectionHandlers.ts` — read/toggle/batch/merge handlers shared
  by the owned and wishlist function files. `readCollection` accepts a
  `shareToken` as a read-only capability, so a share link exposes the owner's
  wishlist as well as their collection.
- `netlify/utils/listHandlers.ts` + `netlify/utils/lists.ts` — the custom-list
  read/create/update/delete/item/merge handlers and their payload validation
  (`MAX_LISTS`, name/notes caps). `readLists` takes a `shareToken` as a read
  capability too, but returns only lists marked public.
- `netlify/utils/binderHandlers.ts` + `netlify/utils/binders.ts` — the Binder
  Builder read/create/update/delete/merge handlers and their payload validation
  (`MAX_BINDERS`, grid bounds, `MAX_BINDER_SLOTS`/bytes). `readBinders` takes a
  `shareToken` as a read capability and returns only binders marked public;
  `mergeBinders` unions guest binders by name without ever overwriting a stored
  pocket or un-publishing one.
- `netlify/utils/userSettings.ts` — load/save a user's JSON settings blob for
  the `user-settings` handler, with a size cap and shape validation.
- `netlify/utils/request.ts` — `parseJsonBody` (malformed JSON → 400 instead of
  a thrown 500) and `badRequest`, plus the `MAX_BATCH_SIZE` cap used by the batch
  toggle.
- `public/_headers` — Netlify security headers (report-only CSP; see the file for
  how to promote it to enforcing) and immutable caching for `/assets/*`.
- `public/manifest.webmanifest` + `public/sw.js` — PWA install metadata and the offline
  app-shell service worker. The worker is registered from `src/pwa.js` (production only) and
  never caches `/.netlify/functions/*`; the header install button is `src/ui/installPrompt.js`.
- `scripts/verify-bulk-coverage.mjs` — checks that Scryfall's bulk file covers the
  app's legendary-creature search (used by `npm run verify:bulk`).
- Share links use `?share=<token>` backed by the `share_links` table. Rotating the
  token (`share-link` with `{ regenerate: true }`) invalidates old links; the
  user's Clerk id is never exposed in the URL. The `?share=` view-only mode blocks
  ownership and wishlist edits but still allows view actions such as cycling
  printings, and friends see the owner's collection, wishlist and public binders
  (the Binder Builder link carries the token; binders not marked public are
  hidden). Share mode
  also offers "Compare Collections" (`components/compareModal.js`), a read-only
  diff of the owner's collection against the visitor's own — the owner's side
  comes from `cardState` (share token) and the visitor's from `compareState`
  (server when signed in, IndexedDB otherwise), with "Wishlist missing" and
  "Copy names" actions. The same module's `showListCompareModal` diffs one custom
  list against the viewer's collection (signed in, guest or share view) into the
  list cards you have, the ones you don't, and the cards you own that aren't on
  the list — with "Wishlist missing"/"Copy list". Plain
  signed-out visitors are **not** view-only: they track a collection and wishlist
  in IndexedDB that are additively merged into their account on sign-in
  (`merge-owned`/`merge-wishlist`), and they get the same collection sidebar
  (add / export / bulk edit / statistics) against that local data. A guest
  "Share" entry opens the sign-in flow instead of creating a link. Changing
  the Clerk user reloads the app so the correct collection mode is applied.
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
  `owned_cards.created_at` for the "Recent additions" log, `0003` adds
  `wishlist_cards`, `0004` adds `card_lists`/`card_list_items` for the custom
  named lists, `0005` adds `binders` for the Binder Builder layouts, `0006` adds
  `binders.is_public` for the share link). If the Neon
  database
  was created outside Drizzle, baseline existing migrations before
  `npm run db:migrate`, otherwise it fails with "table already exists".
- Keep `drizzle-kit` on the 0.31+ line. `drizzle.config.ts` and the `db:*`
  scripts use the current `dialect`/`generate`/`migrate`/`studio` API, which the
  old 0.18.x CLI (split `generate:pg`/`up:pg` commands) does not support.
- Clerk is the only auth integration.
