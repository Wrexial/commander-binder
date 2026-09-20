import { debounce } from '../../utils/debounce.js';
import { showToast } from './toast.js';
import {
  addOwnedCards,
  addWantedCards,
  createCollectionModal,
  createTargetToggle,
  normalizeName,
  previewGroup,
  summaryChip,
} from './collectionModal.js';
import {
  buildTargetOptions,
  resolveTarget,
  binderTargetId,
  listTargetId,
} from './collectionTargets.js';
import {
  buildPrintingIndex,
  findEntryCard,
  isPendingName,
  resolveMissingCards,
} from './cardLookup.js';
import { createCardNameInput } from './cardNameInput.js';
import { attachCardPreview } from './cardPreview.js';
import { parseCollection } from '../../utils/collectionFormats.js';
import { isCardOwned } from '../../state/cardState.js';
import { isCardWanted } from '../../state/wishlistState.js';
import { addCardsToList, createList, isInList } from '../../state/listsState.js';
import {
  addCardsToBinder,
  createBinder,
  getActiveBinder,
  isCardInBinder,
} from '../../state/bindersState.js';
import { updateAllCardStates } from '../cards.js';

const PREVIEW_DEBOUNCE_MS = 250;

/**
 * Build the inline "name a new target" form revealed by a picker action
 * ("+ New list" / "+ New binder"). Hidden until opened.
 *
 * @param {{className: string, placeholder: string, ariaLabel: string}} config
 * @returns {{form: HTMLFormElement, input: HTMLInputElement, cancel: HTMLButtonElement}}
 */
function createNewTargetForm({ className, placeholder, ariaLabel }) {
  const form = document.createElement('form');
  form.className = className;
  form.hidden = true;

  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 60;
  input.placeholder = placeholder;
  input.setAttribute('aria-label', ariaLabel);

  const save = document.createElement('button');
  save.type = 'submit';
  save.className = 'primary';
  save.textContent = 'Create';

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'Cancel';

  form.append(input, save, cancel);
  return { form, input, cancel };
}

/**
 * The combined "Add Cards" modal. Accepts typed names (with autocomplete), a
 * pasted plain list or CSV / Moxfield / Archidekt export, or a file, then adds
 * the not-yet-present matches to the picked target: the collection, the
 * wishlist, or any custom list or binder.
 *
 * @param {{kind?: string}} [options] Initial target id ('owned', 'wishlist',
 *   `list:<id>` or `binder:<id>`).
 * @returns {{ show: () => void, destroy: () => void }}
 */
