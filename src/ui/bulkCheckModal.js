import { searchCards } from '../search.js';
import { debounce } from '../utils/debounce.js';
import { showToast } from './toast.js';
import { setCardsOwned, isCardOwned } from '../cardState.js';
import { cardStore } from '../loadedCards.js';
import { updateAllCardStates } from '../cards.js';
import { updateAllBinderCounts } from '../layout.js';

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

  // First, check the local cardStore
  const localCard = cardStore.getAll().find(c => c.name.toLowerCase() === name.toLowerCase());
  if (localCard) {
    cardCache.set(name, localCard);
    return localCard;
  }

  // If not found locally, then search
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
  const uniqueLines = [...new Set(lines.map(line => line.trim()).filter(Boolean))];
  preview.innerHTML = '';
  const validationPromises = uniqueLines.map(name => {
    return validateCard(name).then(card => ({ name, card }));
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

  const restOfText = text.substring(end);
  const newText = text.substring(0, start) + suggestion + '\n' + restOfText.trimStart();
  textArea.value = newText;

  const newCursorPos = start + suggestion.length + 1;
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
  const cardNames = [...new Set(lines.map(line => line.trim()).filter(Boolean))];

  if (cardNames.length === 0) {
    showToast('No card names to add.', 'error');
    return;
  }

  showToast('Checking cards... please wait.', 'info');

  const validationPromises = cardNames.map(name => validateCard(name));
  const cards = await Promise.all(validationPromises);
  const validCards = cards.filter(Boolean);
  const invalidNames = cardNames.filter((name, index) => !cards[index]);

  const ownedCards = validCards.filter(card => isCardOwned(card));
  const missingCards = validCards.filter(card => !isCardOwned(card));

  preview.innerHTML = '';
  if (ownedCards.length > 0 || missingCards.length > 0) {
    preview.appendChild(createCardLists(ownedCards, missingCards));
  }
  
  if (invalidNames.length > 0) {
    showToast(`Could not find: ${invalidNames.join(', ')}`, 'error');
  }
}

function createCardLists(owned, missing) {
  const container = document.createElement('div');

  const ownedList = document.createElement('ul');
  const ownedHeader = document.createElement('h3');
  ownedHeader.textContent = 'Owned';
  ownedList.appendChild(ownedHeader);
  owned.forEach(card => {
    const li = document.createElement('li');
    li.textContent = card.name;
    ownedList.appendChild(li);
  });

  const missingList = document.createElement('ul');
  const missingHeader = document.createElement('h3');
  missingHeader.textContent = 'Missing';
  missingList.appendChild(missingHeader);
  missing.forEach(card => {
    const li = document.createElement('li');
    li.textContent = card.name;
    missingList.appendChild(li);
  });

  container.appendChild(ownedList);
  container.appendChild(missingList);
  return container;
}

export async function createBulkCheckModal() {
  if (document.querySelector('.list-modal-backdrop')) {
    const existingModal = document.querySelector('.list-modal-backdrop');
    existingModal.style.display = 'block';
    return;
  }

  allCardNames = cardStore.getAll().map(card => card.name);

  const modalBackdrop = document.createElement('div');
  modalBackdrop.className = 'list-modal-backdrop';

  modal = document.createElement('div');
  modal.className = 'list-modal';

  const title = document.createElement('h2');
  title.textContent = 'Bulk Check Cards';

  const contentArea = document.createElement('div');
  contentArea.className = 'modal-content-area';

  const textAreaWrapper = document.createElement('div');
  textAreaWrapper.style.position = 'relative';

  textArea = document.createElement('textarea');
  textArea.rows = 10;
  textArea.placeholder = 'Enter one card name per line';
  textArea.addEventListener('input', handleInputValidation);
  textArea.addEventListener('keyup', handleAutocomplete);
  textArea.addEventListener('keydown', handleKeyDown);
  textArea.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.ctrlKey) {
      handleConfirm();
    }
  });

  suggestionsContainer = document.createElement('div');
  suggestionsContainer.className = 'suggestions-container';

  textAreaWrapper.appendChild(textArea);
  textAreaWrapper.appendChild(suggestionsContainer);

  preview = document.createElement('div');
  preview.className = 'preview';

  contentArea.appendChild(textAreaWrapper);
  contentArea.appendChild(preview);

  confirmButton = document.createElement('button');
  confirmButton.textContent = 'Confirm';
  confirmButton.onclick = handleConfirm;

  const closeButton = document.createElement('button');
  closeButton.textContent = 'Close';
  closeButton.addEventListener('click', () => {
    document.body.removeChild(modalBackdrop);
  });

  const buttonContainer = document.createElement('div');
  buttonContainer.className = 'modal-button-container';
  buttonContainer.appendChild(confirmButton);
  buttonContainer.appendChild(closeButton);

  modal.appendChild(title);
  modal.appendChild(contentArea);
  modal.appendChild(buttonContainer);
  modalBackdrop.appendChild(modal);

  document.body.appendChild(modalBackdrop);

  modalBackdrop.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) {
      document.body.removeChild(modalBackdrop);
    }
  });

  return {
    show: () => {
      modalBackdrop.style.display = 'block';
      textArea.focus();
    },
  };
}