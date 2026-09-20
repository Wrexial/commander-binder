# Legendex Design Guide

A single reference for the visual language of Legendex so new UI keeps matching
the rest of the app. The **source of truth for values is `src/styles.css`**
(the `:root` token block); this document explains how and when to use them.

If you add or change a component, update this file and the tokens together.

---

## 1. The feel

Legendex is a **dark, gilded MTG binder**: deep navy surfaces, a single gold
accent, serif display headings, and quiet chrome that lets card art lead. It is
a desktop-and-touch app, so every affordance must work with a pointer, a finger
and a keyboard.

Guiding principles:

1. **One gesture, one action.** A tap must never fire two things (see
   `src/utils/pointer.js` / `isHoverCapable()`).
2. **Gold means "this is the thing".** The accent marks the primary action, the
   active state, and the current selection — not decoration.
3. **Real controls.** Buttons are `<button>`s; switches are `<input
type="checkbox">`s; focus is always visible.
4. **Chrome recedes, content leads.** Cards, binder pockets and previews are the
   stars; toolbars sit on `--surface-2` and use `--border` hairlines.
5. **Mobile is not a second design.** Same components, tighter spacing, safe-area
   aware.

---

## 2. Tokens

All tokens live in `:root` in `src/styles.css`. Use them — avoid raw hex.

### Colour

| Token             | Value                  | Use                                     |
| ----------------- | ---------------------- | --------------------------------------- |
| `--text`          | `#e8edf5`              | Body text, labels                       |
| `--muted`         | `#9aa7bd`              | Hints, metadata, inactive controls      |
| `--surface-0`     | `#0f131c`              | Page backdrop                           |
| `--surface-1`     | `#161c28`              | Modals, cards, panels                   |
| `--surface-2`     | `#1d2534`              | Toolbars, inputs, chips                 |
| `--surface-3`     | `#263043`              | Hover / raised rows, badges             |
| `--surface-glass` | `rgba(16,21,32,.78)`   | Sticky bars, toasts                     |
| `--border`        | `#2c3648`              | Hairlines, default outlines             |
| `--border-strong` | `#3d4a62`              | Controls, emphasis outlines             |
| `--accent`        | `#d4af37`              | Primary action, active state, selection |
| `--accent-strong` | `#f0cd6b`              | Accent text / hover                     |
| `--accent-soft`   | `rgba(212,175,55,.14)` | Accent-filled backgrounds               |
| `--success`       | `#46c98a`              | Owned, success toast                    |
| `--danger`        | `#e06060`              | Destructive, error toast                |
| `--focus`         | `#7cc4ff`              | Focus ring (never remove)               |

MTG identity colours (`--mtg-W/U/B/R/G`, `--binder-color-*`, `--colorless`) are
for card data, not chrome.

### Shape & depth

| Token               | Value  | Use                                 |
| ------------------- | ------ | ----------------------------------- |
| `--radius-xs`       | `6px`  | Badges, tiny rows                   |
| `--radius-sm`       | `10px` | Buttons, inputs, selects, cards     |
| `--radius-md`       | `14px` | Panels, toolbars, banners           |
| `--radius-lg`       | `20px` | Modals                              |
| `999px`             | —      | Pills: chips, tabs, toggles, badges |
| `--shadow-sm/md/lg` | —      | Resting card / menu / modal         |

### Type

- Body: **Roboto** (set on `body`).
- Display: `var(--font-display)` = **Cinzel** — used sparingly for page/modal
  titles (`.list-modal h2`, `.settings-group-title`, sidebar section titles).
- Section labels: `0.7–0.72rem`, `600–700`, `uppercase`,
  `letter-spacing: .08–.14em`, `var(--muted)` or `var(--accent)`.
- Metadata: `0.7–0.85rem`, `var(--muted)`.

### Spacing

There is no formal scale; the app settles on **6 / 8 / 10 / 12 / 14 / 18 / 22**
px, applied via `gap` on flex/grid containers rather than margins on children.
Prefer `gap` — do not scatter `margin-top/bottom` between siblings.

### Z-index

Use the `--z-index-*` tokens. Order: scrubber `11` → sidebar `1000/1010` →
hamburger `1020` → modal backdrop `1030` → loading `1050` → toast `2100` →
tooltip `2200` → picker `2210`. A dialog opened _from_ the card preview or a
hover tooltip must clear that layer (`.list-modal-backdrop.modal-above-tooltip`),
or it renders behind the thing that opened it.

---

## 3. Components

### 3.1 Buttons

| Role          | Class                                                               | Look                                                        |
| ------------- | ------------------------------------------------------------------- | ----------------------------------------------------------- |
| Base          | any `<button>` inside `.list-modal` / `.binder-builder-*`           | `--button-bg`, `--border-strong`, `--radius-sm`, weight 600 |
| **Primary**   | `.primary`                                                          | Gold gradient, dark text, one per view                      |
| Danger        | `.danger`                                                           | Transparent bg, `--danger` border + text                    |
| Accent action | `.bb-new`, `.lists-new`                                             | `--accent-soft` fill + `--accent` border                    |
| Icon button   | `.binder-slot-controls button`, `.statistics-close`, `.toast-close` | Circular/square, no chrome until hover                      |
| Ghost         | `.filter-reset`, `.tooltip-list-button`                             | Border only                                                 |

