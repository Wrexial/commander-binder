// src/ui/binderBuilder.js
/**
 * The Binder Builder editor. Renders one page of a user-authored binder as a
 * grid of pockets; each pocket can hold a card printing or sit empty.
 *
 * Card tiles are the same elements the browse grid uses (`createCardElement`),
 * so ownership toggles, printing cycling, wishlist and the preview all keep
 * working through the shared `cardInteractions` host. Editing the layout itself
 * is done with explicit per-pocket controls (add / move / remove), which avoids
 * fighting the tap-to-toggle-ownership gesture.
 */
import { cardStore } from '../state/cardStore.js';
import {
  MAX_BINDER_COLUMNS,
  MAX_BINDER_PAGES,
  MAX_BINDER_ROWS,
  assignCardToSlot,
  canEditBinders,
  clearPage,
  clearSlot,
  createBinder,
  deleteBinder,
  getActiveBinder,
  getActiveBinderId,
  getBinders,
  loadBinders,
  moveSlot,
  parseSlotKey,
  setActiveBinder,
  slotKey,
  updateBinder,
} from '../state/bindersState.js';
import { createCardElement, updateCardState } from './cards.js';
import { showToast } from './components/toast.js';
import { createCardPickerModal } from './components/cardPickerModal.js';

/** One page is shown at a time so a 200-page binder stays cheap to render. */
let activePage = 0;
/** Slot key awaiting a destination tap, or null. */
let pendingMove = null;

let refs = null;
let listening = false;

/** A labelled number input for the toolbar. */
function numberField(labelText, className, { min, max, value }) {
  const label = document.createElement('label');
  label.className = 'bb-field bb-field-number';
  label.textContent = labelText;

  const input = document.createElement('input');
  input.type = 'number';
  input.className = className;
  input.min = String(min);
  input.max = String(max);
  input.step = '1';
  input.value = String(value);
  input.inputMode = 'numeric';

  label.appendChild(input);
  return { el: label, input };
}

/** The ⇄ / ✕ controls overlaid on an occupied pocket. */
function createSlotControls() {
  const wrap = document.createElement('div');
  wrap.className = 'binder-slot-controls';

  const move = document.createElement('button');
  move.type = 'button';
  move.className = 'binder-slot-move';
  move.title = 'Move this card';
  move.setAttribute('aria-label', 'Move this card');
  move.textContent = '⇄';

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'binder-slot-remove';
  remove.title = 'Remove this card';
  remove.setAttribute('aria-label', 'Remove this card');
  remove.textContent = '✕';

  wrap.append(move, remove);
  return wrap;
}

