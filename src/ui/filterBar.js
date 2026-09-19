// src/ui/filterBar.js
import { debounce } from '../utils/debounce.js';
import { cardStore } from '../state/cardStore.js';
import {
  COLLECTION_OPTIONS,
  COLOR_MODE_OPTIONS,
  COLOR_OPTIONS,
  RARITY_OPTIONS,
  activeFilterCount,
  applyFilters,
  filters,
  normalizeFilters,
  resetFilters,
} from '../state/filters.js';
import { getSavedFilters, saveFilters } from '../state/viewState.js';
import { getList, getLists } from '../state/listsState.js';
import { SORT_OPTIONS } from '../utils/sortCards.js';

const PRICE_DEBOUNCE_MS = 300;

/** Official Scryfall mana-symbol SVGs (the same set the stats modal uses). */
const manaSymbolUrl = (symbol) => `https://svgs.scryfall.io/card-symbols/${symbol}.svg`;

let groupSeq = 0;

/**
 * The active `filter:set` listener, if the bar has been initialised. Kept at
 * module scope so re-initialising replaces the old one instead of stacking
 * duplicate listeners.
 */
let externalFilterHandler = null;

/** The active `lists:changed` listener, replaced on re-init like the above. */
let listsChangedHandler = null;

function toNumber(value) {
  const number = Number(value);
  return value !== '' && Number.isFinite(number) && number >= 0 ? number : null;
}

/** A single-choice pill group (All / Owned / Missing, colour mode, …). */
function segmented(options, onSelect) {
  const group = document.createElement('div');
  group.className = 'filter-segmented';

  const buttons = new Map();
  for (const option of options) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'filter-segment';
    button.textContent = option.label;
    if (option.title) button.title = option.title;
    button.addEventListener('click', () => onSelect(option.id));
    group.appendChild(button);
    buttons.set(option.id, button);
  }

  return {
    el: group,
    sync(activeId) {
      for (const [id, button] of buttons) {
        button.setAttribute('aria-pressed', String(id === activeId));
      }
    },
  };
}

/** A multi-select pill group (colour pips, rarity chips). */
function toggleButtons(options, className, onToggle) {
  const row = document.createElement('div');
  row.className = 'filter-row';

  const buttons = new Map();
  for (const option of options) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = option.id ? `${className} ${className}-${option.id}` : className;

    if (option.icon) {
      // Decorative image: the button's aria-label carries the name.
      const img = document.createElement('img');
      img.src = option.icon;
      img.alt = '';
      img.decoding = 'async';
      button.appendChild(img);
    } else {
      button.textContent = option.text ?? option.label ?? option.id;
    }

    button.setAttribute('aria-label', option.label ?? option.id);
    button.title = option.label ?? option.id;
    button.addEventListener('click', () => onToggle(option.id));
    row.appendChild(button);
    buttons.set(option.id, button);
  }

  return {
    el: row,
    sync(activeIds) {
      for (const [id, button] of buttons) {
        button.setAttribute('aria-pressed', String(activeIds.includes(id)));
      }
    },
  };
}

function group(label, ...controls) {
  const wrapper = document.createElement('div');
  wrapper.className = 'filter-group';

  const title = document.createElement('span');
  title.id = `filter-group-${++groupSeq}`;
  title.className = 'filter-group-label';
  title.textContent = label;

  // Associate the visible label so the controls read as a named group.
  wrapper.setAttribute('role', 'group');
  wrapper.setAttribute('aria-labelledby', title.id);

  wrapper.append(title, ...controls);
  return wrapper;
}

/** Fill the set `<select>` from the loaded collection, newest set first. */
function populateSetOptions(select, current) {
  select.textContent = '';

  const any = document.createElement('option');
  any.value = '';
  any.textContent = 'Any set';
  select.appendChild(any);

  // A set's release date is the same on every card in it; keep the newest seen
  // in case a set spans multiple dates.
  const sets = new Map();
  for (const card of cardStore.getAll()) {
    if (!card.set) continue;
    const date = card.released_at || '';
    const existing = sets.get(card.set);
    if (existing) {
      if (date && date > existing.date) existing.date = date;
    } else {
      sets.set(card.set, { date, name: card.set_name || card.set });
    }
  }

  // A restored set that hasn't loaded yet stays selectable, right after "Any".
  if (current && !sets.has(current)) {
    const option = document.createElement('option');
    option.value = current;
    option.textContent = current.toUpperCase();
    select.appendChild(option);
  }

  const ordered = [...sets.entries()].sort(
    (a, b) => b[1].date.localeCompare(a[1].date) || a[1].name.localeCompare(b[1].name)
  );

  for (const [code, info] of ordered) {
    const option = document.createElement('option');
    option.value = code;
    option.textContent = `${code.toUpperCase()} — ${info.name}`;
    select.appendChild(option);
  }

  select.value = current;
}

/**
 * Fill the list `<select>` from the user's custom lists. The list ids are not
 * known until `listsState` loads, which may happen after the bar is built.
 */
