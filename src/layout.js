import { binderColors, CARDS_PER_PAGE, PAGES_PER_BINDER } from './config.js';
import { appState } from './appState.js';
import { lightenColor } from './utils/colors.js';
import { positionTooltip } from './tooltip.js';
import { getOwnedCardIds, isCardMissing } from './cardState.js';
import { showListModal } from './ui/modal.js';
import { fetchJsonData } from './data.js';
import { showToast } from './ui/toast.js';
import { cardStore } from './loadedCards.js';

export function createGlobalExportOwnedButton() {
  const userActionsDiv = document.getElementById('user-actions');
  if (!userActionsDiv) return;

  const exportButton = document.createElement('button');
  exportButton.textContent = 'Export All Owned';
  exportButton.className = 'global-export-button';
  exportButton.addEventListener('click', async () => {
    const ownedCardIds = getOwnedCardIds();
    if (ownedCardIds.length === 0) {
      alert('No owned cards to export.');
      return;
    }

    const allCardsData = cardStore.getAll();
    if (!allCardsData || allCardsData.length === 0) {
        alert('Could not fetch card data.');
        return;
    }

    const ownedCardIdsSet = new Set(ownedCardIds);
    const ownedCards = allCardsData.filter(card => ownedCardIdsSet.has(card.id));

    const cardNames = ownedCards.map(card => card.name);
    
    const textToCopy = cardNames.join('\n');
    navigator.clipboard.writeText(textToCopy).then(() => {
      showToast('Owned cards copied to clipboard!', 'success');
    }).catch(err => {
      console.error('Failed to copy text: ', err);
      showToast('Failed to copy cards. See console for details.', 'error');
    });
  });

  const shareButton = document.getElementById('share-button');
  if (shareButton) {
    userActionsDiv.insertBefore(exportButton, shareButton);
  } else {
    userActionsDiv.appendChild(exportButton);
  }
}

export function startNewBinder(results) {
  const binderNumber = Math.floor(appState.count / (CARDS_PER_PAGE * PAGES_PER_BINDER)) + 1;

  const newBinder = document.createElement("div");
  newBinder.className = "binder";

  // Prefer binder colors defined in CSS variables, fallback to config
  const cssColor = getComputedStyle(document.documentElement).getPropertyValue(
    `--binder-color-${(binderNumber - 1) % 6}`
  ).trim();
  const fallback = binderColors[(binderNumber - 1) % binderColors.length];
  const color = cssColor || fallback;

  newBinder.style.borderColor = color;
  newBinder.style.background = lightenColor(color, 0.9);

  const header = document.createElement("h2");
  header.className = "binder-header";
  header.style.color = color;

  const content = document.createElement('div');
  content.className = 'binder-header-content';

  const title = document.createElement("span");
  title.className = "binder-title";
  title.textContent = `Binder ${binderNumber}`;
  content.appendChild(title);

  const dates = document.createElement('span');
  dates.className = 'binder-dates';
  content.appendChild(dates);

  const ownedCount = document.createElement("span");
  ownedCount.className = "binder-owned";
  content.appendChild(ownedCount);

  header.appendChild(content);

  const exportButton = document.createElement('button');
  exportButton.textContent = 'Export Missing';
  exportButton.className = 'export-missing-button';
  exportButton.addEventListener('click', (e) => {
    e.stopPropagation();

    const allCards = newBinder.querySelectorAll('.card');
    const missingCards = Array.from(allCards).filter(card => isCardMissing(card.cardData));

    if (missingCards.length === 0) {
      alert('No missing cards in this binder.');
      return;
    }

    const cardNames = missingCards.map(card => card.cardData.name);
    showListModal('Missing Cards', cardNames);
  });
  header.appendChild(exportButton);

  const bulkAddButton = document.createElement('button');
  bulkAddButton.textContent = 'Bulk Add';
  bulkAddButton.className = 'bulk-add-button';
  header.appendChild(bulkAddButton);

  let longPressTimer;

  function handleInteraction(event) {
    if (event.shiftKey) {
      toggleAllSections(newBinder);
    } else {
      newBinder.classList.toggle("collapsed");
    }
  }

  function toggleAllSections(binder) {
    const sections = binder.querySelectorAll('.section');
    if (sections.length === 0) return;

    const isBinderOpen = !binder.classList.contains('collapsed');
    const anySectionOpen = Array.from(sections).some(s => !s.classList.contains('collapsed'));

    const shouldCollapseAll = isBinderOpen && anySectionOpen;

    sections.forEach(section => {
      section.classList.toggle('collapsed', shouldCollapseAll);
    });
    
    binder.classList.toggle('collapsed', shouldCollapseAll);
  }

  header.addEventListener("click", handleInteraction);

  header.addEventListener('touchstart', () => {
    longPressTimer = setTimeout(() => {
      toggleAllSections(newBinder);
    }, 500);
  });

  header.addEventListener('touchend', () => {
    clearTimeout(longPressTimer);
  });

  header.addEventListener('touchmove', () => {
    clearTimeout(longPressTimer);
  });

  header.addEventListener('contextmenu', (event) => {
    event.preventDefault();
  });

  newBinder.appendChild(header);
  results.appendChild(newBinder);

  appState.binder = newBinder;
  appState.binder.totalCards = 0;
  appState.binder.ownedCards = 0;
  appState.binder.startDate = null;
  appState.binder.endDate = null;
}

