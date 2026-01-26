// src/cardInteractions.js
import { showTooltip, hideTooltip, positionTooltip } from './tooltip.js';
import { cardSettings } from "./cardSettings.js";
import { appState } from "./appState.js";
import { isCardOwned, toggleCardOwned, setCardsOwned } from "./cardState.js";
import { showUndo } from './ui/toast.js';
import { updateOwnedCounter } from './ui/ownedCounter.js';
import { updateBinderCounts } from './layout.js';
import { cardStore } from './loadedCards.js';

// Use a WeakMap to associate state with an element without memory leaks or polluting the DOM
const elementState = new WeakMap();
const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

function getState(el) {
    if (!elementState.has(el)) {
        elementState.set(el, {});
    }
    return elementState.get(el);
}

// --- Delegated Event Handlers ---

function handleMouseEnter(event, tooltip) {
    if (!cardSettings.showTooltip) return;
    const cardElement = event.target.closest('.card');
    if (cardElement) {
        cardElement.setAttribute('aria-describedby', 'tooltip');
        showTooltip(event, cardElement.cardData, tooltip);
    }
}

function handleMouseLeave(event, tooltip) {
    if (!cardSettings.showTooltip) return;
    const cardElement = event.target.closest('.card');
    // Check relatedTarget to prevent hiding when moving between child elements
    if (cardElement && !cardElement.contains(event.relatedTarget) && !tooltip.contains(event.relatedTarget)) {
        hideTooltip(tooltip);
        cardElement.removeAttribute('aria-describedby');
    }
}

function handleMouseMove(event, tooltip) {
    if (cardSettings.showTooltip && tooltip.style.display !== 'none') {
        positionTooltip(event, tooltip);
    }
}

let touchTimer;
let touchStartX, touchStartY;
function handleTouchStart(event, tooltip) {
    const cardElement = event.target.closest('.card');
    if (!cardElement) return;

    touchStartX = event.touches[0].clientX;
    touchStartY = event.touches[0].clientY;

    const state = getState(cardElement);
    state.isLongPress = false;

    touchTimer = setTimeout(() => {
        state.isLongPress = true;
        showTooltip(event.touches[0], cardElement.cardData, tooltip);
        if (navigator.vibrate) navigator.vibrate(10);
    }, 500);
}

function handleTouchMove(event) {
    const touch = event.touches[0];
    const dx = Math.abs(touch.clientX - touchStartX);
    const dy = Math.abs(touch.clientY - touchStartY);
    if (dx > 10 || dy > 10) {
        clearTimeout(touchTimer);
    }
}

function handleTouchEnd(event) {
    clearTimeout(touchTimer);
    const cardElement = event.target.closest('.card');
    if (!cardElement) return;

    const state = getState(cardElement);
    if (state.isLongPress) {
        state.suppressUntil = Date.now() + 100;
        state.isLongPress = false;
        // preventDefault might not be enough to stop the simulated click
    }
}

async function handleContainerClick(event) {
    const cardElement = event.target.closest('.card');
    // Ignore clicks if they aren't on a card, are on the EDHREC link, or in view-only mode
    if (!cardElement || event.target.closest('.edhrec-link') || appState.isViewOnlyMode) {
        return;
    }
    
    const card = cardElement.cardData;
    if (!card) return;

    // Suppress clicks after a long-press (logic can be expanded here)
    const state = getState(cardElement);
    if (state.suppressUntil && Date.now() < state.suppressUntil) return;

    const wasMissing = !isCardOwned(card);
    event.stopPropagation();
    
    const isOwned = await toggleCardOwned(card);
    cardElement.classList.toggle("owned", isOwned);

    const toggleBtn = cardElement.querySelector('.card-toggle');
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-pressed', isOwned.toString());
      toggleBtn.setAttribute('aria-label', isOwned ? 'Mark as missing' : 'Mark as owned');
    }

    updateOwnedCounter(); // Update global counter
    updateBinderCounts(cardElement.closest('.binder'));

    // Undo logic
    showUndo(isOwned ? 'Marked as owned' : 'Marked as missing', async () => {
        await setCardsOwned([card], !wasMissing);
        cardElement.classList.toggle('owned', !wasMissing);
        if (toggleBtn) {
          toggleBtn.setAttribute('aria-pressed', (!wasMissing).toString());
          toggleBtn.setAttribute('aria-label', wasMissing ? 'Mark as owned' : 'Mark as missing');
        }
        updateOwnedCounter();
        updateBinderCounts(cardElement);
    });
}

function handleContextMenu(event, tooltip) {
    const cardElement = event.target.closest('.card');
    if (!cardElement) return;

    event.preventDefault();

    if (tooltip.style.display === 'none') return;
    
    if (appState.isViewOnlyMode) return;

    event.preventDefault();

    const cardName = cardElement.cardData.name;
    const printings = cardStore.getPrintings(cardName);
    if (printings.length <= 1) return;

    const state = getState(cardElement);
    const currentIndex = state.printingIndex || 0;
    const nextIndex = (currentIndex + 1) % printings.length;
    state.printingIndex = nextIndex;

    const nextPrinting = printings[nextIndex];
    cardElement.cardData = nextPrinting; 

    // Re-show the tooltip with the new card data
    showTooltip(event, nextPrinting, tooltip);
}


// --- Main Initialization ---

export function initCardInteractions(container, tooltip) {
    container.addEventListener("mouseover", e => handleMouseEnter(e, tooltip));
    container.addEventListener("mouseout", e => handleMouseLeave(e, tooltip));
    container.addEventListener("mousemove", e => handleMouseMove(e, tooltip));
    container.addEventListener("click", handleContainerClick);
    container.addEventListener("contextmenu", e => handleContextMenu(e, tooltip));

    container.addEventListener("touchstart", e => handleTouchStart(e, tooltip), { passive: true });
    container.addEventListener("touchmove", handleTouchMove, { passive: true });
    container.addEventListener("touchend", handleTouchEnd);
}
