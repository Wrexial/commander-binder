// src/state/preferredPrintings.js
/**
 * The user's chosen printing for each card, so the grid keeps showing the art
 * they picked instead of resetting to the cheapest printing.
 *
 * Stored as a card-name -> printing-id map, so a card can only ever have one
 * preferred printing (picking a different printing of the same name replaces
 * the previous choice). The map lives in `cardSettings`, which localStorage
 * persists and `settingsSync` mirrors to the account, so the choice follows the
 * user across devices.
 */
import { MAX_PREFERRED_PRINTINGS, getSetting, setSetting } from './cardSettings.js';
import { cardStore, primaryName } from './cardStore.js';
import { cheapestPrinting } from '../utils/printings.js';

/** The stored name -> printing-id map (defensively copied to a plain object). */
export function getPreferredPrintings() {
  const map = getSetting('preferredPrintings');
  return map && typeof map === 'object' && !Array.isArray(map) ? map : {};
}

/**
 * The saved printing for a card's name, or null when the user has not chosen
 * one (or the chosen printing has not loaded yet).
 *
 * @param {string|object} cardOrName
 * @returns {object|null}
 */
export function getPreferredPrinting(cardOrName) {
  const id = getPreferredPrintings()[primaryName(cardOrName)];
  if (!id) return null;
  return cardStore.getPrintings(cardOrName).find((printing) => printing.id === id) ?? null;
}

/**
 * The printing the grid should show for a card: the saved one when there is
 * one, otherwise the cheapest printing (version "1"), falling back to the
 * passed card before its printing list has loaded.
 *
 * @param {object|string} cardOrName
 * @returns {object|null}
 */
export function resolveDisplayPrinting(cardOrName) {
  const preferred = getPreferredPrinting(cardOrName);
  if (preferred) return preferred;

  const cheapest = cheapestPrinting(cardStore.getPrintings(cardOrName));
  if (cheapest) return cheapest;

  return typeof cardOrName === 'string' ? null : cardOrName;
}

/**
 * Remember a printing as the chosen one for its card. Re-picking a printing
 * for a name replaces that name's previous entry and moves it to the end; the
 * oldest names are dropped once the cap is reached so the synced settings blob
 * stays small.
 *
 * @param {object} card
 * @returns {boolean} true when a preference was stored
 */
export function rememberPreferredPrinting(card) {
  if (!card?.id) return false;

  const name = primaryName(card);
  // Drop the name's previous pick, then add it last so it counts as most recent.
  const entries = Object.entries(getPreferredPrintings()).filter(([key]) => key !== name);
  entries.push([name, card.id]);
  while (entries.length > MAX_PREFERRED_PRINTINGS) entries.shift();

  try {
    setSetting('preferredPrintings', Object.fromEntries(entries));
  } catch (err) {
    // A storage failure must not break the cycle gesture itself; the in-memory
    // value is already updated, so the choice still holds for this session.
    console.error('Failed to save the preferred printing:', err);
  }
  return true;
}

/** Forget every saved printing preference. */
export function resetPreferredPrintings() {
  try {
    setSetting('preferredPrintings', {});
  } catch (err) {
    console.error('Failed to clear the preferred printings:', err);
  }
}