Rules:

- Exactly **one `.primary`** per modal / dialog. It now works in _every_
  `.list-modal` (Lists, list picker, Add/Export, …), not just bulk modals.
- Destructive actions use `.danger` and sit left of the primary.
- Never restyle a `<button>` to look like a link, and vice versa.

### 3.2 Pills, chips & segmented controls

| Pattern              | Class                                   | Active state                                           |
| -------------------- | --------------------------------------- | ------------------------------------------------------ |
| Binder tabs          | `.binder-tab`                           | `.is-active` (accent border + soft fill + accent text) |
| Target picker        | `.target-toggle-option`                 | `[aria-pressed="true"]` (same accent treatment)        |
| Stats section index  | `.stats-nav-chip`                       | `.is-active`                                           |
| Filter chips         | `.filter-chip`                          | `[aria-pressed="true"]`                                |
| Applied-filter chips | `.filter-active-chip`                   | removable `×` affordance                               |
| Segmented control    | `.filter-segmented` + `.filter-segment` | `[aria-pressed="true"]` (solid accent)                 |

The canonical **active pill** is `--accent-soft` background + `--accent` border

- `--accent-strong` text (see `.binder-tab.is-active`). Keep new selects/toggles
  consistent with it.

Pickers (`.target-toggle`) **wrap**; they don't scroll horizontally. Actions that
aren't targets (e.g. `+ New list`, `+ New binder`) use `.target-toggle-new`
(dashed border) and carry a `data-action` id.

### 3.3 Switches

Boolean settings render as **switch-style checkboxes**, not native boxes. The
shared rules live near `.settings-row-toggle` and cover:

- `.settings-row-toggle input[type="checkbox"]`
- `.bb-field-toggle input[type="checkbox"]`
- `.lists-checkbox input[type="checkbox"]`

A new boolean toggle should reuse one of these selectors (or be added to the
shared list) rather than introducing `accent-color` again.

### 3.4 Selects & inputs

- Text/number/search inputs: `--surface-2` background, `--border-strong`,
  `--radius-sm`, focus = `--focus` border + `--focus-shadow`.
- Native `<select>`s (`.filter-select`, `.settings-select`, `.transfer-format`,
  `.bb-field select`) get a **shared custom chevron** from the "Shared form
  controls" block at the end of `styles.css` so they match across platforms.
  Add new selects to that selector list.
- File inputs use `::file-selector-button` (`.transfer-file`).

### 3.5 Modals

Built with `createModal()` (`.list-modal`): backdrop, focus trap, Escape +
backdrop dismissal, scroll lock. Content modals use `createCollectionModal()`
(`.bulk-modal`). Shared pieces:

- Header `.bulk-modal-header` (title + `.bulk-modal-subtitle`).
- Body `.modal-content-area` — the base uses `white-space: pre`; HTML views
  (`.bulk-content`, `.statistics-content`, `.activity-content`) must opt back to
  `normal`.
- Footer `.modal-button-container` (right-aligned, wraps).

Vertical rhythm in `.bulk-content` comes from `gap`, not child margins.

### 3.6 Toasts

`showToast(message, 'success' | 'error' | 'warning')` — type shows as a coloured
left border; optional action uses `.toast-action`; dismiss is `.toast-close`
(swipe configurable via the `swipeDismissToast` setting).

### 3.7 Card controls

Ownership (`.card-toggle`), wishlist (`.card-wishlist`), the printing picker
(`.card-versions`) and the EDHREC link are real buttons so they land in the tab
order. Hover-only affordances sit behind `isHoverCapable()`.

---

## 4. Interaction states

- **Hover** (pointer only): `--surface-3` / `--button-bg-hover` + `--accent`
  border. Don't rely on hover for anything essential.
- **Active/pressed**: `[aria-pressed="true"]`, `.is-active`, or `:active`.
  Prefer ARIA attributes for toggle state.
- **Focus**: keep the global `:focus-visible` ring (`--focus`). Components may
  swap it for `box-shadow: var(--focus-shadow)` but never remove it.
- **Disabled**: drop to `--card-bg-default`/`--muted` and `cursor: not-allowed`;
  no hover lift.
- **Touch**: `@media (hover: none)` neutralises latched hover; long-press is
  handled by `src/utils/pointer.js`.

---

## 5. Adding UI — checklist

1. Reuse an existing component/class before inventing one.
2. Pull colours, radii and shadows from tokens (`:root`), never raw hex.
3. One `.primary` per view; use `.danger` for destructive.
4. Space with `gap`, not sibling margins.
5. Keep it keyboard-reachable and keep the focus ring.
6. Verify hover, focus, active and disabled states, and check a narrow viewport.
7. If it's a new pattern, add it here and to the relevant selector groups
   (switches, selects, toasts).
