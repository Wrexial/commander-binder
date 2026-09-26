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
import { cardStore, primaryName } from '../state/cardStore.js';
import {
  BINDER_SORT_OPTIONS,
  MAX_BINDER_COLUMNS,
  MAX_BINDER_PAGES,
  MAX_BINDER_ROWS,
  MAX_CARD_QUANTITY,
  applyBinderBulk,
  assignCardToSlot,
  canEditBinders,
  clearPage,
  clearSlot,
  createBinder,
  deleteBinder,
  findBinderMatches,
  getActiveBinder,
  getActiveBinderId,
  getBinder,
  getBinderOwnedSummary,
  getBinderQuantity,
  getBinders,
  getSlotQuantity,
  isBinderCardOwned,
  isSlotFoil,
  loadBinders,
  moveCardToFirstEmptySlot,
  moveSlot,
  parseSlotKey,
  resizeBinder,
  setActiveBinder,
  setSlotQuantity,
  slotKey,
  sortBinder,
  toggleBinderOwned,
  toggleSlotFoil,
  updateBinder,
} from '../state/bindersState.js';
import { createCardElement, updateCardState } from './cards.js';
import { showToast } from './components/toast.js';
import { createCardPickerModal } from './components/cardPickerModal.js';
import { createPrintingPickerModal } from './components/printingPickerModal.js';
import { confirmDialog } from './components/confirmDialog.js';
import {
  ensurePrintingsLoaded,
  hydrateCardsByIds,
  loadPrintingsForNames,
} from '../api/cardSearch.js';
import { withLoading } from './loadingIndicator.js';
import { resolveCatalogName } from '../state/cardCatalog.js';

/** One page is shown at a time so a 200-page binder stays cheap to render. */
let activePage = 0;
/** Slot key awaiting a destination tap, or null. */
let pendingMove = null;
/** Current matches for the find box, in slot order. */
let searchMatches = [];
/** Index of the last match jumped to with Enter (Enter cycles). */
let searchCursor = -1;
/** Slot key briefly highlighted after jumping to a search match. */
let highlightSlot = null;
let highlightTimer = null;
/** True while the binder is in multi-select bulk-edit mode. */
let bulkMode = false;
/** Selected pocket keys while in bulk-edit mode. */
const bulkSelection = new Set();

/**
 * Most pocket columns the editor displays on phones. Purely visual: the binder's
 * stored `columns`/`rows` are unchanged, so cards are never reflowed or spilled.
 */
const MOBILE_BINDER_COLUMNS = 3;

let refs = null;
let listening = false;
/** True while a hydration pass is fetching this page's cards. */
let hydrationInFlight = false;

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

/**
 * The per-pocket copy count. Editable pockets get a − / input / + stepper; a
 * read-only view shows a static ×N badge only when there is more than one.
 */
function createQuantityControl(quantity, editable) {
  if (!editable && quantity <= 1) return null;

  const wrap = document.createElement('div');
  wrap.className = 'binder-slot-qty';
  if (quantity > 1) wrap.classList.add('has-quantity');

  if (!editable) {
    const value = document.createElement('span');
    value.className = 'binder-slot-qty-value';
    value.textContent = `×${quantity}`;
    wrap.appendChild(value);
    return wrap;
  }

  const dec = document.createElement('button');
  dec.type = 'button';
  dec.className = 'binder-slot-qty-dec';
  dec.textContent = '−';
  dec.title = 'One fewer copy';
  dec.setAttribute('aria-label', 'One fewer copy');
  dec.disabled = quantity <= 1;

  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'binder-slot-qty-input';
  input.min = '1';
  input.max = String(MAX_CARD_QUANTITY);
  input.step = '1';
  input.inputMode = 'numeric';
  input.value = String(quantity);
  input.setAttribute('aria-label', 'Copies in this pocket');

  const inc = document.createElement('button');
  inc.type = 'button';
  inc.className = 'binder-slot-qty-inc';
  inc.textContent = '+';
  inc.title = 'One more copy';
  inc.setAttribute('aria-label', 'One more copy');
  inc.disabled = quantity >= MAX_CARD_QUANTITY;

  wrap.append(dec, input, inc);
  return wrap;
}

/** Append the quantity control when there is one to show. */
function appendQuantityControl(slot, binder, key, editable) {
  const control = createQuantityControl(getSlotQuantity(binder.id, key), editable);
  if (control) slot.appendChild(control);
}

/** The selection tick shown on a filled pocket in bulk-edit mode. */
function createBulkSelectMark(selected) {
  const mark = document.createElement('span');
  mark.className = 'binder-slot-select';
  mark.setAttribute('aria-hidden', 'true');
  mark.textContent = selected ? '✓' : '';
  return mark;
}

