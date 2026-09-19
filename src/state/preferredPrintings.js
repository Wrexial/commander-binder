// src/state/preferredPrintings.js
/**
 * The user's chosen printing for each card name, so the grid keeps showing the
 * art they picked instead of resetting to the oldest printing.
 *
 * Only printing ids are stored, so a preference costs ~40 bytes rather than the
 * card name as well, and the matching printing is found in the card store at
 * display time. The list lives in `cardSettings`, which localStorage persists
 * and `settingsSync` mirrors to the account, so the choice follows the user
 * across devices.
 */
import { MAX_PREFERRED_PRINTINGS, getSetting, setSetting } from './cardSettings.js';
import { cardStore } from './cardStore.js';

/** Cached id lookup, rebuilt only when the stored array identity changes. */
let cachedIds = null;
let cachedIdSet = new Set();

function preferredIdSet() {
  const ids = getSetting('preferredPrintings');
  if (ids !== cachedIds) {
    cachedIds = ids;
    cachedIdSet = new Set(Array.isArray(ids) ? ids : []);
  }
  return cachedIdSet;
}

/** Every chosen printing id, oldest choice first. */
export function getPreferredPrintingIds() {
  const ids = getSetting('preferredPrintings');
  return Array.isArray(ids) ? ids : [];
}

/**
 * The saved printing for a card's name, or null when the user has not chosen
 * one (or the chosen printing has not loaded yet).
 *
 * @param {string|object} cardOrName
 * @returns {object|null}
 */
export function getPreferredPrinting(cardOrName) {
  if (preferredIdSet().size === 0) return null;
  return (
    cardStore.getPrintings(cardOrName).find((printing) => cachedIdSet.has(printing.id)) ?? null
  );
}

/**
 * The printing the grid should show for a card: the saved one when there is
 * one, otherwise the card itself (used before its full printing list loads).
 *
 * @param {object} card
 * @returns {object}
 */
export function resolveDisplayPrinting(card) {
  return getPreferredPrinting(card) ?? card;
}

/**
 * Remember a printing as the chosen one for its name. Re-picking an existing
 * printing moves it to the most-recent position; the oldest choices are dropped
 * once the cap is reached so the synced settings blob stays small.
 *
 * @param {object} card
 * @returns {boolean} true when a preference was stored
 */
export function rememberPreferredPrinting(card) {
  if (!card?.id) return false;

  const ids = getPreferredPrintingIds().filter((id) => id !== card.id);
  ids.push(card.id);
  while (ids.length > MAX_PREFERRED_PRINTINGS) ids.shift();

  try {
    setSetting('preferredPrintings', ids);
  } catch (err) {
    // A storage failure must not break the cycle gesture itself; the in-memory
    // value is already updated, so the choice still holds for this session.
    console.error('Failed to save the preferred printing:', err);
  }
  return true;
}