/** Build the static toolbar once; `render()` only fills in the values. */
function buildChrome(root) {
  root.innerHTML = '';

  const toolbar = document.createElement('div');
  toolbar.className = 'binder-builder-toolbar';

  const binderField = document.createElement('label');
  binderField.className = 'bb-field';
  binderField.textContent = 'Binder';
  const binderSelect = document.createElement('select');
  binderSelect.className = 'bb-binder-select';
  binderSelect.setAttribute('aria-label', 'Active binder');
  binderField.appendChild(binderSelect);

  const newButton = document.createElement('button');
  newButton.type = 'button';
  newButton.className = 'bb-new';
  newButton.textContent = '+ New';

  const nameField = document.createElement('label');
  nameField.className = 'bb-field';
  nameField.textContent = 'Name';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'bb-name';
  nameInput.setAttribute('aria-label', 'Binder name');
  nameInput.maxLength = 80;
  nameField.appendChild(nameInput);

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'bb-delete danger';
  deleteButton.textContent = 'Delete';

  // Whether the binder appears on the owner's public share link.
  const publicField = document.createElement('label');
  publicField.className = 'bb-field bb-field-toggle';
  const publicInput = document.createElement('input');
  publicInput.type = 'checkbox';
  publicInput.className = 'bb-public';
  publicInput.setAttribute('aria-label', 'Show this binder on my share link');
  const publicText = document.createElement('span');
  publicText.textContent = 'Public';
  publicField.append(publicInput, publicText);

  const dims = document.createElement('div');
  dims.className = 'bb-dims';
  const columns = numberField('Columns', 'bb-columns', {
    min: 1,
    max: MAX_BINDER_COLUMNS,
    value: 3,
  });
  const rows = numberField('Rows', 'bb-rows', { min: 1, max: MAX_BINDER_ROWS, value: 3 });
  const pages = numberField('Pages', 'bb-pages', { min: 1, max: MAX_BINDER_PAGES, value: 1 });
  dims.append(columns.el, rows.el, pages.el);

  toolbar.append(binderField, newButton, nameField, deleteButton, publicField, dims);

  const nav = document.createElement('div');
  nav.className = 'binder-builder-nav';
  const prevButton = document.createElement('button');
  prevButton.type = 'button';
  prevButton.className = 'bb-prev';
  prevButton.textContent = '‹ Prev';
  const pageLabel = document.createElement('span');
  pageLabel.className = 'bb-page-label';
  const nextButton = document.createElement('button');
  nextButton.type = 'button';
  nextButton.className = 'bb-next';
  nextButton.textContent = 'Next ›';
  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.className = 'bb-clear-page';
  clearButton.textContent = 'Clear page';
  nav.append(prevButton, pageLabel, nextButton, clearButton);

  const status = document.createElement('div');
  status.className = 'bb-status';
  status.hidden = true;

  const statusText = document.createElement('span');
  const cancelMove = document.createElement('button');
  cancelMove.type = 'button';
  cancelMove.className = 'bb-cancel-move';
  cancelMove.textContent = 'Cancel';
  status.append(statusText, cancelMove);

  const pageEl = document.createElement('div');
  pageEl.className = 'binder-page';

  const hint = document.createElement('p');
  hint.className = 'binder-builder-hint';
  hint.textContent =
    'Tap an empty pocket to add a card, ⇄ to move one, ✕ to remove it. Card taps still mark owned.';

  const empty = document.createElement('p');
  empty.className = 'binder-builder-empty';
  empty.hidden = true;

  root.append(toolbar, nav, status, pageEl, empty, hint);

  refs = {
    binderSelect,
    newButton,
    nameInput,
    deleteButton,
    publicInput,
    columns: columns.input,
    rows: rows.input,
    pages: pages.input,
    prevButton,
    pageLabel,
    nextButton,
    clearButton,
    status,
    statusText,
    cancelMove,
    pageEl,
    hint,
    empty,
  };

  wireChrome();
}

