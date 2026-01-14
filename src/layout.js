import { binderColors, CARDS_PER_PAGE, PAGES_PER_BINDER } from './config.js';
import { appState } from './appState.js';
import { lightenColor } from './utils/colors.js';
import { positionTooltip } from './tooltip.js';
import { isCardMissing } from './cardState.js';
import { showListModal } from './ui/modal.js';

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
  header.textContent = `Binder ${binderNumber}`;
  header.style.color = color;

  const ownedCount = document.createElement("span");
  ownedCount.className = "owned-count";
  header.appendChild(ownedCount);

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

export function updateBinderCounts(cardElement) {
    const binder = cardElement.closest('.binder');
    if (!binder) return;

    const ownedCards = binder.querySelectorAll('.card.owned').length;
    const totalCards = binder.querySelectorAll('.card').length;

    const ownedCountSpan = binder.querySelector('.owned-count');
    if (ownedCountSpan) {
        ownedCountSpan.textContent = `Owned: ${ownedCards} / ${totalCards}`;
    }
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