/**
 * The Foil/Not foil tag on a filled pocket. A button when editable, a static
 * badge in a share view.
 */
function createFoilControl(foil, editable) {
  const el = document.createElement(editable ? 'button' : 'span');
  el.className = `binder-slot-foil ${foil ? 'is-foil' : 'is-nonfoil'}`;
  el.textContent = foil ? 'Foil' : 'Not foil';
  if (editable) {
    el.type = 'button';
    const label = foil ? 'Mark as not foil' : 'Mark as foil';
    el.title = label;
    el.setAttribute('aria-label', label);
    el.setAttribute('aria-pressed', String(foil));
  }
  return el;
}

/**
 * The Owned/Missing control on a filled pocket. It reflects the binder's own
 * state (not the account collection) and, when editable, is a button that
 * toggles it.
 */
function createOwnedStatusControl(owned, editable) {
  const el = document.createElement(editable ? 'button' : 'span');
  el.className = `binder-slot-owned ${owned ? 'is-owned' : 'is-missing'}`;
  el.textContent = owned ? 'Owned' : 'Missing';
  if (editable) {
    el.type = 'button';
    const label = owned ? 'Mark as missing in this binder' : 'Mark as owned in this binder';
    el.title = label;
    el.setAttribute('aria-label', label);
    el.setAttribute('aria-pressed', String(owned));
  }
  return el;
}

/**
 * The front-face name a pocket's card is tracked under (loaded card, else the
 * all-cards catalog), or null while neither is available.
 */
function slotCardName(printingId) {
  const card = cardStore.getByPrintingId(printingId);
  return card ? primaryName(card) : resolveCatalogName(printingId);
}

/** The ⇄ / ✕ / ≡ controls overlaid on an occupied pocket. */
function createSlotControls() {
  const wrap = document.createElement('div');
  wrap.className = 'binder-slot-controls';

  const printings = document.createElement('button');
  printings.type = 'button';
  printings.className = 'binder-slot-printings';
  printings.title = 'Choose printing';
  printings.setAttribute('aria-label', 'Choose printing');
  printings.textContent = '≡';

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

  wrap.append(printings, move, remove);
  return wrap;
}

