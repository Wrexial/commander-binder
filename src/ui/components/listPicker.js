import { createModal } from './modal.js';
import { showToast } from './toast.js';
import {
  addCardsToList,
  canEditLists,
  createList,
  getLists,
  isInList,
  toggleCardsInList,
} from '../../state/listsState.js';
import { updateAllCardStates } from '../cards.js';

/**
 * List membership picker, opened from the card preview (one card) or the bulk
 * edit bar (the whole selection). Each list is a toggle row: a card can belong
 * to any number of lists, and a batch toggles as a unit (all-in removes, any
 * missing adds). A new list can be created inline and the cards added in one
 * step.
 *
 * @returns {{ show: (cards: object | object[]) => void }}
 */
export function createListPicker() {
  const shell = createModal({ className: 'list-picker', ariaLabel: 'Add to list' });
  const { modal, close } = shell;

  const header = document.createElement('div');
  header.className = 'bulk-modal-header';

  const heading = document.createElement('h2');
  heading.textContent = 'Add to list';

  const subtitle = document.createElement('p');
  subtitle.className = 'bulk-modal-subtitle';

  header.append(heading, subtitle);

  const content = document.createElement('div');
  content.className = 'modal-content-area list-picker-content';

  const footer = document.createElement('div');
  footer.className = 'modal-button-container';
  const doneButton = document.createElement('button');
  doneButton.type = 'button';
  doneButton.className = 'primary';
  doneButton.textContent = 'Done';
  doneButton.addEventListener('click', close);
  footer.appendChild(doneButton);

  modal.append(header, content, footer);

  /** The card(s) currently being edited. */
  let cards = [];
  let creating = false;
  let busy = false;

  /** Whether every / some of the current cards belong to `listId`. */
  function memberState(listId) {
    const present = cards.filter((card) => isInList(listId, card));
    return {
      all: cards.length > 0 && present.length === cards.length,
      some: present.length > 0 && present.length < cards.length,
    };
  }

  function render() {
    content.textContent = '';
    subtitle.textContent = cards.length === 1 ? cards[0].name : `${cards.length} selected cards`;

    const lists = getLists();

    if (lists.length === 0 && !creating) {
      const empty = document.createElement('p');
      empty.className = 'list-picker-empty';
      empty.textContent = 'You have no lists yet.';
      content.appendChild(empty);
    }

    const rows = document.createElement('div');
    rows.className = 'list-picker-rows';

    for (const list of lists) {
      const { all, some } = memberState(list.id);

      const row = document.createElement('button');
      row.type = 'button';
      row.className = `list-picker-row${all ? ' is-member' : ''}${some ? ' is-partial' : ''}`;
      row.setAttribute('aria-pressed', all ? 'true' : some ? 'mixed' : 'false');
      row.disabled = !canEditLists() || busy;

      const check = document.createElement('span');
      check.className = 'list-picker-check';
      check.textContent = all ? '✓' : some ? '–' : '';

      const name = document.createElement('span');
      name.className = 'list-picker-name';
      name.textContent = list.name;

      const count = document.createElement('span');
      count.className = 'list-picker-count';
      count.textContent = String(list.cardIds.size);

      row.append(check, name, count);
      row.addEventListener('click', () => toggle(list));
      rows.appendChild(row);
    }

    content.appendChild(rows);

    if (!canEditLists()) return;

    if (creating) {
      const form = document.createElement('form');
      form.className = 'list-picker-new';

      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = 'New list name';
      input.setAttribute('aria-label', 'New list name');
      input.maxLength = 60;

      const save = document.createElement('button');
      save.type = 'submit';
      save.className = 'primary';
      save.textContent = 'Create & add';

      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.textContent = 'Cancel';
      cancel.addEventListener('click', () => {
        creating = false;
        render();
      });

      form.append(input, save, cancel);
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        createAndAdd(input.value);
      });
      content.appendChild(form);
      // Focus lands on the new input, not the first row.
      queueMicrotask(() => input.focus());
    } else {
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'list-picker-new-toggle';
      add.textContent = '+ New list';
      add.addEventListener('click', () => {
        creating = true;
        render();
      });
      content.appendChild(add);
    }
  }

  async function toggle(list) {
    if (cards.length === 0 || busy) return;
    busy = true;
    try {
      await toggleCardsInList(list.id, cards);
      updateAllCardStates();
    } catch (err) {
      console.error('Failed to update list membership:', err);
      showToast('Could not update the list.', 'error');
    } finally {
      busy = false;
      render();
    }
  }

  async function createAndAdd(name) {
    if (cards.length === 0 || busy) return;
    const trimmed = String(name || '').trim();
    if (!trimmed) return;

    busy = true;
    try {
      const list = await createList({ name: trimmed });
      if (list) await addCardsToList(list.id, cards);
      creating = false;
      updateAllCardStates();
    } catch (err) {
      console.error('Failed to create list:', err);
      showToast(err.message || 'Could not create the list.', 'error');
    } finally {
      busy = false;
      render();
    }
  }

  function show(nextCards) {
    cards = (Array.isArray(nextCards) ? nextCards : [nextCards]).filter(Boolean);
    creating = false;
    busy = false;
    render();
    shell.show();
  }

  return { show };
}

/**
 * Open the list picker for one card or a selection. A picker is a single-use
 * modal (closing removes it), so each open builds a fresh one; the guard keeps
 * a second click from stacking a duplicate.
 * @param {object|object[]} cards
 */
export function showListPicker(cards) {
  if (document.querySelector('.list-modal.list-picker')) return;
  createListPicker().show(cards);
}