/** Attach the toolbar listeners (once; the elements are never rebuilt). */
function wireChrome() {
  if (!refs || refs.wired) return;
  refs.wired = true;

  refs.binderSelect.addEventListener('change', () => {
    pendingMove = null;
    activePage = 0;
    setActiveBinder(refs.binderSelect.value);
  });

  refs.newButton.addEventListener('click', async () => {
    const current = getActiveBinder();
    pendingMove = null;
    activePage = 0;
    const created = await createBinder({
      columns: current?.columns || 3,
      rows: current?.rows || 3,
      pages: current?.pages || 1,
    });
    if (created) showToast('New binder created.', 'success');
  });

  refs.nameInput.addEventListener('change', async () => {
    const binder = getActiveBinder();
    if (!binder) return;
    const name = refs.nameInput.value.trim();
    const clash = getBinders().find(
      (item) => item.id !== binder.id && item.name.toLowerCase() === name.toLowerCase()
    );
    if (!name || clash) {
      // Reject locally so the input can't drift from the stored name.
      refs.nameInput.value = binder.name;
      if (clash) showToast('A binder with that name already exists.', 'error');
      return;
    }
    await updateBinder(binder.id, { name });
  });

  refs.deleteButton.addEventListener('click', async () => {
    const binder = getActiveBinder();
    if (!binder) return;
    const ok =
      typeof window.confirm !== 'function' ||
      window.confirm(`Delete “${binder.name}”? Its cards will be removed from this binder.`);
    if (!ok) return;
    pendingMove = null;
    activePage = 0;
    await deleteBinder(binder.id);
  });

  refs.publicInput.addEventListener('change', async () => {
    const binder = getActiveBinder();
    if (!binder) return;
    await updateBinder(binder.id, { isPublic: refs.publicInput.checked });
  });

  const onDimChange = () => {
    const binder = getActiveBinder();
    if (!binder) return;
    pendingMove = null;
    updateBinder(binder.id, {
      columns: refs.columns.value,
      rows: refs.rows.value,
      pages: refs.pages.value,
    });
  };
  refs.columns.addEventListener('change', onDimChange);
  refs.rows.addEventListener('change', onDimChange);
  refs.pages.addEventListener('change', onDimChange);

  refs.prevButton.addEventListener('click', () => goToPage(activePage - 1));
  refs.nextButton.addEventListener('click', () => goToPage(activePage + 1));

  refs.clearButton.addEventListener('click', async () => {
    const binder = getActiveBinder();
    if (!binder) return;
    pendingMove = null;
    await clearPage(binder.id, activePage);
    showToast(`Page ${activePage + 1} cleared.`, 'success');
  });

  refs.cancelMove.addEventListener('click', () => {
    pendingMove = null;
    render();
  });
}

function goToPage(page) {
  const binder = getActiveBinder();
  if (!binder) return;
  activePage = Math.min(binder.pages - 1, Math.max(0, page));
  pendingMove = null;
  render();
}

/**
 * Open the picker for a specific pocket. The picker is built fresh each time so
 * its global Escape/focus listeners only exist while it is actually open.
 */
function openPickerForSlot(key) {
  const binder = getActiveBinder();
  if (!binder) return;
  const parsed = parseSlotKey(key);

  const picker = createCardPickerModal({
    onPick: (card) => {
      const current = getActiveBinder();
      if (current) assignCardToSlot(current.id, key, card.id);
    },
    onRemove: () => {
      const current = getActiveBinder();
      if (current) clearSlot(current.id, key);
    },
  });

  picker.show({
    title: parsed
      ? `Page ${parsed.page + 1}, row ${parsed.row + 1}, column ${parsed.col + 1}`
      : 'Add a card',
    showRemove: Boolean(binder.slots[key]),
  });
}

/** Delegated pocket clicks: move, remove, or open the picker. */
function handlePageClick(event) {
  const slot = event.target.closest('.binder-slot');
  if (!slot) return;
  const binder = getActiveBinder();
  if (!binder) return;
  // A share-link view is read-only; card clicks still reach `cardInteractions`.
  if (!canEditBinders()) return;
  const key = slot.dataset.slot;

  if (pendingMove) {
    event.preventDefault();
    event.stopPropagation();
    const from = pendingMove;
    pendingMove = null;
    moveSlot(binder.id, from, key);
    return;
  }

  if (event.target.closest('.binder-slot-remove')) {
    event.preventDefault();
    clearSlot(binder.id, key);
    return;
  }

  if (event.target.closest('.binder-slot-move')) {
    event.preventDefault();
    pendingMove = key;
    render();
    return;
  }

  if (event.target.closest('.binder-slot-add')) {
    event.preventDefault();
    openPickerForSlot(key);
  }
  // A click that landed on the card tile is left to `cardInteractions`.
}

