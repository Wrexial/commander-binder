// src/ui/components/bulkNameInput.js
import { buildPrintingIndex, resolveMissingCards } from './cardLookup.js';
import { createCardNameInput } from './cardNameInput.js';
import { attachCardPreview } from './cardPreview.js';

/**
 * The textarea + preview pair shared by the "Add Cards" and "Bulk Check Cards"
 * modals. Both accept one card name per line, resolve names the loaded store is
 * missing against the all-cards catalog (falling back to a live lookup), and
 * preview the matches with the shared card preview.
 *
 * The printing index and the set of names already looked up live are owned here
 * so the two modals can't drift apart; callers keep their own rendering logic.
 *
 * @param {object} config
 * @param {string} config.placeholder
 * @param {string} config.ariaLabel
 * @param {() => void} config.onChange Called after an autocomplete pick fills
 *   the textarea (which does not fire an `input` event).
 * @returns {{
 *   input: object,
 *   preview: HTMLElement,
 *   printingIndex: Map<string, object>,
 *   attemptedNames: Set<string>,
 *   resolveMissing: () => Promise<unknown>,
 * }}
 */
export function createBulkNameInput({ placeholder, ariaLabel, onChange }) {
  const printingIndex = buildPrintingIndex();
  /** Names already looked up live, so a typo isn't re-fetched every pass. */
  const attemptedNames = new Set();

  const input = createCardNameInput({ placeholder, ariaLabel, onChange });

  const preview = document.createElement('div');
  preview.className = 'bulk-preview';
  attachCardPreview(preview);

  /** Resolve pasted names the loaded store doesn't have (catalog/live lookup). */
  function resolveMissing() {
    return resolveMissingCards({
      text: input.textArea.value,
      nameIndex: input.nameIndex,
      printingIndex,
      attemptedNames,
    });
  }

  return { input, preview, printingIndex, attemptedNames, resolveMissing };
}
