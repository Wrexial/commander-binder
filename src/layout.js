import { binderColors, CARDS_PER_PAGE, PAGES_PER_BINDER } from './config.js';
import { appState } from './appState.js';
import { lightenColor } from './utils/colors.js';
import { positionTooltip } from './tooltip.js';
import { getOwnedCardIds, isCardOwned } from './cardState.js';
import { cardStore } from './loadedCards.js';
import { showListModal } from './ui/modal.js';
import { showToast } from './ui/toast.js';

export function createGlobalBulkAddButton(onClick) {
  const container = document.getElementById('user-actions');
  if (!container) return;

  const bulkAddButton = document.createElement('button');
  bulkAddButton.textContent = 'Bulk Add';
  bulkAddButton.className = 'global-export-button';
  bulkAddButton.addEventListener('click', onClick);

  container.appendChild(bulkAddButton);
}

export function createGlobalBulkCheckButton(onClick) {
  const container = document.getElementById('user-actions');
  if (!container) return;

  const bulkCheckButton = document.createElement('button');
  bulkCheckButton.textContent = 'Bulk Check';
  bulkCheckButton.className = 'global-export-button';
  bulkCheckButton.addEventListener('click', onClick);

  container.appendChild(bulkCheckButton);
}

export function createGlobalExportOwnedButton() {
  const container = document.getElementById('user-actions');
  if (!container) return;

  const exportButton = document.createElement('button');
  exportButton.textContent = 'Export All Owned';
  exportButton.className = 'global-export-button';

  exportButton.addEventListener('click', async () => {
    const ownedCardIds = getOwnedCardIds();
    const ownedCards = cardStore.getAll().filter(c => ownedCardIds.has(c.id));

    if (ownedCards.length === 0) {
      alert('No owned cards to export.');
      return;
    }
    
    const cardNames = ownedCards.map(card => card.name);
    const textToCopy = cardNames.join('\n');

    navigator.clipboard.writeText(textToCopy).then(() => {
      showToast('Owned cards copied to clipboard!', 'success');
    }).catch(err => {
      console.error('Failed to copy text: ', err);
      showToast('Failed to copy cards. See console for details.', 'error');
    });
  });

  container.appendChild(exportButton);
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
  const container = document.getElementById('user-actions');
  if (!container) return;

  const exportButton = document.createElement('button');
  exportButton.textContent = 'Export All Missing Cards';
  exportButton.className = 'global-export-button';
  exportButton.addEventListener('click', () => {
    const allCards = document.querySelectorAll('.card');
    const missingCards = Array.from(allCards).filter(card => !isCardOwned(card.cardData));

    if (missingCards.length === 0) {
      alert('No missing cards found.');
      return;
    }

    const cardNames = missingCards.map(card => card.cardData.name);
    showListModal('All Missing Cards', cardNames);
  });

  container.appendChild(exportButton);
}