import { debounce } from '../../utils/debounce.js';
import { showToast } from './toast.js';
import {
  addOwnedCards,
  addWantedCards,
  binderIdFromTarget,
  binderTargetId,
  COLLECTION_TARGETS,
  createCollectionModal,
  createTargetToggle,
  isBinderTargetId,
  normalizeName,
  previewGroup,
  summaryChip,
} from './collectionModal.js';
import { createCardNameInput } from './cardNameInput.js';
import { parseCollection } from '../../utils/collectionFormats.js';
import { cardStore } from '../../state/cardStore.js';
import { resolveCatalogPrintingId } from '../../state/cardCatalog.js';
import { hydrateCardsByIds } from '../../api/cardSearch.js';
import { isCardOwned } from '../../state/cardState.js';
import { isCardWanted } from '../../state/wishlistState.js';
import { addCardsToList, createList, getList, getLists, isInList } from '../../state/listsState.js';
import {
  addCardsToBinder,
  getBinder,
  getBinders,
  isCardInBinder,
} from '../../state/bindersState.js';
import { updateAllCardStates } from '../cards.js';

const PREVIEW_DEBOUNCE_MS = 250;

/** One pass over the store: "set:number" (lowercase set) -> exact printing. */
function buildPrintingIndex() {
  const byPrinting = new Map();
  for (const card of cardStore.getAll()) {
    for (const printing of cardStore.getPrintings(card.name)) {
      if (printing.set && printing.collector_number) {
        byPrinting.set(`${printing.set.toLowerCase()}:${printing.collector_number}`, printing);
      }
    }
  }
  return byPrinting;
}

/**
 * The combined "Add Cards" modal. Accepts typed names (with autocomplete), a
 * pasted plain list or CSV / Moxfield / Archidekt export, or a file, then adds
 * the not-yet-present matches to the picked target: the collection, the
 * wishlist, or any custom list.
 *
 * @param {{kind?: string}} [options] Initial target id ('owned', 'wishlist' or a
 *   custom list id).
 * @returns {{ show: () => void, destroy: () => void }}
 */
