import { createModal } from './modal.js';
import { showToast } from './toast.js';
import { escapeHtml } from '../../utils/html.js';
import {
  addCardsToList,
  canEditLists,
  createList,
  deleteList,
  getList,
  getLists,
  loadLists,
  updateList,
} from '../../state/listsState.js';
import { getSelectedCards, getSelectedCount, isSelectionMode } from '../../state/selectionState.js';
import { updateAllCardStates } from '../cards.js';

/**
 * Manager for the user's custom lists: create, rename, edit notes, toggle
 * public/private, delete, and add the current bulk selection. In a share view
 * it renders the owner's public lists read-only.
 *
 * @returns {{ show: () => void }}
 */
export function createListsModal() {
  const shell = createModal({ className: 'lists-modal', ariaLabel: 'My Lists' });
  const { modal, close } = shell;

  const header = document.createElement('div');
  header.className = 'bulk-modal-header';
  const heading = document.createElement('h2');
  heading.textContent = 'My Lists';
  const subtitle = document.createElement('p');
  subtitle.className = 'bulk-modal-subtitle';
  subtitle.textContent = canEditLists()
    ? 'Group cards into named lists — a trade pile, a deck in progress — and add notes.'
    : 'Lists the owner shared with this link.';
  header.append(heading, subtitle);

  const layout = document.createElement('div');
  layout.className = 'lists-layout';

  const nav = document.createElement('div');
  nav.className = 'lists-nav';

  const editor = document.createElement('div');
  editor.className = 'lists-editor';

  layout.append(nav, editor);

  const footer = document.createElement('div');
  footer.className = 'modal-button-container';
  const doneButton = document.createElement('button');
  doneButton.type = 'button';
  doneButton.textContent = 'Close';
  doneButton.addEventListener('click', close);
  footer.appendChild(doneButton);

  modal.append(header, layout, footer);

  let selectedId = null;
  let creating = false;
  let confirmingDelete = false;
  let busy = false;

  function selectedList() {
    return selectedId ? getList(selectedId) : null;
  }

  function renderNav() {
    nav.textContent = '';
    const lists = getLists();

    if (canEditLists()) {
      const newButton = document.createElement('button');
      newButton.type = 'button';
      newButton.className = `lists-new${creating ? ' is-active' : ''}`;
      newButton.textContent = '+ New list';
      newButton.addEventListener('click', () => {
        creating = true;
        confirmingDelete = false;
        render();
      });
      nav.appendChild(newButton);
    }

    if (lists.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'lists-nav-empty';
      empty.textContent = canEditLists() ? 'No lists yet.' : 'No public lists.';
      nav.appendChild(empty);
      return;
    }

    for (const list of lists) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `lists-nav-item${list.id === selectedId && !creating ? ' is-active' : ''}`;
      item.innerHTML = `
        <span class="lists-nav-name">${escapeHtml(list.name)}</span>
        <span class="lists-nav-meta">${list.cardIds.size}${list.isPublic ? ' · public' : ''}</span>`;

      item.addEventListener('click', () => {
        selectedId = list.id;
        creating = false;
        confirmingDelete = false;
        render();
      });
      nav.appendChild(item);
    }
  }

  function field(labelText, control) {
    const wrapper = document.createElement('label');
    wrapper.className = 'lists-field';
    const label = document.createElement('span');
    label.textContent = labelText;
    wrapper.append(label, control);
    return wrapper;
  }

  function renderEditor() {
    editor.textContent = '';
    const list = selectedList();
    const readOnly = !canEditLists();

    if (creating) {
      const form = document.createElement('form');
      form.className = 'lists-form';

      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.maxLength = 60;
      nameInput.placeholder = 'List name (e.g. Trade pile)';
      nameInput.setAttribute('aria-label', 'List name');

      const notesInput = document.createElement('textarea');
      notesInput.rows = 4;
      notesInput.placeholder = 'Notes (optional)';
      notesInput.setAttribute('aria-label', 'List notes');

      const publicLabel = document.createElement('label');
      publicLabel.className = 'lists-checkbox';
      const publicInput = document.createElement('input');
      publicInput.type = 'checkbox';
      publicLabel.append(publicInput, document.createTextNode('Show on my public share link'));

      const actions = document.createElement('div');
      actions.className = 'lists-form-actions';
      const save = document.createElement('button');
      save.type = 'submit';
      save.className = 'primary';
      save.textContent = 'Create list';
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.textContent = 'Cancel';
      cancel.addEventListener('click', () => {
        creating = false;
        render();
      });
      actions.append(save, cancel);

      form.append(field('Name', nameInput), field('Notes', notesInput), publicLabel, actions);
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        handleCreate(nameInput.value, notesInput.value, publicInput.checked);
      });

      editor.appendChild(form);
      queueMicrotask(() => nameInput.focus());
      return;
    }

    if (!list) {
      const empty = document.createElement('p');
      empty.className = 'lists-editor-empty';
      empty.textContent = canEditLists()
        ? 'Select a list, or create a new one.'
        : 'Select a list to read its notes.';
      editor.appendChild(empty);
      return;
    }

    const form = document.createElement('form');
    form.className = 'lists-form';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.maxLength = 60;
    nameInput.value = list.name;
    nameInput.setAttribute('aria-label', 'List name');
    nameInput.disabled = readOnly;

    const notesInput = document.createElement('textarea');
    notesInput.rows = 4;
    notesInput.value = list.notes;
    notesInput.placeholder = 'Notes (optional)';
    notesInput.setAttribute('aria-label', 'List notes');
    notesInput.disabled = readOnly;

    const publicLabel = document.createElement('label');
    publicLabel.className = 'lists-checkbox';
    const publicInput = document.createElement('input');
    publicInput.type = 'checkbox';
    publicInput.checked = list.isPublic;
    publicInput.disabled = readOnly;
    publicLabel.append(publicInput, document.createTextNode('Show on my public share link'));

    form.append(field('Name', nameInput), field('Notes', notesInput), publicLabel);

    const actions = document.createElement('div');
    actions.className = 'lists-form-actions';

    if (canEditLists()) {
      const save = document.createElement('button');
      save.type = 'submit';
      save.className = 'primary';
      save.textContent = 'Save';
      actions.appendChild(save);

      if (confirmingDelete) {
        const confirm = document.createElement('button');
        confirm.type = 'button';
        confirm.className = 'danger';
        confirm.textContent = 'Confirm delete';
        confirm.addEventListener('click', () => handleDelete(list.id));
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.textContent = 'Cancel';
        cancel.addEventListener('click', () => {
          confirmingDelete = false;
          render();
        });
        actions.append(confirm, cancel);
      } else {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'danger';
        remove.textContent = 'Delete';
        remove.addEventListener('click', () => {
          confirmingDelete = true;
          render();
        });
        actions.appendChild(remove);
      }
    }

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      handleSave(list.id, nameInput.value, notesInput.value, publicInput.checked);
    });

    if (actions.childNodes.length > 0) form.appendChild(actions);
    editor.appendChild(form);

    // Bulk selection integration: add the cards the user selected on the grid.
    if (canEditLists() && isSelectionMode() && getSelectedCount() > 0) {
      const count = getSelectedCount();
      const addSelected = document.createElement('button');
      addSelected.type = 'button';
      addSelected.className = 'lists-add-selected';
      addSelected.textContent = `Add ${count} selected card${count === 1 ? '' : 's'} to “${list.name}”`;
      addSelected.addEventListener('click', () => handleAddSelected(list.id));
      editor.appendChild(addSelected);
    }

    editor.insertAdjacentHTML(
      'beforeend',
      `<p class="lists-count">${list.cardIds.size} card${list.cardIds.size === 1 ? '' : 's'} in this list</p>`
    );
  }

  async function handleCreate(name, notes, isPublic) {
    if (busy) return;
    busy = true;
    try {
      const list = await createList({ name, notes, isPublic });
      creating = false;
      if (list) selectedId = list.id;
    } catch (err) {
      console.error('Failed to create list:', err);
      showToast(err.message || 'Could not create the list.', 'error');
    } finally {
      busy = false;
      render();
    }
  }

  async function handleSave(id, name, notes, isPublic) {
    if (busy) return;
    busy = true;
    try {
      await updateList(id, { name, notes, isPublic });
      showToast('List saved.', 'success');
    } catch (err) {
      console.error('Failed to save list:', err);
      showToast(err.message || 'Could not save the list.', 'error');
    } finally {
      busy = false;
      render();
    }
  }

  async function handleDelete(id) {
    if (busy) return;
    busy = true;
    try {
      await deleteList(id);
      if (selectedId === id) selectedId = null;
      confirmingDelete = false;
    } catch (err) {
      console.error('Failed to delete list:', err);
      showToast(err.message || 'Could not delete the list.', 'error');
    } finally {
      busy = false;
      render();
    }
  }

  async function handleAddSelected(id) {
    if (busy) return;
    const cards = getSelectedCards();
    if (cards.length === 0) return;

    busy = true;
    try {
      await addCardsToList(id, cards);
      updateAllCardStates();
      showToast(`Added ${cards.length} card${cards.length === 1 ? '' : 's'}.`, 'success');
    } catch (err) {
      console.error('Failed to add selected cards:', err);
      showToast(err.message || 'Could not add the selected cards.', 'error');
    } finally {
      busy = false;
      render();
    }
  }

  function render() {
    // Keep a valid selection as lists change (rename/delete/reload).
    if (selectedId && !getList(selectedId) && !creating) selectedId = null;
    if (!selectedId && !creating) {
      const [first] = getLists();
      if (first) selectedId = first.id;
    }
    renderNav();
    renderEditor();
  }

  function show() {
    creating = false;
    confirmingDelete = false;
    // A share view may open before its public lists finish loading.
    if (!getLists().length) {
      loadLists().catch(() => {});
    }
    render();
    shell.show();
  }

  return { show };
}
