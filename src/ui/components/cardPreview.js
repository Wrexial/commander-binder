// src/ui/components/cardPreview.js
/**
 * Hover/tap card previews for card names rendered outside the browse grid
 * (bulk add/check/export previews, list membership, recent additions, compares).
 *
 * The grid owns its own long-press/click preview through `cardInteractions`;
 * these rows are not tiles, so they use a lighter delegated helper. On a
 * hover-capable device a name shows the shared floating preview; on touch a tap
 * opens the full-screen preview. The preview is read-only: it clears any grid
 * handlers so it can never toggle ownership or cycle printings.
 *
 * Rows opt in with `data-card-preview` and an optional `data-card-id` (printing
 * id) or `data-card-name`.
 */
import { showTooltip, hideTooltip, positionTooltip } from '../tooltip.js';
import { isHoverCapable } from '../../utils/pointer.js';
import { preloadCardImages } from '../../utils/cardImages.js';
import { cardStore } from '../../state/cardStore.js';

const PREVIEW_SELECTOR = '[data-card-preview]';
/** Containers already wired, so re-rendering never stacks listeners. */
const attached = new WeakSet();
/** True while one of our rows owns the shared tooltip. */
let previewActive = false;

/** Default row → card resolver: an explicit printing id, else the oldest loaded. */
function resolveCard(row) {
  const id = row.dataset.cardId;
  if (id && typeof cardStore.getByPrintingId === 'function') {
    const card = cardStore.getByPrintingId(id);
    if (card) return card;
  }
  const name = row.dataset.cardName;
  if (name && typeof cardStore.getOldestPrinting === 'function') {
    return cardStore.getOldestPrinting(name) || null;
  }
  return null;
}

/** Make the shared tooltip a read-only preview (no toggle/cycle/navigation). */
function wireReadOnly(tooltip) {
  tooltip.onCycle = null;
  tooltip.onNavigate = null;
  tooltip.onToggle = null;
  tooltip.onWishlistToggle = null;
  tooltip.onAddToList = null;
  tooltip.cycleLabel = null;
}

/**
 * Hide the shared tooltip if one of our previews opened it. Called on modal
 * close, where the hovered row is removed before a mouseout can fire.
 */
export function hideCardPreview() {
  if (!previewActive) return;
  previewActive = false;
  const tooltip = document.getElementById('tooltip');
  if (tooltip) hideTooltip(tooltip);
}

/**
 * Wire hover/tap previews for `data-card-preview` descendants of `container`.
 * Safe to call once per container; delegated handlers survive re-renders.
 *
 * @param {HTMLElement} container
 * @param {{resolve?: (row: HTMLElement) => object|null}} [options]
 */
export function attachCardPreview(container, { resolve = resolveCard } = {}) {
  if (!container || attached.has(container)) return;

  const tooltip = document.getElementById('tooltip');
  if (!tooltip) return;

  let activeRow = null;

  function preview(row, event, { modal }) {
    const card = resolve(row);
    if (!card) return;

    activeRow = row;
    previewActive = true;
    wireReadOnly(tooltip);
    preloadCardImages(card);
    row.setAttribute('aria-describedby', 'tooltip');
    showTooltip(event, card, tooltip, modal ? { modal: true } : { modal: false });
  }

  function clear(row) {
    if (activeRow !== row) return;
    row.removeAttribute('aria-describedby');
    activeRow = null;
    previewActive = false;
    hideTooltip(tooltip);
  }

  function rowFrom(event) {
    const target = event.target;
    if (!(target instanceof Element)) return null;
    const row = target.closest(PREVIEW_SELECTOR);
    return row && container.contains(row) ? row : null;
  }

  container.addEventListener('mouseover', (event) => {
    if (!isHoverCapable()) return;
    const row = rowFrom(event);
    if (!row) return;
    if (row === activeRow) {
      positionTooltip(event, tooltip);
      return;
    }
    if (activeRow) clear(activeRow);
    preview(row, event, { modal: false });
  });

  container.addEventListener('mousemove', (event) => {
    if (!activeRow || !isHoverCapable()) return;
    if (tooltip.style.display !== 'none') positionTooltip(event, tooltip);
  });

  container.addEventListener('mouseout', (event) => {
    const row = activeRow;
    if (!row) return;
    const next = event.relatedTarget;
    if (next instanceof Node && row.contains(next)) return;
    clear(row);
  });

  // Scrolling a list moves rows out from under the pointer without a mouseout;
  // drop the preview rather than leave it pointing at the wrong card.
  container.addEventListener(
    'scroll',
    () => {
      if (activeRow) clear(activeRow);
    },
    true
  );

  // Touch has no hover phase, so a tap on a name opens the full-screen preview.
  // A tap on a control inside the row (e.g. remove) keeps its own behaviour.
  container.addEventListener('click', (event) => {
    if (isHoverCapable()) return;
    const target = event.target;
    if (target instanceof Element && target.closest('button')) return;
    const row = rowFrom(event);
    if (!row) return;
    preview(row, event, { modal: true });
  });

  attached.add(container);
}