/** Build the static toolbar once; `render()` only fills in the values. */
function buildChrome(root) {
  root.innerHTML = '';

  // Segmented switcher at the very top: one tab per binder.
  const binderTabs = document.createElement('div');
  binderTabs.className = 'binder-tabs';
  binderTabs.setAttribute('role', 'tablist');
  binderTabs.setAttribute('aria-label', 'Binders');

  const toolbar = document.createElement('div');
  toolbar.className = 'binder-builder-toolbar';

  const newButton = document.createElement('button');
  newButton.type = 'button';
  newButton.className = 'bb-new';
  newButton.textContent = '+ New';

  const tabsRow = document.createElement('div');
  tabsRow.className = 'binder-tabs-row';
  tabsRow.append(binderTabs, newButton);

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

  // An action menu, not a stored setting: picking an order reflows the pockets
  // once and then resets to the placeholder.
  const sortField = document.createElement('label');
  sortField.className = 'bb-field';
  sortField.textContent = 'Arrange';
  const sortSelect = document.createElement('select');
  sortSelect.className = 'bb-sort';
  sortSelect.setAttribute('aria-label', 'Sort binder cards');
  const sortPlaceholder = document.createElement('option');
  sortPlaceholder.value = '';
  sortPlaceholder.textContent = 'Sort…';
  sortSelect.appendChild(sortPlaceholder);
  for (const option of BINDER_SORT_OPTIONS) {
    const el = document.createElement('option');
    el.value = option.id;
    el.textContent = option.label;
    sortSelect.appendChild(el);
  }
  sortField.appendChild(sortSelect);

  toolbar.append(nameField, deleteButton, publicField, sortField, dims);

  // Find box: filters the binder's pockets and jumps to a hit.
  const search = document.createElement('div');
  search.className = 'binder-search';
  const searchRow = document.createElement('div');
  searchRow.className = 'binder-search-row';
  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.className = 'bb-search-input';
  searchInput.placeholder = 'Find a card — name, set code or number';
  searchInput.setAttribute('aria-label', 'Find a card in this binder');
  const searchCount = document.createElement('span');
  searchCount.className = 'bb-search-count';
  searchCount.hidden = true;
  searchRow.append(searchInput, searchCount);
  const searchResults = document.createElement('ul');
  searchResults.className = 'bb-search-results';
  searchResults.hidden = true;
  search.append(searchRow, searchResults);

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

  // Quantity count for the active binder, duplicates included.
  const cardCount = document.createElement('span');
  cardCount.className = 'bb-card-count';

  // Binder-scoped owned tally (separate from the account collection).
  const ownedCount = document.createElement('span');
  ownedCount.className = 'bb-owned-count';

  // Multi-select mode for changing owned/foil across many pockets at once.
  const bulkButton = document.createElement('button');
  bulkButton.type = 'button';
  bulkButton.className = 'bb-bulk-toggle';
  bulkButton.textContent = '☑️ Bulk edit';
  bulkButton.setAttribute('aria-pressed', 'false');
  nav.append(prevButton, pageLabel, nextButton, clearButton, cardCount, ownedCount, bulkButton);

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
  pageEl.id = 'binder-page';
  pageEl.setAttribute('role', 'tabpanel');

  const hint = document.createElement('p');
  hint.className = 'binder-builder-hint';
  hint.textContent =
    'Tap an empty pocket to add a card, ⇄ to move one, ✕ to remove it. Card taps still mark owned.';

  const empty = document.createElement('p');
  empty.className = 'binder-builder-empty';
  empty.hidden = true;

  // Floating bucket for the bulk-edit actions; hidden until the mode is on.
  const bulkBar = document.createElement('div');
  bulkBar.className = 'binder-bulk-bar';
  bulkBar.hidden = true;
  const bulkCount = document.createElement('span');
  bulkCount.className = 'binder-bulk-count';
  const bulkOwned = document.createElement('button');
  bulkOwned.type = 'button';
  bulkOwned.className = 'binder-bulk-owned';
  bulkOwned.textContent = 'Mark owned';
  const bulkMissing = document.createElement('button');
  bulkMissing.type = 'button';
  bulkMissing.className = 'binder-bulk-missing';
  bulkMissing.textContent = 'Mark missing';
  const bulkFoil = document.createElement('button');
  bulkFoil.type = 'button';
  bulkFoil.className = 'binder-bulk-foil';
  bulkFoil.textContent = 'Mark foil';
  const bulkNonfoil = document.createElement('button');
  bulkNonfoil.type = 'button';
  bulkNonfoil.className = 'binder-bulk-nonfoil';
  bulkNonfoil.textContent = 'Not foil';
  const bulkSelectPage = document.createElement('button');
  bulkSelectPage.type = 'button';
  bulkSelectPage.className = 'binder-bulk-select-page';
  bulkSelectPage.textContent = 'Select page';
  const bulkClear = document.createElement('button');
  bulkClear.type = 'button';
  bulkClear.className = 'binder-bulk-clear';
  bulkClear.textContent = 'Clear';
  const bulkDone = document.createElement('button');
  bulkDone.type = 'button';
  bulkDone.className = 'binder-bulk-done primary';
  bulkDone.textContent = 'Done';
  bulkBar.append(
    bulkCount,
    bulkOwned,
    bulkMissing,
    bulkFoil,
    bulkNonfoil,
    bulkSelectPage,
    bulkClear,
    bulkDone
  );

  root.append(tabsRow, toolbar, search, nav, status, pageEl, empty, hint, bulkBar);

  refs = {
    binderTabs,
    newButton,
    nameInput,
    deleteButton,
    publicInput,
    sortField,
    sortSelect,
    searchInput,
    searchCount,
    searchResults,
    columns: columns.input,
    rows: rows.input,
    pages: pages.input,
    prevButton,
    pageLabel,
    nextButton,
    clearButton,
    bulkButton,
    bulkBar,
    bulkCount,
    bulkOwned,
    bulkMissing,
    bulkFoil,
    bulkNonfoil,
    bulkSelectPage,
    bulkClear,
    bulkDone,
    cardCount,
    ownedCount,
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
    // Resolve the binder from the tab the user actually sees as active, so the
    // delete always matches what is on screen.
    const activeTab = refs.binderTabs.querySelector('.binder-tab.is-active');
    const binder =
      (activeTab?.dataset.binderId && getBinder(activeTab.dataset.binderId)) || getActiveBinder();
    if (!binder) return;
    const ok = await confirmDialog({
      title: 'Delete binder?',
      message: `Delete “${binder.name}”? Its cards will be removed from this binder.`,
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    pendingMove = null;
    activePage = 0;
    const name = binder.name;
    if (await deleteBinder(binder.id)) showToast(`Deleted “${name}”.`, 'success');
  });

  refs.publicInput.addEventListener('change', async () => {
    const binder = getActiveBinder();
    if (!binder) return;
    await updateBinder(binder.id, { isPublic: refs.publicInput.checked });
  });

  refs.sortSelect.addEventListener('change', async () => {
    const binder = getActiveBinder();
    const sortKey = refs.sortSelect.value;
    // The placeholder option is selected again right after, so "no change" is a
    // no-op and the menu always reads as an action.
    refs.sortSelect.value = '';
    if (!binder || !sortKey) return;
    const label = BINDER_SORT_OPTIONS.find((option) => option.id === sortKey)?.label || sortKey;
    pendingMove = null;
    await sortBinder(binder.id, sortKey);
    showToast(`Sorted by ${label.toLowerCase()}.`, 'success');
  });

  refs.searchInput.addEventListener('input', () => {
    // A new query starts the Enter-cycle over from the top.
    searchCursor = -1;
    runSearch();
  });

  refs.searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      refs.searchInput.value = '';
      runSearch();
      return;
    }
    if (event.key === 'Enter' && searchMatches.length > 0) {
      event.preventDefault();
      searchCursor = (searchCursor + 1) % searchMatches.length;
      jumpToMatch(searchMatches[searchCursor]);
    }
  });

  refs.bulkButton.addEventListener('click', () => setBulkMode(!bulkMode));
  refs.bulkDone.addEventListener('click', () => setBulkMode(false));
  refs.bulkClear.addEventListener('click', () => {
    bulkSelection.clear();
    render();
  });
  refs.bulkSelectPage.addEventListener('click', selectBulkPage);
  refs.bulkOwned.addEventListener('click', () => applyBulk({ owned: true }));
  refs.bulkMissing.addEventListener('click', () => applyBulk({ owned: false }));
  refs.bulkFoil.addEventListener('click', () => applyBulk({ foil: true }));
  refs.bulkNonfoil.addEventListener('click', () => applyBulk({ foil: false }));

  const onDimChange = async () => {
    const binder = getActiveBinder();
    if (!binder) return;
    pendingMove = null;
    const result = await resizeBinder(binder.id, {
      columns: refs.columns.value,
      rows: refs.rows.value,
      pages: refs.pages.value,
    });
    if (result && result.overflow.length > 0) {
      const total = result.overflow.reduce((sum, item) => sum + item.count, 0);
      const names = result.overflow.map((item) => `“${item.name}”`).join(', ');
      showToast(
        `Moved ${total} card${total === 1 ? '' : 's'} to ${names} — they no longer fit.`,
        'warning'
      );
    }
  };
  refs.columns.addEventListener('change', onDimChange);
  refs.rows.addEventListener('change', onDimChange);
  refs.pages.addEventListener('change', onDimChange);

  refs.prevButton.addEventListener('click', () => goToPage(activePage - 1));
  refs.nextButton.addEventListener('click', () => goToPage(activePage + 1));

  // A real tablist: Left/Right/Home/End move between binders (switching, since
  // each tab is also the active view). The list is rebuilt on every switch, so
  // focus the recreated active tab afterwards.
  refs.binderTabs.addEventListener('keydown', (event) => {
    const handled = ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key);
    if (!handled) return;
    const tabs = [...refs.binderTabs.querySelectorAll('.binder-tab')];
    if (tabs.length === 0) return;

    const current = tabs.indexOf(document.activeElement);
    let next = current;
    if (event.key === 'ArrowLeft') next = Math.max(0, current - 1);
    else if (event.key === 'ArrowRight') next = Math.min(tabs.length - 1, current + 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    if (next === current || next < 0 || next >= tabs.length) return;

    event.preventDefault();
    tabs[next].click();
    refs.binderTabs.querySelector('.binder-tab.is-active')?.focus();
  });

  refs.clearButton.addEventListener('click', async () => {
    const binder = getActiveBinder();
    if (!binder) return;
    pendingMove = null;
    const ok = await confirmDialog({
      title: 'Clear page?',
      message: `Remove every card from page ${activePage + 1} of “${binder.name}”?`,
      confirmText: 'Clear page',
      danger: true,
    });
    if (!ok) return;
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

/** Empty the find box and drop its matches/highlight. */
function clearSearch() {
  if (!refs) return;
  refs.searchInput.value = '';
  searchMatches = [];
  searchCursor = -1;
  highlightSlot = null;
  clearTimeout(highlightTimer);
  renderSearchResults();
}

/** Recompute the find box's matches from the current query. */
function runSearch() {
  const binder = getActiveBinder();
  const query = refs?.searchInput.value.trim();
  searchMatches = binder && query ? findBinderMatches(binder.id, query) : [];
  renderSearchResults();
}

/** Paint the match count and the clickable results list. */
function renderSearchResults() {
  if (!refs) return;
  const query = refs.searchInput.value.trim();
  if (!query) {
    refs.searchCount.hidden = true;
    refs.searchResults.hidden = true;
    refs.searchResults.replaceChildren();
    return;
  }

  const total = searchMatches.length;
  refs.searchCount.hidden = false;
  refs.searchCount.textContent =
    total === 0 ? 'No matches' : `${total} match${total === 1 ? '' : 'es'}`;

  refs.searchResults.replaceChildren();
  refs.searchResults.hidden = total === 0;
  if (total === 0) return;

  for (const match of searchMatches.slice(0, 30)) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'bb-search-result';
    button.textContent = `${match.name} — Page ${match.page + 1}, row ${match.row + 1}, col ${match.col + 1}`;
    button.addEventListener('click', () => jumpToMatch(match));
    item.appendChild(button);
    refs.searchResults.appendChild(item);
  }
}

/** Jump to a search match, highlight its pocket and bring it into view. */
function jumpToMatch(match) {
  if (!match || !refs) return;
  pendingMove = null;
  activePage = match.page;
  highlightSlot = match.key;
  render();

  clearTimeout(highlightTimer);
  highlightTimer = setTimeout(() => {
    highlightSlot = null;
    refs?.pageEl.querySelector('.is-search-hit')?.classList.remove('is-search-hit');
  }, 2400);

  const target = refs.pageEl.querySelector(`.binder-slot[data-slot="${match.key}"]`);
  if (typeof target?.scrollIntoView === 'function') {
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}

/** Enter/leave bulk-select mode (leaving drops the selection). */
function setBulkMode(next) {
  bulkMode = Boolean(next);
  pendingMove = null;
  if (!bulkMode) bulkSelection.clear();
  render();
}

/** Toggle one pocket's membership in the bulk selection. */
function toggleBulkSelection(key) {
  if (bulkSelection.has(key)) bulkSelection.delete(key);
  else bulkSelection.add(key);

  // Patch just this pocket instead of a full re-render, so selecting stays snappy.
  const slot = refs.pageEl.querySelector(`.binder-slot[data-slot="${key}"]`);
  if (slot) {
    slot.classList.toggle('is-selected', bulkSelection.has(key));
    const mark = slot.querySelector('.binder-slot-select');
    if (mark) mark.textContent = bulkSelection.has(key) ? '✓' : '';
  }
  updateBulkBar();
}

/** Select every filled pocket on the visible page. */
function selectBulkPage() {
  const binder = getActiveBinder();
  if (!binder) return;
  for (let row = 0; row < binder.rows; row++) {
    for (let col = 0; col < binder.columns; col++) {
      const key = slotKey(activePage, row, col);
      if (binder.slots[key]) bulkSelection.add(key);
    }
  }
  render();
}

/** Apply an owned/foil patch to the whole selection in one write. */
async function applyBulk(patch) {
  const binder = getActiveBinder();
  if (!binder || bulkSelection.size === 0) return;

  const count = bulkSelection.size;
  await applyBinderBulk(binder.id, [...bulkSelection], patch);
  if (patch.owned != null) {
    showToast(
      `Marked ${count} card${count === 1 ? '' : 's'} ${patch.owned ? 'owned' : 'missing'}.`,
      'success'
    );
  } else {
    showToast(
      `Marked ${count} pocket${count === 1 ? '' : 's'} ${patch.foil ? 'foil' : 'not foil'}.`,
      'success'
    );
  }
  updateBulkBar();
}

/** Sync the bulk toggle/bar with the current mode and selection. */
function updateBulkBar() {
  if (!refs) return;
  refs.bulkBar.hidden = !bulkMode;
  refs.bulkButton.classList.toggle('is-active', bulkMode);
  refs.bulkButton.setAttribute('aria-pressed', String(bulkMode));
  refs.bulkCount.textContent = `${bulkSelection.size} selected`;

  const disabled = bulkSelection.size === 0;
  refs.bulkOwned.disabled = disabled;
  refs.bulkMissing.disabled = disabled;
  refs.bulkFoil.disabled = disabled;
  refs.bulkNonfoil.disabled = disabled;
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

/**
 * Persist a pocket's printing after the shared card interactions cycled it.
 * The tile carries `data-binder-slot`; `cardInteractions` does the printing
 * math (it owns the store order) and emits this so we can save that exact
 * printing on the slot instead of the global preferred-printing map.
 */
function handlePrintingChanged(event) {
  const { slotKey: key, printingId } = event.detail || {};
  if (!key || !printingId || !canEditBinders()) return;
  const binder = getActiveBinder();
  if (!binder || !binder.slots[key]) return;
  assignCardToSlot(binder.id, key, printingId);
}

/**
 * Open the scrollable printing picker for a pocket and save the chosen version.
 * Loads the card's full printing list first, so a card with dozens of printings
 * shows them all.
 */
async function openPrintingPicker(key) {
  const binder = getActiveBinder();
  if (!binder) return;

  const printingId = binder.slots[key];
  const card = printingId ? cardStore.getByPrintingId(printingId) : null;
  if (!card) return;

  await ensurePrintingsLoaded(card.name);
  const printings = cardStore.getPrintings(card.name);
  if (printings.length === 0) {
    showToast('No printings are available for that card yet.', 'warning');
    return;
  }

  const picker = createPrintingPickerModal({
    card,
    printings,
    currentId: printingId,
    onPick: (printing) => {
      const current = getActiveBinder();
      if (current) assignCardToSlot(current.id, key, printing.id);
    },
  });
  picker.show();
}

/** Delegated pocket clicks: move, remove, choose a printing, or open the picker. */
function handlePageClick(event) {
  const slot = event.target.closest('.binder-slot');
  if (!slot) return;
  const binder = getActiveBinder();
  if (!binder) return;
  // A share-link view is read-only; card clicks still reach `cardInteractions`.
  if (!canEditBinders()) return;
  const key = slot.dataset.slot;

  // In bulk mode a tap on a filled pocket toggles its selection and nothing else.
  if (bulkMode) {
    event.preventDefault();
    event.stopPropagation();
    if (binder.slots[key]) toggleBulkSelection(key);
    return;
  }

  if (pendingMove) {
    event.preventDefault();
    event.stopPropagation();
    const from = pendingMove;
    pendingMove = null;
    moveSlot(binder.id, from, key);
    return;
  }

  if (event.target.closest('.binder-slot-owned')) {
    event.preventDefault();
    event.stopPropagation();
    const name = slotCardName(binder.slots[key]);
    if (name) toggleBinderOwned(binder.id, name);
    return;
  }

  if (event.target.closest('.binder-slot-foil')) {
    event.preventDefault();
    event.stopPropagation();
    toggleSlotFoil(binder.id, key);
    return;
  }

  // Quantity stepper. A click inside the number input is left to the input;
  // its `change` handler commits the typed value.
  const qtyStep = event.target.closest('.binder-slot-qty-inc, .binder-slot-qty-dec');
  if (qtyStep) {
    event.preventDefault();
    event.stopPropagation();
    const delta = qtyStep.classList.contains('binder-slot-qty-inc') ? 1 : -1;
    setSlotQuantity(binder.id, key, getSlotQuantity(binder.id, key) + delta);
    return;
  }
  if (event.target.closest('.binder-slot-qty')) return;

  if (event.target.closest('.binder-slot-remove')) {
    event.preventDefault();
    clearSlot(binder.id, key);
    return;
  }

  if (event.target.closest('.binder-slot-printings')) {
    event.preventDefault();
    openPrintingPicker(key);
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

/** Commit a typed pocket count (change fires on blur/Enter). */
function handlePageChange(event) {
  const input = event.target.closest('.binder-slot-qty-input');
  if (!input) return;
  const slot = input.closest('.binder-slot');
  const binder = getActiveBinder();
  if (!slot || !binder || !canEditBinders()) return;
  setSlotQuantity(binder.id, slot.dataset.slot, input.value);
}

/** The stored printing ids of the current page that need a card object. */
function visibleSlotIds(binder) {
  const ids = [];
  for (let row = 0; row < binder.rows; row++) {
    for (let col = 0; col < binder.columns; col++) {
      const id = binder.slots[slotKey(activePage, row, col)];
      if (id) ids.push(id);
    }
  }
  return ids;
}

/**
 * Fetch card objects for the current page's pockets that are not in `cardStore`
 * (any card, not just the loaded legendary subset) and make sure each card's
 * printing list is available for cycling. Re-renders when something arrived.
 */
async function hydrateVisibleCards() {
  const binder = getActiveBinder();
  if (!binder) return;

  const ids = visibleSlotIds(binder);
  const missing = ids.filter((id) => !cardStore.getByPrintingId(id));
  if (missing.length > 0) {
    await withLoading('Loading cards…', () => hydrateCardsByIds(missing));
    // Re-render if any of the missing cards arrived — including one added by
    // another path (the background legendary warm-up, or a concurrent pass),
    // because `hydrateCardsByIds` only returns what *it* added. Without this the
    // pocket stays on its placeholder even though the card is now in the store.
    if (missing.some((id) => cardStore.getByPrintingId(id))) render();
  }

  const names = new Set();
  for (const id of ids) {
    const card = cardStore.getByPrintingId(id);
    if (card) names.add(card.name);
  }
  if (names.size > 0) {
    // One batched lookup for the whole page, so the version badges fill in
    // without a `/cards/search` per pocket.
    const loaded = await withLoading('Loading printings…', () => loadPrintingsForNames(names));
    if (loaded) render();
  }
}

/** Kick off a hydration pass, coalescing concurrent calls. */
function scheduleHydration() {
  if (hydrationInFlight) return;
  hydrationInFlight = true;
  hydrateVisibleCards()
    .catch((err) => console.error('Failed to hydrate binder cards:', err))
    .finally(() => {
      hydrationInFlight = false;
    });
}

/**
 * Re-render when a background load may have filled a pocket that is still
 * showing its placeholder (e.g. the legendary-creature warm-up, which adds
 * cards to `cardStore` without touching the editor).
 */
export function refreshBinderCards() {
  if (!refs) return;
  if (!refs.pageEl.querySelector('.binder-slot.is-unknown')) return;
  render();
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

  // Binder switcher (rebuilt each render so renamed binders stay in sync).
  refs.binderTabs.replaceChildren();
  const activeBinderId = getActiveBinderId();
  for (const item of getBinders()) {
    const isActive = item.id === activeBinderId;
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = `binder-tab${isActive ? ' is-active' : ''}`;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', String(isActive));
    tab.setAttribute('aria-controls', 'binder-page');
    tab.dataset.binderId = item.id;
    tab.tabIndex = isActive ? 0 : -1;
    tab.textContent = item.name;
    const count = getBinderQuantity(item.id);
    tab.dataset.count = String(count);
    tab.setAttribute('aria-label', `${item.name}, ${count} card${count === 1 ? '' : 's'}`);
    tab.addEventListener('click', () => {
      if (isActive) return;
      const sourceBinderId = getActiveBinderId();
      const movingFrom = pendingMove;
      pendingMove = null;
      activePage = 0;
      // A new binder gets a clean find box and selection.
      clearSearch();
      bulkMode = false;
      bulkSelection.clear();
      setActiveBinder(item.id);
      // While moving, switching binder drops the card in its first empty pocket.
      if (movingFrom && sourceBinderId) {
        moveCardToFirstEmptySlot(sourceBinderId, movingFrom, item.id);
      }
    });
    refs.binderTabs.appendChild(tab);
  }

  // Keep the active binder visible when there are more tabs than fit. Scroll
  // the tab strip itself instead of `scrollIntoView`, which would also scroll
  // the window and yank the page back to the top whenever a re-render happens
  // while the user is scrolled down to the pockets (e.g. changing a printing).
  const activeTab = refs.binderTabs.querySelector('.binder-tab.is-active');
  if (activeTab) {
    const tabRect = activeTab.getBoundingClientRect();
    const stripRect = refs.binderTabs.getBoundingClientRect();
    if (tabRect.left < stripRect.left) {
      refs.binderTabs.scrollLeft += tabRect.left - stripRect.left;
    } else if (tabRect.right > stripRect.right) {
      refs.binderTabs.scrollLeft += tabRect.right - stripRect.right;
    }
  }

  refs.nameInput.value = binder.name;
  refs.columns.value = String(binder.columns);
  refs.rows.value = String(binder.rows);
  refs.pages.value = String(binder.pages);
  refs.publicInput.checked = binder.isPublic;
  refs.pageLabel.textContent = `Page ${activePage + 1} / ${binder.pages}`;
  const owned = getBinderOwnedSummary(binder.id);
  refs.cardCount.textContent = `${owned.total} card${owned.total === 1 ? '' : 's'}`;
  refs.ownedCount.textContent = `${owned.owned} owned · ${owned.missing} missing`;
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
  refs.sortSelect.disabled = !editable;
  refs.sortField.hidden = !editable;
  refs.clearButton.hidden = !editable;
  refs.bulkButton.hidden = !editable;
  // In bulk mode the per-pocket controls become inert so a tap only selects.
  const interactive = editable && !bulkMode;
  refs.hint.textContent = editable
    ? bulkMode
      ? 'Bulk edit — tap pockets to select them, then apply Owned/Missing or Foil changes to the whole selection.'
      : 'Tap an empty pocket to add a card; ⇄ move, ✕ remove, − / + set copies, Foil toggles the finish, and Owned/Missing tracks it in this binder. Use Arrange to sort the binder.'
    : 'View only — tap a card to preview it (←/→ or J/K to move through the grid).';

  if (pendingMove) {
    refs.status.hidden = false;
    refs.statusText.textContent =
      'Choose a pocket, or switch binder to drop it in the first empty one.';
  } else {
    refs.status.hidden = true;
  }

  // Pockets. `--binder-columns` is the physical layout; phones display a capped
  // number of columns so pockets stay readable, without touching the binder's
  // stored columns/rows (so cards never shift or spill).
  refs.pageEl.style.setProperty('--binder-columns', String(binder.columns));
  refs.pageEl.style.setProperty(
    '--binder-columns-mobile',
    String(Math.min(binder.columns, MOBILE_BINDER_COLUMNS))
  );
  refs.pageEl.replaceChildren();

  for (let row = 0; row < binder.rows; row++) {
    for (let col = 0; col < binder.columns; col++) {
      const key = slotKey(activePage, row, col);
      const slot = document.createElement('div');
      slot.className = 'binder-slot';
      slot.dataset.slot = key;
      if (pendingMove === key) slot.classList.add('is-move-source');
      if (highlightSlot === key) slot.classList.add('is-search-hit');
      if (pendingMove) slot.classList.add('is-drop-target');
      if (bulkMode) {
        slot.classList.add('is-selectable');
        if (bulkSelection.has(key)) slot.classList.add('is-selected');
      }

      const printingId = binder.slots[key];
      const card = printingId ? cardStore.getByPrintingId(printingId) : null;

      if (printingId && card) {
        slot.classList.add('is-filled');
        const index = activePage * binder.columns * binder.rows + row * binder.columns + col;
        const tile = createCardElement(card, index, { collection: false });
        tile.dataset.cardIndex = String(index);
        // Marks the tile as owning its exact printing, so the global
        // preferred-printing pass leaves it alone and cycling updates the slot.
        tile.dataset.binderSlot = key;
        updateCardState(tile);
        slot.append(tile);
        appendQuantityControl(slot, binder, key, interactive);
        slot.appendChild(createFoilControl(isSlotFoil(binder.id, key), interactive));
        slot.appendChild(
          createOwnedStatusControl(isBinderCardOwned(binder.id, primaryName(card)), interactive)
        );
        if (interactive) slot.appendChild(createSlotControls());
        if (bulkMode) slot.appendChild(createBulkSelectMark(bulkSelection.has(key)));
      } else if (printingId) {
        // The stored printing is not loaded yet (the background hydration, or
        // the legendary warm-up, is fetching it). Name it via the all-cards
        // catalog when possible so the pocket reads “<Card> loading…”.
        slot.classList.add('is-filled', 'is-unknown');
        const unknown = document.createElement('span');
        unknown.className = 'binder-slot-unknown';
        const name = resolveCatalogName(printingId);
        unknown.textContent = name ? `${name} loading…` : 'Loading card…';
        slot.append(unknown);
        appendQuantityControl(slot, binder, key, interactive);
        slot.appendChild(createFoilControl(isSlotFoil(binder.id, key), interactive));
        if (name) {
          slot.appendChild(
            createOwnedStatusControl(isBinderCardOwned(binder.id, name), interactive)
          );
        }
        if (interactive) slot.appendChild(createSlotControls());
        if (bulkMode) slot.appendChild(createBulkSelectMark(bulkSelection.has(key)));
      } else if (interactive) {
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

  // Any stored card the loaded subset doesn't cover is fetched in the
  // background; it renders on the next pass.
  scheduleHydration();

  // Keep the find results in step with cards that hydrated since the query.
  if (refs.searchInput.value.trim()) runSearch();

  updateBulkBar();
}

/**
 * Mount the Binder Builder into `root`.
 * @param {HTMLElement} root
 * @param {{seed?: boolean}} [options] `seed` creates a default binder when the
 *   caller has none. The Binder Builder page passes `false` and seeds later,
 *   once guest→account merges have settled.
 */
export async function initBinderBuilder(root, { seed = true } = {}) {
  await loadBinders({ seed });
  buildChrome(root);
  refs.pageEl.addEventListener('click', handlePageClick);
  refs.pageEl.addEventListener('change', handlePageChange);
  render();

  if (!listening) {
    listening = true;
    document.addEventListener('binders:changed', render);
    document.addEventListener('binder:printing-changed', handlePrintingChanged);
  }
}

/** Tear down the document listeners (tests). */
export function teardownBinderBuilder() {
  if (listening) {
    document.removeEventListener('binders:changed', render);
    document.removeEventListener('binder:printing-changed', handlePrintingChanged);
  }
  listening = false;
  hydrationInFlight = false;
  refs = null;
  pendingMove = null;
  activePage = 0;
  searchMatches = [];
  searchCursor = -1;
  highlightSlot = null;
  clearTimeout(highlightTimer);
  highlightTimer = null;
  bulkMode = false;
  bulkSelection.clear();
}