export function createAddCardsModal({ kind: initialKind = 'owned' } = {}) {
  const byPrinting = buildPrintingIndex();
  /** Names already looked up live, so a typo isn't re-fetched every pass. */
  const attemptedNames = new Set();

  /** Resolve pasted names the loaded store doesn't have (catalog/live lookup). */
  function resolveMissing() {
    return resolveMissingCards({
      text: input.textArea.value,
      nameIndex: input.nameIndex,
      printingIndex: byPrinting,
      attemptedNames,
    });
  }

  /**
   * Resolve a target id to the predicate, action and copy the modal needs.
   * @param {string} id 'owned', 'wishlist', or a custom list id.
   */
  function describeTarget(id) {
    const target = resolveTarget(id);

    if (target.kind === 'wishlist') {
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
    if (target.kind === 'owned') {
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

    if (target.kind === 'binder') {
      return {
        present: (card) => isCardInBinder(target.id, card),
        add: async (cards, message) => {
          await addCardsToBinder(target.id, cards);
          showToast(message, 'success');
          updateAllCardStates();
        },
        presentLabel: `Already in “${target.name}”`,
        skipVerb: 'have in the binder',
        successSuffix: ` to “${target.name}”`,
        title: `Add to “${target.name}”`,
        addLabel: (n) => (n > 0 ? `Add ${n} to binder` : 'Add to binder'),
      };
    }

    return {
      present: (card) => isInList(target.id, card),
      add: async (cards, message) => {
        await addCardsToList(target.id, cards);
        showToast(message, 'success');
        updateAllCardStates();
      },
      presentLabel: `Already in “${target.name}”`,
      skipVerb: 'have in the list',
      successSuffix: ` to “${target.name}”`,
      title: `Add to “${target.name}”`,
      addLabel: (n) => (n > 0 ? `Add ${n} to list` : 'Add to list'),
    };
  }

  const targetOptions = buildTargetOptions();
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
    // Picking a suggestion fills the textarea without an `input` event, so kick
    // the resolver too or the new name would stay "unknown".
    onChange: () => {
      renderPreview();
      runValidation();
    },
  });

  const preview = document.createElement('div');
  preview.className = 'bulk-preview';
  attachCardPreview(preview);

  // Inline "name a new target" forms, revealed by the picker's actions. Only
  // one is shown at a time.
  const newList = createNewTargetForm({
    className: 'target-new-list-form',
    placeholder: 'New list name',
    ariaLabel: 'New list name',
  });
  const newBinder = createNewTargetForm({
    className: 'target-new-binder-form',
    placeholder: 'New binder name',
    ariaLabel: 'New binder name',
  });

  /** Show one create form (hiding the other) and focus its input. */
  function revealCreateForm(form) {
    newList.form.hidden = form !== newList.form;
    newBinder.form.hidden = form !== newBinder.form;
    const input = form === newList.form ? newList.input : newBinder.input;
    input.value = '';
    input.focus();
  }

  const target = createTargetToggle({
    options: targetOptions,
    initial: targetId,
    onChange: applyTarget,
    actions: [
      { id: 'new-list', label: '+ New list', onClick: () => revealCreateForm(newList.form) },
      { id: 'new-binder', label: '+ New binder', onClick: () => revealCreateForm(newBinder.form) },
    ],
  });

  contentArea.append(target.el, newList.form, newBinder.form, toolbar, input.el, preview);

  let categorized = { add: [], present: [], loading: [], unknown: [] };
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
      const id = listTargetId(list.id);
      target.addOption({ id, label: `List: ${list.name}` });
      target.setValue(id);
      newList.form.hidden = true;
      applyTarget(id);
    } catch (err) {
      console.error('Failed to create the list:', err);
      showToast(err.message || 'Could not create the list.', 'error');
    }
  }

  /** Create a binder from the inline form, add it to the picker and select it. */
  async function handleCreateBinder(name) {
    const trimmed = String(name || '').trim();
    if (!trimmed) return;

    try {
      // Match the Binder Builder's own "+ New": inherit the active binder's
      // layout, else fall back to small defaults.
      const current = getActiveBinder();
      const binder = await createBinder({
        name: trimmed,
        columns: current?.columns || 3,
        rows: current?.rows || 3,
        pages: current?.pages || 1,
      });
      if (!binder) return;
      const id = binderTargetId(binder.id);
      target.addOption({ id, label: `Binder: ${binder.name}` });
      target.setValue(id);
      newBinder.form.hidden = true;
      applyTarget(id);
    } catch (err) {
      console.error('Failed to create the binder:', err);
      showToast(err.message || 'Could not create the binder.', 'error');
    }
  }

  /**
   * Resolve parsed entries to store cards, split into new / present / still
   * loading / unknown. A real card that just hasn't hydrated yet stays in
   * `loading` so it is never reported as "not found" mid-lookup.
   */
  function categorize() {
    const { entries } = parseCollection(input.textArea.value);
    const seenIds = new Set();
    const seenNames = new Set();
    const add = [];
    const present = [];
    const loading = [];
    const unknown = [];

    for (const entry of entries) {
      const card = findEntryCard(entry, input.nameIndex, byPrinting);
      if (!card) {
        const key = normalizeName(entry.name);
        if (!key || seenNames.has(key)) continue;
        seenNames.add(key);
        if (isPendingName(entry, attemptedNames)) loading.push(entry.name);
        else unknown.push(entry.name);
        continue;
      }
      if (seenIds.has(card.id)) continue;
      seenIds.add(card.id);

      if (config.present(card)) present.push(card);
      else add.push(card);
    }

    return { add, present, loading, unknown };
  }

  function updatePrimary() {
    // While names are still resolving and nothing is addable yet, say so rather
    // than offering a disabled "Add cards" button.
    if (categorized.loading.length > 0 && categorized.add.length === 0) {
      primaryButton.textContent = 'Loading…';
      primaryButton.disabled = true;
      return;
    }

    const count = categorized.add.length;
    primaryButton.textContent = config.addLabel(count);
    primaryButton.disabled = count === 0 || confirming;
  }

  function renderPreview() {
    categorized = categorize();
    const { add, present, loading, unknown } = categorized;

    if (add.length + present.length + loading.length + unknown.length === 0) {
      preview.innerHTML = '<p class="bulk-empty">Nothing to add yet.</p>';
      updatePrimary();
      return;
    }

    preview.innerHTML = `
            <div class="bulk-summary">
                ${summaryChip('missing', 'Will add', add.length)}
                ${summaryChip('owned', config.presentLabel, present.length)}
                ${loading.length > 0 ? summaryChip('pending', 'Loading', loading.length) : ''}
                ${summaryChip('unknown', 'Not found', unknown.length)}
            </div>
            <div class="bulk-groups">
                ${previewGroup('missing', 'Will add', add)}
                ${previewGroup('owned', config.presentLabel, present)}
                ${previewGroup('pending', 'Loading…', loading)}
                ${previewGroup('unknown', 'Not found', unknown)}
            </div>`;
    updatePrimary();
  }

  async function handleAdd() {
    if (confirming) return;

    await resolveMissing();
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
    await resolveMissing();
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
      runValidation();
    } catch (err) {
      console.error('Failed to read the file:', err);
      showToast('Could not read that file.', 'error');
    }
  });
  primaryButton.addEventListener('click', handleAdd);
  closeButton.addEventListener('click', close);

  newList.form.addEventListener('submit', (event) => {
    event.preventDefault();
    handleCreateList(newList.input.value);
  });
  newList.cancel.addEventListener('click', () => {
    newList.form.hidden = true;
  });
  newBinder.form.addEventListener('submit', (event) => {
    event.preventDefault();
    handleCreateBinder(newBinder.input.value);
  });
  newBinder.cancel.addEventListener('click', () => {
    newBinder.form.hidden = true;
  });

  function show() {
    shell.show();
    input.textArea.focus();
  }

  renderPreview();

  return { show, destroy: close };
}