export function startNewSection(pageSets = new Map()) {
  const pageNumberInBinder = appState.binder.querySelectorAll('.section').length + 1;

  const section = document.createElement("div");
  section.className = "section";
  appState.section = section;

  const header = document.createElement("h3");
  header.className = "page-header";
  header.textContent = `Page ${pageNumberInBinder} — `;

  header.addEventListener("click", () => {
    section.classList.toggle("collapsed");
  });

  let longPressTimer;
  header.addEventListener('touchstart', () => {
    longPressTimer = setTimeout(() => {
        section.classList.toggle("collapsed");
    }, 500);
  }, { passive: true });

  header.addEventListener('touchend', () => {
      clearTimeout(longPressTimer);
  });

  header.addEventListener('touchmove', () => {
      clearTimeout(longPressTimer);
  });

  header.addEventListener('contextmenu', (event) => {
      event.preventDefault();
  });

  const setTooltip = document.getElementById("set-tooltip");

  const setCodes = Array.from(pageSets.entries()).map(([setCode, setObj]) => {
    const span = document.createElement("span");
    span.textContent = setCode.toUpperCase();
    span.style.cursor = "help";

    // Custom tooltip events
    span.addEventListener("mouseenter", e => {
        setTooltip.textContent = setObj.name;
        setTooltip.style.display = "block";
        positionTooltip(e, setTooltip);
    });
    span.addEventListener("mousemove", e => positionTooltip(e, setTooltip));
    span.addEventListener("mouseleave", () => {
        setTooltip.textContent = "";
        setTooltip.style.display = "none";
    });

    return span;
  });

  setCodes.forEach((span, index) => {
    header.appendChild(span);
    if (index < setCodes.length - 1) {
      header.appendChild(document.createTextNode(", "));
    }
  });

  appState.grid = document.createElement("div");
  appState.grid.className = "grid";

  appState.section.appendChild(header);
  appState.section.appendChild(appState.grid);
  appState.binder.appendChild(appState.section);
}

export function updateBinderCounts(binder) {
    if (binder) {
        const ownedCards = binder.querySelectorAll('.card.owned').length;
        const totalCards = binder.querySelectorAll('.card').length;
        const binderOwnedEl = binder.querySelector('.binder-owned');
        if (binderOwnedEl) binderOwnedEl.textContent = `Owned: ${ownedCards}/${totalCards}`;
    }
}

export function updateAllBinderCounts() {
    const binders = document.querySelectorAll('.binder');
    binders.forEach(updateBinderCounts);
}

export function createGlobalExportButton() {
  const settingsContainer = document.getElementById('card-settings');
  if (!settingsContainer) return;

  const exportButton = document.createElement('button');
  exportButton.textContent = 'Export All Missing Cards';
  exportButton.className = 'global-export-button';
  exportButton.addEventListener('click', () => {
    const allCards = document.querySelectorAll('.card');
    const missingCards = Array.from(allCards).filter(card => isCardMissing(card.cardData));

    if (missingCards.length === 0) {
      alert('No missing cards found.');
      return;
    }

    const cardNames = missingCards.map(card => card.cardData.name);
    showListModal('All Missing Cards', cardNames);
  });

  settingsContainer.appendChild(exportButton);
}