/** Rebuild the toolbar values and the current page's pockets. */
export function render() {
  if (!refs) return;
  const binder = getActiveBinder();
  if (!binder) {
    refs.pageEl.replaceChildren();
    refs.empty.hidden = false;
    refs.empty.textContent = canEditBinders()
      ? 'No binders yet — create one to get started.'
      : 'No binders have been shared yet.';
    return;
  }
  refs.empty.hidden = true;

  activePage = Math.min(binder.pages - 1, Math.max(0, activePage));

  // Binder picker (rebuilt each render so renamed binders stay in sync).
  refs.binderSelect.replaceChildren();
  for (const item of getBinders()) {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.name;
    refs.binderSelect.appendChild(option);
  }
  refs.binderSelect.value = getActiveBinderId() || '';

  refs.nameInput.value = binder.name;
  refs.columns.value = String(binder.columns);
  refs.rows.value = String(binder.rows);
  refs.pages.value = String(binder.pages);
  refs.publicInput.checked = binder.isPublic;
  refs.pageLabel.textContent = `Page ${activePage + 1} / ${binder.pages}`;
  refs.prevButton.disabled = activePage === 0;
  refs.nextButton.disabled = activePage >= binder.pages - 1;

  // A share-link view hides every editing control and leaves plain pockets.
  const editable = canEditBinders();
  refs.newButton.hidden = !editable;
  refs.deleteButton.hidden = !editable;
  refs.nameInput.disabled = !editable;
  refs.columns.disabled = !editable;
  refs.rows.disabled = !editable;
  refs.pages.disabled = !editable;
  refs.publicInput.disabled = !editable;
  refs.clearButton.hidden = !editable;
  refs.hint.textContent = editable
    ? 'Tap an empty pocket to add a card, ⇄ to move one, ✕ to remove it. Card taps still mark owned.'
    : 'View only — tap a card to preview it (←/→ or J/K to move through the grid).';

  if (pendingMove) {
    refs.status.hidden = false;
    refs.statusText.textContent = 'Choose the destination pocket.';
  } else {
    refs.status.hidden = true;
  }

  // Pockets
  refs.pageEl.style.setProperty('--binder-columns', String(binder.columns));
  refs.pageEl.replaceChildren();

  for (let row = 0; row < binder.rows; row++) {
    for (let col = 0; col < binder.columns; col++) {
      const key = slotKey(activePage, row, col);
      const slot = document.createElement('div');
      slot.className = 'binder-slot';
      slot.dataset.slot = key;
      if (pendingMove === key) slot.classList.add('is-move-source');
      if (pendingMove) slot.classList.add('is-drop-target');

      const printingId = binder.slots[key];
      const card = printingId ? cardStore.getByPrintingId(printingId) : null;

      if (printingId && card) {
        slot.classList.add('is-filled');
        const index = activePage * binder.columns * binder.rows + row * binder.columns + col;
        const tile = createCardElement(card, index);
        tile.dataset.cardIndex = String(index);
        updateCardState(tile);
        slot.append(tile);
        if (editable) slot.appendChild(createSlotControls());
      } else if (printingId) {
        // The stored printing is not in the loaded subset (e.g. the bulk data
        // refreshed); keep the pocket visible and removable.
        slot.classList.add('is-filled', 'is-unknown');
        const unknown = document.createElement('span');
        unknown.className = 'binder-slot-unknown';
        unknown.textContent = 'Card unavailable';
        slot.append(unknown);
        if (editable) slot.appendChild(createSlotControls());
      } else if (editable) {
        const add = document.createElement('button');
        add.type = 'button';
        add.className = 'binder-slot-add';
        add.setAttribute('aria-label', `Add a card to page ${activePage + 1} row ${row + 1}`);
        add.textContent = '+';
        slot.appendChild(add);
      }

      refs.pageEl.appendChild(slot);
    }
  }
}

/**
 * Mount the Binder Builder into `root`.
 * @param {HTMLElement} root
 */
export async function initBinderBuilder(root) {
  await loadBinders();
  buildChrome(root);
  refs.pageEl.addEventListener('click', handlePageClick);
  render();

  if (!listening) {
    listening = true;
    document.addEventListener('binders:changed', render);
  }
}

/** Tear down the document listener (tests). */
export function teardownBinderBuilder() {
  if (listening) document.removeEventListener('binders:changed', render);
  listening = false;
  refs = null;
  pendingMove = null;
  activePage = 0;
}