function populateListOptions(select, current) {
  select.textContent = '';

  const any = document.createElement('option');
  any.value = '';
  any.textContent = 'Any list';
  select.appendChild(any);

  for (const list of getLists()) {
    const option = document.createElement('option');
    option.value = list.id;
    option.textContent = list.name;
    select.appendChild(option);
  }

  // A persisted id whose list has not loaded yet stays selectable, so the
  // filter isn't silently dropped while lists arrive asynchronously.
  if (current && !getLists().some((list) => list.id === current)) {
    const option = document.createElement('option');
    option.value = current;
    option.textContent = 'Selected list';
    select.appendChild(option);
  }

  select.value = current || '';
}

/**
 * Wire the filter bar. Restores persisted filters, builds the controls, and
 * calls `onChange` (which re-runs the shared card filter) on every edit.
 *
 * @param {{ onChange?: () => void, onSortChange?: () => void }} [options]
 */
export function initFilterBar({ onChange, onSortChange } = {}) {
  const toggle = document.getElementById('filter-toggle');
  const panel = document.getElementById('filter-panel');
  const badge = document.getElementById('filter-count');
  if (!toggle || !panel) return () => {};

  const saved = getSavedFilters();
  if (saved) applyFilters(normalizeFilters(saved));

  const collection = segmented(COLLECTION_OPTIONS, (id) => {
    filters.collection = id;
    commit();
  });

  const colors = toggleButtons(
    COLOR_OPTIONS.map((color) => ({
      id: color.id,
      label: color.label,
      icon: manaSymbolUrl(color.id),
    })),
    'filter-pip',
    (id) => {
      const index = filters.colors.indexOf(id);
      if (index === -1) filters.colors.push(id);
      else filters.colors.splice(index, 1);
      commit();
    }
  );

  const colorMode = segmented(COLOR_MODE_OPTIONS, (id) => {
    filters.colorMode = id;
    commit();
  });

  const rarities = toggleButtons(
    RARITY_OPTIONS.map((rarity) => ({ id: rarity.id, label: rarity.label })),
    'filter-chip',
    (id) => {
      const index = filters.rarities.indexOf(id);
      if (index === -1) filters.rarities.push(id);
      else filters.rarities.splice(index, 1);
      commit();
    }
  );

  const setSelect = document.createElement('select');
  setSelect.className = 'filter-select filter-set';
  setSelect.setAttribute('aria-label', 'Filter by set');
  setSelect.addEventListener('change', () => {
    filters.set = setSelect.value;
    commit();
  });

  const listSelect = document.createElement('select');
  listSelect.className = 'filter-select filter-list';
  listSelect.setAttribute('aria-label', 'Filter by list');
  listSelect.addEventListener('change', () => {
    filters.list = listSelect.value || null;
    commit();
  });

  const priceMin = document.createElement('input');
  priceMin.type = 'number';
  priceMin.min = '0';
  priceMin.step = '0.01';
  priceMin.className = 'filter-price';
  priceMin.placeholder = 'Min €';
  priceMin.setAttribute('aria-label', 'Minimum price in euro');

  const priceMax = document.createElement('input');
  priceMax.type = 'number';
  priceMax.min = '0';
  priceMax.step = '0.01';
  priceMax.className = 'filter-price';
  priceMax.placeholder = 'Max €';
  priceMax.setAttribute('aria-label', 'Maximum price in euro');

  // Update the price state on every keystroke so a sync triggered by another
  // control can't read back a stale value and revert the edit; only the
  // (expensive) re-filter is debounced.
  const schedulePriceCommit = debounce(commit, PRICE_DEBOUNCE_MS);
  const onPriceInput = () => {
    filters.priceMin = toNumber(priceMin.value);
    filters.priceMax = toNumber(priceMax.value);
    schedulePriceCommit();
  };
  priceMin.addEventListener('input', onPriceInput);
  priceMax.addEventListener('input', onPriceInput);

  const priceRow = document.createElement('div');
  priceRow.className = 'filter-row';
  priceRow.append(priceMin, priceMax);

  const sortSelect = document.createElement('select');
  sortSelect.className = 'filter-select filter-sort';
  sortSelect.setAttribute('aria-label', 'Sort order');
  for (const option of SORT_OPTIONS) {
    const el = document.createElement('option');
    el.value = option.id;
    el.textContent = option.label;
    sortSelect.appendChild(el);
  }
  sortSelect.addEventListener('change', () => {
    filters.sort = sortSelect.value;
    saveFilters(filters);
    syncControls();
    // A sort change rebuilds the grid (which also re-applies the filters).
    onSortChange?.();
  });

  const resetButton = document.createElement('button');
  resetButton.type = 'button';
  resetButton.className = 'filter-reset';
  resetButton.textContent = 'Reset filters';
  resetButton.addEventListener('click', () => {
    // Sorting is a view preference, not a filter; keep it on reset.
    const { sort } = filters;
    resetFilters();
    filters.sort = sort;
    commit();
  });

  const activeRow = document.createElement('div');
  activeRow.className = 'filter-active';
  activeRow.hidden = true;

  const labelFor = (options, id) => options.find((option) => option.id === id)?.label || id;

  /** Human labels for the active filters, used by the chips and the toggle. */
  function activeFilterLabels() {
    const items = [];
    if (filters.collection !== 'all') items.push(labelFor(COLLECTION_OPTIONS, filters.collection));
    for (const color of filters.colors) items.push(labelFor(COLOR_OPTIONS, color));
    for (const rarity of filters.rarities) items.push(labelFor(RARITY_OPTIONS, rarity));
    if (filters.set) items.push(filters.set.toUpperCase());
    if (filters.list) items.push(getList(filters.list)?.name || 'List');
    if (filters.priceMin != null || filters.priceMax != null) {
      const min = filters.priceMin != null ? `€${filters.priceMin}` : '';
      const max = filters.priceMax != null ? `€${filters.priceMax}` : '';
      items.push(min && max ? `${min}–${max}` : min ? `${min}+` : `≤${max}`);
    }
    return items;
  }

  /** One removable chip per active filter, so it can be cleared in place. */
  function renderActiveChips(labels) {
    activeRow.textContent = '';
    activeRow.hidden = labels.length === 0;
    if (labels.length === 0) return;

    const actions = [];
    if (filters.collection !== 'all') {
      actions.push(() => {
        filters.collection = 'all';
      });
    }
    for (const color of [...filters.colors]) {
      actions.push(() => {
        filters.colors = filters.colors.filter((value) => value !== color);
      });
    }
    for (const rarity of [...filters.rarities]) {
      actions.push(() => {
        filters.rarities = filters.rarities.filter((value) => value !== rarity);
      });
    }
    if (filters.set) {
      actions.push(() => {
        filters.set = '';
      });
    }
    if (filters.list) {
      actions.push(() => {
        filters.list = null;
      });
    }
    if (filters.priceMin != null || filters.priceMax != null) {
      actions.push(() => {
        filters.priceMin = null;
        filters.priceMax = null;
      });
    }

    labels.forEach((label, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'filter-active-chip';
      button.textContent = label;
      button.title = `Remove ${label} filter`;
      button.setAttribute('aria-label', `Remove ${label} filter`);
      button.addEventListener('click', () => {
        actions[index]?.();
        commit();
      });
      activeRow.appendChild(button);
    });
  }

  const colorRow = document.createElement('div');
  colorRow.className = 'filter-row';
  colorRow.append(colors.el, colorMode.el);

  panel.append(
    activeRow,
    group('Sort by', sortSelect),
    group('Collection', collection.el),
    group('Colours', colorRow),
    group('Rarity', rarities.el),
    group('Set', setSelect),
    group('List', listSelect),
    group('Price (€)', priceRow),
    resetButton
  );

  function syncControls() {
    collection.sync(filters.collection);
    colors.sync(filters.colors);
    colorMode.sync(filters.colorMode);
    rarities.sync(filters.rarities);
    setSelect.value = filters.set;
    if (filters.list && !getList(filters.list)) filters.list = null;
    listSelect.value = filters.list || '';
    sortSelect.value = filters.sort;
    priceMin.value = filters.priceMin ?? '';
    priceMax.value = filters.priceMax ?? '';

    const count = activeFilterCount();
    const labels = activeFilterLabels();
    renderActiveChips(labels);
    if (badge) {
      badge.textContent = String(count);
      badge.hidden = count === 0;
    }
    toggle.setAttribute('aria-label', count > 0 ? `Filters, ${count} active` : 'Filters');
    toggle.title = labels.length > 0 ? `Filters: ${labels.join(', ')}` : 'Filters';
    toggle.classList.toggle('has-filters', count > 0);
    resetButton.disabled = count === 0;
  }

  function commit() {
    saveFilters(filters);
    syncControls();
    onChange?.();
  }

  // Tiles emit `filter:set` when their set or colour chip is clicked; apply it
  // through the same commit path so persistence and the badge stay in sync.
  if (externalFilterHandler) document.removeEventListener('filter:set', externalFilterHandler);
  externalFilterHandler = (event) => {
    Object.assign(filters, event.detail || {});
    commit();
  };
  document.addEventListener('filter:set', externalFilterHandler);

  // Lists can load or change (create/delete/merge) after the bar is built, so
  // keep the dropdown in step and drop a filter for a list that no longer exists.
  if (listsChangedHandler) document.removeEventListener('lists:changed', listsChangedHandler);
  listsChangedHandler = () => {
    populateListOptions(listSelect, filters.list);
    syncControls();
    onChange?.();
  };
  document.addEventListener('lists:changed', listsChangedHandler);

  function setOpen(open) {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) {
      // The collection keeps loading, so refresh the set list each time.
      populateSetOptions(setSelect, filters.set);
      populateListOptions(listSelect, filters.list);
      syncControls();
    }
  }

  toggle.addEventListener('click', () => setOpen(panel.hidden));
  panel.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || panel.hidden) return;
    event.stopPropagation();
    setOpen(false);
    toggle.focus();
  });

  populateSetOptions(setSelect, filters.set);
  populateListOptions(listSelect, filters.list);
  syncControls();

  // Apply restored filters to anything already rendered.
  if (saved) onChange?.();
}