export function createAddCardsModal({ kind: initialKind = 'owned' } = {}) {
  const byPrinting = buildPrintingIndex();

  /**
   * Merge cards loaded after the index was built (e.g. the all-cards catalog
   * resolving a non-legendary name) into the lookup structures.
   */
  function refreshIndexes() {
    for (const [key, printing] of buildPrintingIndex()) {
      if (!byPrinting.has(key)) byPrinting.set(key, printing);
    }
    for (const card of cardStore.getAll()) {
      const key = normalizeName(card.name);
      if (key && !input.nameIndex.has(key)) input.nameIndex.set(key, card);
    }
  }

  /**
   * Resolve pasted names that aren't in the loaded store but are known to the
   * all-cards catalog, fetching their printings in one batched request. This is
   * what lets the modal add any card, not just ones a binder already hydrated.
   *
   * @returns {Promise<boolean>} whether new cards were loaded
   */
  async function resolveCatalogMatches() {
    const { entries } = parseCollection(input.textArea.value);
    const ids = new Set();

    for (const entry of entries) {
      const raw = normalizeName(entry.raw ?? '');
      const name = normalizeName(entry.name);
      if (input.nameIndex.has(raw) || input.nameIndex.has(name)) continue;
      if (
        entry.setCode &&
        entry.collectorNumber &&
        byPrinting.has(`${entry.setCode}:${entry.collectorNumber}`)
      ) {
        continue;
      }
      const id = resolveCatalogPrintingId(entry.raw ?? '') || resolveCatalogPrintingId(entry.name);
      if (id) ids.add(id);
    }

    if (ids.size === 0) return false;

    const before = cardStore.getAll().length;
    await hydrateCardsByIds([...ids]);
    const changed = cardStore.getAll().length > before;
    if (changed) refreshIndexes();
    return changed;
  }

  /**
   * Resolve a target id to the predicate, action and copy the modal needs.
   * @param {string} id 'owned', 'wishlist', or a custom list id.
   */
  function describeTarget(id) {
    if (id === 'wishlist') {
      return {
        present: isCardWanted,
        add: addWantedCards,
        presentLabel: 'Already wanted',
        skipVerb: 'want',
        successSuffix: ' to your wishlist',
        title: 'Add to Wishlist',
        addLabel: (n) => (n > 0 ? `Add ${n} to wishlist` : 'Add to wishlist'),
      };
    }
    if (id === 'owned') {
      return {
        present: isCardOwned,
        add: addOwnedCards,
        presentLabel: 'Already owned',
        skipVerb: 'own',
        successSuffix: '',
        title: 'Add Cards',
        addLabel: (n) => (n > 0 ? `Add ${n} card${n === 1 ? '' : 's'}` : 'Add cards'),
      };
    }

    if (isBinderTargetId(id)) {
      const binderId = binderIdFromTarget(id);
      const name = getBinder(binderId)?.name || 'binder';
      return {
        present: (card) => isCardInBinder(binderId, card),
        add: async (cards, message) => {
          await addCardsToBinder(binderId, cards);
          showToast(message, 'success');
          updateAllCardStates();
        },
        presentLabel: `Already in “${name}”`,
        skipVerb: 'have in the binder',
        successSuffix: ` to “${name}”`,
        title: `Add to “${name}”`,
        addLabel: (n) => (n > 0 ? `Add ${n} to binder` : 'Add to binder'),
      };
    }

    const name = getList(id)?.name || 'list';
    return {
      present: (card) => isInList(id, card),
      add: async (cards, message) => {
        await addCardsToList(id, cards);
        showToast(message, 'success');
        updateAllCardStates();
      },
      presentLabel: `Already in “${name}”`,
      skipVerb: 'have in the list',
      successSuffix: ` to “${name}”`,
      title: `Add to “${name}”`,
      addLabel: (n) => (n > 0 ? `Add ${n} to list` : 'Add to list'),
    };
  }

  const listOptions = getLists().map((list) => ({ id: list.id, label: list.name }));
  const binderOptions = getBinders().map((binder) => ({
    id: binderTargetId(binder.id),
    label: `Binder: ${binder.name}`,
  }));
  const targetOptions = [...COLLECTION_TARGETS, ...listOptions, ...binderOptions];
  let targetId = targetOptions.some((option) => option.id === initialKind) ? initialKind : 'owned';
  let config = describeTarget(targetId);

  const { shell, close, contentArea, buttons } = createCollectionModal({
    title: config.title,
    subtitle: `Type names, paste a list or a CSV / Moxfield / Archidekt export, or choose a file. Cards you already ${config.skipVerb} are skipped.`,
    actions: [
      { id: 'primary', className: 'primary' },
      { id: 'close', text: 'Close' },
    ],
  });
  const { primary: primaryButton, close: closeButton } = buttons;
  const heading = shell.modal.querySelector('.bulk-modal-header h2');
  const subtitle = shell.modal.querySelector('.bulk-modal-subtitle');

  const toolbar = document.createElement('div');
  toolbar.className = 'transfer-toolbar';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.className = 'transfer-file';
  fileInput.accept = '.csv,.txt,text/csv,text/plain';
  fileInput.setAttribute('aria-label', 'Choose a collection file');
  toolbar.appendChild(fileInput);

  const input = createCardNameInput({
    placeholder: 'One card name per line, or paste a list (Ctrl+Enter to add)',
    ariaLabel: 'Cards to add',
    onChange: () => renderPreview(),
  });

  const preview = document.createElement('div');
  preview.className = 'bulk-preview';

  // Inline "create a new list" form, revealed by the picker's "+ New list".
  const newListForm = document.createElement('form');
  newListForm.className = 'target-new-list-form';
  newListForm.hidden = true;

  const newListInput = document.createElement('input');
  newListInput.type = 'text';
  newListInput.maxLength = 60;
  newListInput.placeholder = 'New list name';
  newListInput.setAttribute('aria-label', 'New list name');

  const newListSave = document.createElement('button');
  newListSave.type = 'submit';
  newListSave.className = 'primary';
  newListSave.textContent = 'Create';

  const newListCancel = document.createElement('button');
  newListCancel.type = 'button';
  newListCancel.textContent = 'Cancel';

  newListForm.append(newListInput, newListSave, newListCancel);

  const target = createTargetToggle({
    options: targetOptions,
    initial: targetId,
    onChange: applyTarget,
    onCreate: () => {
      newListForm.hidden = false;
      newListInput.value = '';
      newListInput.focus();
    },
  });

  contentArea.append(target.el, newListForm, toolbar, input.el, preview);

  let categorized = { add: [], present: [], unknown: [] };
  let confirming = false;

  /** Switch the target and relabel the modal; the parsed list stays put. */
  function applyTarget(next) {
    targetId = next;
    config = describeTarget(next);
    heading.textContent = config.title;
    subtitle.textContent = `Type names, paste a list or a CSV / Moxfield / Archidekt export, or choose a file. Cards you already ${config.skipVerb} are skipped.`;
    renderPreview();
  }

  /** Create a list from the inline form, add it to the picker and select it. */
  async function handleCreateList(name) {
    const trimmed = String(name || '').trim();
    if (!trimmed) return;

    try {
      const list = await createList({ name: trimmed });
      if (!list) return;
      target.addOption({ id: list.id, label: list.name });
      target.setValue(list.id);
      newListForm.hidden = true;
      applyTarget(list.id);
    } catch (err) {
      console.error('Failed to create the list:', err);
      showToast(err.message || 'Could not create the list.', 'error');
    }
  }

  /** Resolve parsed entries to store cards, split into new / present / unknown. */
  function categorize() {
    const { entries } = parseCollection(input.textArea.value);
    const seen = new Set();
    const add = [];
    const present = [];
    const unknown = [];

    for (const entry of entries) {
      let card = null;
      if (entry.setCode && entry.collectorNumber) {
        card = byPrinting.get(`${entry.setCode}:${entry.collectorNumber}`) || null;
      }
      // Prefer the raw pasted name over the quantity-stripped one, so a card
      // whose name genuinely starts with a number still matches.
      card ||= input.nameIndex.get(normalizeName(entry.raw ?? '')) || null;
      card ||= input.nameIndex.get(normalizeName(entry.name)) || null;

      if (!card) {
        unknown.push(entry.name);
        continue;
      }
      if (seen.has(card.id)) continue;
      seen.add(card.id);

      if (config.present(card)) present.push(card);
      else add.push(card);
    }

    return { add, present, unknown };
  }

  function updatePrimary() {
    const count = categorized.add.length;
    primaryButton.textContent = config.addLabel(count);
    primaryButton.disabled = count === 0 || confirming;
  }

  function renderPreview() {
    categorized = categorize();
    const { add, present, unknown } = categorized;

    if (add.length + present.length + unknown.length === 0) {
      preview.innerHTML = '<p class="bulk-empty">Nothing to add yet.</p>';
      updatePrimary();
      return;
    }

    preview.innerHTML = `
            <div class="bulk-summary">
                ${summaryChip('missing', 'Will add', add.length)}
                ${summaryChip('owned', config.presentLabel, present.length)}
                ${summaryChip('unknown', 'Not found', unknown.length)}
            </div>
            <div class="bulk-groups">
                ${previewGroup(
                  'missing',
                  'Will add',
                  add.map((card) => card.name)
                )}
                ${previewGroup(
                  'owned',
                  config.presentLabel,
                  present.map((card) => card.name)
                )}
                ${previewGroup('unknown', 'Not found', unknown)}
            </div>`;
    updatePrimary();
  }

  async function handleAdd() {
    if (confirming) return;

    await resolveCatalogMatches();
    categorized = categorize();
    const { add } = categorized;
    if (add.length === 0) return;

    confirming = true;
    updatePrimary();
    try {
      await config.add(
        add,
        `Added ${add.length} card${add.length === 1 ? '' : 's'}${config.successSuffix}.`
      );
      // Re-render: the added cards now show up under "Already ...".
      renderPreview();
    } catch (err) {
      console.error('Add cards failed:', err);
      showToast('Could not add the cards.', 'error');
    } finally {
      confirming = false;
      updatePrimary();
    }
  }

  // The immediate render uses whatever is already loaded; the debounced pass
  // then resolves any all-cards catalog names and re-renders.
  const runValidation = debounce(async () => {
    await resolveCatalogMatches();
    renderPreview();
  }, PREVIEW_DEBOUNCE_MS);

  input.textArea.addEventListener('input', () => {
    renderPreview();
    runValidation();
  });
  input.textArea.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      handleAdd();
    }
  });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    try {
      input.textArea.value = await file.text();
      renderPreview();
    } catch (err) {
      console.error('Failed to read the file:', err);
      showToast('Could not read that file.', 'error');
    }
  });
  primaryButton.addEventListener('click', handleAdd);
  closeButton.addEventListener('click', close);

  newListForm.addEventListener('submit', (event) => {
    event.preventDefault();
    handleCreateList(newListInput.value);
  });
  newListCancel.addEventListener('click', () => {
    newListForm.hidden = true;
  });

  function show() {
    shell.show();
    input.textArea.focus();
  }

  renderPreview();

  return { show, destroy: close };
}
