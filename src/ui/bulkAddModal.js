import { searchCards } from '../search.js';
import { debounce } from '../utils/debounce.js';
import { showToast } from './toast.js';
import { toggleCardOwnership } from '../cardInteractions.js';
import { fetchJsonData } from '../fetcher.js';

let modal;
let textArea;
let preview;
let confirmButton;
let suggestionsContainer;

const cardCache = new Map();
let allCardNames = [];
let activeSuggestionIndex = -1;

async function validateCard(name) {
  if (cardCache.has(name)) {
    return cardCache.get(name);
  }
  try {
    const result = await searchCards(name, false);
    const card = result.data.find(c => c.name.toLowerCase() === name.toLowerCase());
    cardCache.set(name, card);
    return card;
  } catch (e) {
    cardCache.set(name, null);
    return null;
  }
}

function createLine(name, card) {
  const line = document.createElement('div');
  line.textContent = name;
  if (card) {
    line.style.color = 'green';
  } else {
    line.style.color = 'red';
  }
  return line;
}

const handleInputValidation = debounce(async () => {
  const lines = textArea.value.split('\n');
  preview.innerHTML = '';
  const validationPromises = lines.map(line => {
    const name = line.trim();
    if (name) {
      return validateCard(name).then(card => ({ name, card }));
    }
    return Promise.resolve(null);
  });

  const results = await Promise.all(validationPromises);
  results.forEach(result => {
    if (result) {
      preview.appendChild(createLine(result.name, result.card));
    }
  });
}, 300);

function handleAutocomplete(event) {
  if (
    event.key === 'ArrowUp' ||
    event.key === 'ArrowDown' ||
    event.key === 'Enter' ||
    event.key === 'Tab'
  ) {
    return;
  }

  const text = textArea.value;
  const cursorPos = textArea.selectionStart;
  const textUpToCursor = text.substring(0, cursorPos);
  const lines = textUpToCursor.split('\n');
  const currentLineText = lines[lines.length - 1].trim();

  if (currentLineText.length < 2) {
    suggestionsContainer.style.display = 'none';
    return;
  }

  const suggestions = allCardNames
    .filter(name => name.toLowerCase().startsWith(currentLineText.toLowerCase()))
    .slice(0, 5);

  if (suggestions.length > 0) {
    suggestionsContainer.innerHTML = '';
    suggestions.forEach((suggestion, index) => {
      const item = document.createElement('div');
      item.className = 'suggestion-item';
      item.textContent = suggestion;
      item.addEventListener('click', () => {
        selectSuggestion(suggestion);
      });
      suggestionsContainer.appendChild(item);
    });
    suggestionsContainer.style.display = 'block';
    activeSuggestionIndex = -1;
  } else {
    suggestionsContainer.style.display = 'none';
  }
}

function selectSuggestion(suggestion) {
  const text = textArea.value;
  const cursorPos = textArea.selectionStart;
  
  let start = text.lastIndexOf('\n', cursorPos - 1) + 1;
  let end = text.indexOf('\n', cursorPos);
  if (end === -1) {
    end = text.length;
  }

  const newText = text.substring(0, start) + suggestion + text.substring(end);
  textArea.value = newText;
  
  const newCursorPos = start + suggestion.length;
  textArea.focus();
  textArea.setSelectionRange(newCursorPos, newCursorPos);

  suggestionsContainer.style.display = 'none';
  handleInputValidation();
}

function handleKeyDown(event) {
  const items = suggestionsContainer.querySelectorAll('.suggestion-item');
  if (items.length === 0 || suggestionsContainer.style.display === 'none') {
    return;
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    activeSuggestionIndex = (activeSuggestionIndex + 1) % items.length;
    updateActiveSuggestion();
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    activeSuggestionIndex = (activeSuggestionIndex - 1 + items.length) % items.length;
    updateActiveSuggestion();
  } else if (event.key === 'Enter' || event.key === 'Tab') {
    if (activeSuggestionIndex > -1) {
      event.preventDefault();
      selectSuggestion(items[activeSuggestionIndex].textContent);
    }
  }
}

function updateActiveSuggestion() {
    const items = suggestionsContainer.querySelectorAll('.suggestion-item');
    items.forEach((item, index) => {
        item.classList.toggle('active', index === activeSuggestionIndex);
    });
}

async function handleConfirm() {
  const lines = textArea.value.split('\n');
  const cardNames = lines.map(line => line.trim()).filter(Boolean);

  if (cardNames.length === 0) {
    showToast('No card names to add.', 'error');
    return;
  }

  showToast('Adding cards... please wait.', 'info');

  const validationPromises = cardNames.map(name => validateCard(name));
  const cards = await Promise.all(validationPromises);
  const validCards = cards.filter(Boolean);
  const invalidNames = cardNames.filter((name, index) => !cards[index]);

  if (validCards.length > 0) {
    await toggleCardOwnership(validCards, true);
    showToast(`Successfully added ${validCards.length} cards!`, 'success');
  }

  if (invalidNames.length > 0) {
    showToast(`Could not find: ${invalidNames.join(', ')}`, 'error');
  }
}

export async function createBulkAddModal() {
  if (document.getElementById('bulk-add-modal')) {
    const existingModal = document.getElementById('bulk-add-modal');
    existingModal.style.display = 'block';
    return;
  }

  try {
    const cardData = await fetchJsonData();
    allCardNames = cardData.data.map(card => card.name);
  } catch (error) {
    console.error("Failed to load card data for autocomplete:", error);
  }

  modal = document.createElement('div');
  modal.id = 'bulk-add-modal';
  modal.className = 'modal';

  const modalContent = document.createElement('div');
  modalContent.className = 'modal-content';

  const closeButton = document.createElement('span');
  closeButton.className = 'close-button';
  closeButton.innerHTML = '&times;';
  closeButton.onclick = () => {
    modal.style.display = 'none';
  };

  const title = document.createElement('h2');
  title.textContent = 'Bulk Add Cards';

  const textAreaWrapper = document.createElement('div');
  textAreaWrapper.style.position = 'relative';

  textArea = document.createElement('textarea');
  textArea.rows = 10;
  textArea.placeholder = 'Enter one card name per line';
  textArea.addEventListener('input', handleInputValidation);
  textArea.addEventListener('keyup', handleAutocomplete);
  textArea.addEventListener('keydown', handleKeyDown);

  suggestionsContainer = document.createElement('div');
  suggestionsContainer.className = 'suggestions-container';

  textAreaWrapper.appendChild(textArea);
  textAreaWrapper.appendChild(suggestionsContainer);

  preview = document.createElement('div');
  preview.className = 'preview';

  confirmButton = document.createElement('button');
  confirmButton.textContent = 'Confirm';
  confirmButton.onclick = handleConfirm;

  modalContent.appendChild(closeButton);
  modalContent.appendChild(title);
  modalContent.appendChild(textAreaWrapper);
  modalContent.appendChild(preview);
  modalContent.appendChild(confirmButton);
  modal.appendChild(modalContent);

  document.body.appendChild(modal);

  return {
    show: () => {
      modal.style.display = 'block';
      textArea.focus();
    },
  };
}