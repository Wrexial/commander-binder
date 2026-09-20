import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initCardInteractions } from '../ui/cardInteractions.js';
import * as tooltip from '../ui/tooltip.js';
import { cardSettings } from '../state/cardSettings.js';
import { appState } from '../state/appState.js';
import * as cardState from '../state/cardState.js';
import * as wishlistState from '../state/wishlistState.js';
import { getSelectedCards, setSelectionMode } from '../state/selectionState.js';
import * as toast from '../ui/components/toast.js';
import * as ownedCounter from '../ui/components/ownedCounter.js';
import * as layout from '../ui/layout.js';
import { cardStore } from '../state/cardStore.js';
import { rememberPreferredPrinting } from '../state/preferredPrintings.js';

// The printing picker is mocked so tests can assert it opens and then simulate a
// pick without building the whole modal.
const printingPicker = vi.hoisted(() => ({ openPrintingPicker: vi.fn() }));
vi.mock('../ui/components/printingPickerModal.js', () => ({
  openPrintingPicker: printingPicker.openPrintingPicker,
}));

/** Simulate the user choosing a printing in the (mocked) picker. */
function choosePrinting(printing) {
  const config = printingPicker.openPrintingPicker.mock.calls.at(-1)?.[0];
  config?.onPick?.(printing);
}

// Mock all dependencies
vi.mock('../ui/tooltip.js');
vi.mock('../state/cardSettings.js');
vi.mock('../state/appState.js');
vi.mock('../state/cardState.js');
vi.mock('../state/wishlistState.js', () => ({
  isCardWanted: vi.fn(() => false),
  toggleCardWanted: vi.fn(() => Promise.resolve(true)),
  setCardsWanted: vi.fn(() => Promise.resolve()),
}));
vi.mock('../ui/components/toast.js');
vi.mock('../ui/components/ownedCounter.js');
vi.mock('../ui/layout.js');
vi.mock('../state/cardStore.js', async (importOriginal) => ({
  ...(await importOriginal()),
  cardStore: {
    getPrintings: vi.fn(() => []),
    getPrintingPosition: vi.fn(() => ({ index: 1, total: 1 })),
  },
}));
vi.mock('../state/preferredPrintings.js', () => ({
  rememberPreferredPrinting: vi.fn(),
}));

describe('initCardInteractions', () => {
  let container, tooltipElement, cardElement;

  afterEach(() => {
    setSelectionMode(false);
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Setup DOM
    document.body.innerHTML = `
      <div id="container">
        <div class="binder">
            <div class="card" style="width: 100px; height: 100px;">
            <a class="edhrec-link">EDHREC</a>
            <button class="card-toggle"></button>
            </div>
        </div>
      </div>
      <div id="tooltip"></div>
    `;
    container = document.getElementById('container');
    tooltipElement = document.getElementById('tooltip');
    cardElement = container.querySelector('.card');
    cardElement.cardData = { id: 'test-card-id', name: 'Test Card' };

    // Mock initial state
    cardSettings.showTooltip = true;
    appState.isViewOnlyMode = false;
    cardState.toggleCardOwned.mockResolvedValue(true); // Assume it becomes owned
    cardState.isCardOwned.mockReturnValue(false); // Assume it was not owned before click
    wishlistState.isCardWanted.mockReturnValue(false);
    cardStore.getPrintings.mockReturnValue([]);
    tooltip.isTooltipGestureActive.mockReturnValue(false);
    printingPicker.openPrintingPicker.mockReset();
  });

  describe('Card tooltip (touch only)', () => {
    /** Dispatch a touchstart with coordinates onto an element. */
    function startTouch(target) {
      const event = new Event('touchstart', { bubbles: true });
      event.touches = [{ clientX: 10, clientY: 10 }];
      target.dispatchEvent(event);
    }

    it('does not open on mouse hover (PC uses the tile footer)', () => {
      initCardInteractions(container, tooltipElement);
      cardElement.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      cardElement.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
      expect(tooltip.showTooltip).not.toHaveBeenCalled();
    });

    it('opens after a touch long-press', () => {
      vi.useFakeTimers();
      try {
        initCardInteractions(container, tooltipElement);
        startTouch(cardElement);

        expect(tooltip.showTooltip).not.toHaveBeenCalled();
        vi.advanceTimersByTime(500);
        expect(tooltip.showTooltip).toHaveBeenCalledWith(
          expect.anything(),
          cardElement.cardData,
          tooltipElement,
          { modal: true }
        );
      } finally {
        vi.useRealTimers();
      }
    });

    it('exposes a printing-picker handler when a touch begins', () => {
      initCardInteractions(container, tooltipElement);
      startTouch(cardElement);

      expect(typeof tooltipElement.onChoosePrinting).toBe('function');
      // Cancel the pending long-press timer.
      cardElement.dispatchEvent(new Event('touchend', { bubbles: true }));
    });

    it('does not wire a printing-picker handler for a binder pocket in a guest view', () => {
      appState.isViewOnlyMode = true;
      cardElement.dataset.binderSlot = '0:0:0';

      initCardInteractions(container, tooltipElement);
      startTouch(cardElement);

      expect(tooltipElement.onChoosePrinting).toBeNull();
      // Cancel the pending long-press timer.
      cardElement.dispatchEvent(new Event('touchend', { bubbles: true }));
    });

    it('wires a binder pocket preview without the collection controls', () => {
      cardElement.dataset.binderSlot = '0:0:0';
      initCardInteractions(container, tooltipElement);

      startTouch(cardElement);

      expect(tooltipElement.collection).toBe(false);
      expect(tooltipElement.onToggle).toBeNull();
      expect(tooltipElement.onWishlistToggle).toBeNull();
      cardElement.dispatchEvent(new Event('touchend', { bubbles: true }));
    });

    it('keeps the collection controls for a browse-grid preview', () => {
      initCardInteractions(container, tooltipElement);

      startTouch(cardElement);

      expect(tooltipElement.collection).toBe(true);
      expect(typeof tooltipElement.onToggle).toBe('function');
      expect(typeof tooltipElement.onWishlistToggle).toBe('function');
      cardElement.dispatchEvent(new Event('touchend', { bubbles: true }));
    });

    /** Add a card tile with `cardData` to the binder and return it. */
    function addCard(id, name) {
      const tile = document.createElement('div');
      tile.className = 'card';
      tile.cardData = { id, name };
      container.querySelector('.binder').appendChild(tile);
      return tile;
    }

    it('exposes a navigation handler that walks the visible grid', () => {
      container.querySelector('.binder').innerHTML = '';
      const first = addCard('c1', 'First');
      const second = addCard('c2', 'Second');
      const third = addCard('c3', 'Third');

      initCardInteractions(container, tooltipElement);
      startTouch(second);

      expect(typeof tooltipElement.onNavigate).toBe('function');

      tooltipElement.onNavigate(1, { clientX: 0, clientY: 0 });
      expect(tooltip.showTooltipCard).toHaveBeenLastCalledWith(
        third.cardData,
        tooltipElement,
        expect.anything()
      );

      // At the end of the grid there is nowhere further to go.
      tooltipElement.onNavigate(1, { clientX: 0, clientY: 0 });
      expect(tooltip.showTooltipCard).toHaveBeenCalledTimes(1);

      // Swiping back walks one card at a time from wherever we are now.
      tooltipElement.onNavigate(-1, { clientX: 0, clientY: 0 });
      expect(tooltip.showTooltipCard).toHaveBeenLastCalledWith(
        second.cardData,
        tooltipElement,
        expect.anything()
      );

      tooltipElement.onNavigate(-1, { clientX: 0, clientY: 0 });
      expect(tooltip.showTooltipCard).toHaveBeenLastCalledWith(
        first.cardData,
        tooltipElement,
        expect.anything()
      );

      cardElement.dispatchEvent(new Event('touchend', { bubbles: true }));
    });

    it('skips cards hidden by the active filter when navigating', () => {
      const hidden = addCard('c-hidden', 'Hidden');
      hidden.style.display = 'none';
      const shown = addCard('c-shown', 'Shown');

      initCardInteractions(container, tooltipElement);
      startTouch(cardElement);

      tooltipElement.onNavigate(1, { clientX: 0, clientY: 0 });

      expect(tooltip.showTooltipCard).toHaveBeenCalledWith(
        shown.cardData,
        tooltipElement,
        expect.anything()
      );

      cardElement.dispatchEvent(new Event('touchend', { bubbles: true }));
    });

    it('does not navigate past the ends of the grid', () => {
      initCardInteractions(container, tooltipElement);
      startTouch(cardElement);

      // cardElement is the only visible card.
      tooltipElement.onNavigate(-1, { clientX: 0, clientY: 0 });
      tooltipElement.onNavigate(1, { clientX: 0, clientY: 0 });

      expect(tooltip.showTooltipCard).not.toHaveBeenCalled();
      cardElement.dispatchEvent(new Event('touchend', { bubbles: true }));
    });

    it('exposes the printing-picker handler in view-only (guest) mode', () => {
      appState.isViewOnlyMode = true;
      initCardInteractions(container, tooltipElement);
      startTouch(cardElement);

      expect(typeof tooltipElement.onChoosePrinting).toBe('function');
      cardElement.dispatchEvent(new Event('touchend', { bubbles: true }));
      appState.isViewOnlyMode = false;
    });

    it('opens the printing picker from the tooltip and applies the pick', () => {
      const first = { id: 'p1', name: 'Card', released_at: '2020-01-01' };
      const second = { id: 'p2', name: 'Card', released_at: '2021-01-01' };
      cardElement.cardData = first;
      appState.isViewOnlyMode = true;

      initCardInteractions(container, tooltipElement);
      startTouch(cardElement);
      tooltipElement.onChoosePrinting(new Event('click'));

      expect(printingPicker.openPrintingPicker).toHaveBeenCalledWith(
        expect.objectContaining({ card: first, currentId: 'p1' })
      );

      choosePrinting(second);
      expect(cardElement.cardData.id).toBe('p2');

      cardElement.dispatchEvent(new Event('touchend', { bubbles: true }));
      appState.isViewOnlyMode = false;
    });

    it('still suppresses the browser menu on right-click', () => {
      initCardInteractions(container, tooltipElement);
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      cardElement.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(tooltip.showTooltip).not.toHaveBeenCalled();
    });

    it('does not open the printing picker when a long press fires contextmenu', () => {
      const first = { id: 'p1', name: 'Card', released_at: '2020-01-01' };
      const second = { id: 'p2', name: 'Card', released_at: '2021-01-01' };
      cardElement.cardData = first;
      cardStore.getPrintings.mockReturnValue([first, second]);

      initCardInteractions(container, tooltipElement);
      startTouch(cardElement);

      // Browsers fire this partway through a long press, before touchend.
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      cardElement.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(printingPicker.openPrintingPicker).not.toHaveBeenCalled();
      expect(cardElement.cardData.id).toBe('p1');

      cardElement.dispatchEvent(new Event('touchend', { bubbles: true }));
    });

    it('opens the picker again once the touch sequence has finished', () => {
      const first = { id: 'p1', name: 'Card', released_at: '2020-01-01' };
      const second = { id: 'p2', name: 'Card', released_at: '2021-01-01' };
      cardElement.cardData = first;
      cardStore.getPrintings.mockReturnValue([first, second]);

      initCardInteractions(container, tooltipElement);
      startTouch(cardElement);
      cardElement.dispatchEvent(new Event('touchend', { bubbles: true }));

      cardElement.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

      expect(printingPicker.openPrintingPicker).toHaveBeenCalledWith(
        expect.objectContaining({ card: first })
      );
    });

    it('opens the printing picker on right-click without opening the tooltip', () => {
      const first = { id: 'p1', name: 'Card', released_at: '2020-01-01' };
      const second = { id: 'p2', name: 'Card', released_at: '2021-01-01' };
      cardElement.cardData = first;
      cardStore.getPrintings.mockReturnValue([first, second]);

      initCardInteractions(container, tooltipElement);
      cardElement.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

      expect(printingPicker.openPrintingPicker).toHaveBeenCalledWith(
        expect.objectContaining({ card: first, currentId: 'p1' })
      );
      expect(tooltip.showTooltip).not.toHaveBeenCalled();
    });

    it('remembers the chosen printing so the grid keeps showing it', () => {
      const first = { id: 'p1', name: 'Card', released_at: '2020-01-01' };
      const second = { id: 'p2', name: 'Card', released_at: '2021-01-01' };
      cardElement.cardData = first;
      cardStore.getPrintings.mockReturnValue([first, second]);

      initCardInteractions(container, tooltipElement);
      cardElement.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      choosePrinting(second);

      expect(rememberPreferredPrinting).toHaveBeenCalledWith(second);
    });

    it('saves a binder pocket printing on its slot instead of the global preference', () => {
      const first = { id: 'p1', name: 'Card', released_at: '2020-01-01' };
      const second = { id: 'p2', name: 'Card', released_at: '2021-01-01' };
      cardElement.cardData = first;
      cardElement.dataset.binderSlot = '0:0:0';
      cardStore.getPrintings.mockReturnValue([first, second]);

      const details = [];
      document.addEventListener('binder:printing-changed', (event) => details.push(event.detail), {
        once: true,
      });

      initCardInteractions(container, tooltipElement);
      cardElement.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      choosePrinting(second);

      expect(cardElement.cardData.id).toBe('p2');
      expect(rememberPreferredPrinting).not.toHaveBeenCalled();
      expect(details).toEqual([{ slotKey: '0:0:0', printingId: 'p2' }]);
    });

    it('does not open the picker for a binder pocket in a share/guest view', () => {
      const first = { id: 'p1', name: 'Card', released_at: '2020-01-01' };
      const second = { id: 'p2', name: 'Card', released_at: '2021-01-01' };
      appState.isViewOnlyMode = true;
      cardElement.cardData = first;
      cardElement.dataset.binderSlot = '0:0:0';
      cardStore.getPrintings.mockReturnValue([first, second]);

      initCardInteractions(container, tooltipElement);
      cardElement.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

      expect(printingPicker.openPrintingPicker).not.toHaveBeenCalled();
      expect(cardElement.cardData.id).toBe('p1');
      expect(rememberPreferredPrinting).not.toHaveBeenCalled();
    });

    it('still opens the picker for a grid tile in a share/guest view', () => {
      const first = { id: 'p1', name: 'Card', released_at: '2020-01-01' };
      const second = { id: 'p2', name: 'Card', released_at: '2021-01-01' };
      appState.isViewOnlyMode = true;
      cardElement.cardData = first;
      cardStore.getPrintings.mockReturnValue([first, second]);

      initCardInteractions(container, tooltipElement);
      cardElement.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

      expect(printingPicker.openPrintingPicker).toHaveBeenCalled();
      choosePrinting(second);
      expect(cardElement.cardData.id).toBe('p2');
    });

    it('opens the printing picker when the version badge is activated, without toggling ownership', async () => {
      const first = { id: 'p1', name: 'Card', released_at: '2020-01-01' };
      const second = { id: 'p2', name: 'Card', released_at: '2021-01-01' };
      cardElement.cardData = first;
      cardStore.getPrintings.mockReturnValue([first, second]);

      const badge = document.createElement('button');
      badge.className = 'card-versions';
      cardElement.appendChild(badge);

      initCardInteractions(container, tooltipElement);
      badge.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(printingPicker.openPrintingPicker).toHaveBeenCalledWith(
        expect.objectContaining({ card: first, currentId: 'p1' })
      );
      expect(cardState.toggleCardOwned).not.toHaveBeenCalled();
    });
  });

  describe('Click Interactions', () => {
    it('should toggle card ownership on click', async () => {
      initCardInteractions(container, tooltipElement);
      await cardElement.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(cardState.toggleCardOwned).toHaveBeenCalledWith(cardElement.cardData);
      expect(cardElement.classList.contains('owned')).toBe(true);
      expect(ownedCounter.updateOwnedCounter).toHaveBeenCalled();
      expect(toast.showUndo).toHaveBeenCalled();
    });

    it('selects a card instead of toggling ownership in bulk-select mode', async () => {
      setSelectionMode(true);
      initCardInteractions(container, tooltipElement);

      await cardElement.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(cardState.toggleCardOwned).not.toHaveBeenCalled();
      expect(cardElement.classList.contains('selected')).toBe(true);
      expect(getSelectedCards()).toHaveLength(1);
    });

    it('toggles the wishlist from the heart without touching ownership', async () => {
      cardElement.cardData = { id: 'wish-1', name: 'Wish Card' };
      const heart = document.createElement('button');
      heart.className = 'card-wishlist';
      cardElement.appendChild(heart);
      wishlistState.toggleCardWanted.mockResolvedValue(true);

      initCardInteractions(container, tooltipElement);
      await heart.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(wishlistState.toggleCardWanted).toHaveBeenCalledWith(cardElement.cardData);
      expect(cardState.toggleCardOwned).not.toHaveBeenCalled();
      expect(cardElement.classList.contains('wanted')).toBe(true);
    });

    it('should update binder counts on click', async () => {
      initCardInteractions(container, tooltipElement);
      await cardElement.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      const binderElement = container.querySelector('.binder');
      expect(layout.adjustBinderOwnedCount).toHaveBeenCalledWith(binderElement, 1);
    });

    it('should not toggle ownership when in view-only mode', async () => {
      appState.isViewOnlyMode = true;
      initCardInteractions(container, tooltipElement);
      await cardElement.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(cardState.toggleCardOwned).not.toHaveBeenCalled();
    });

    it('never edits ownership or wishlist from a binder pocket', async () => {
      cardElement.dataset.binderSlot = '0:0:0';
      // A pocket tile wouldn't normally carry a heart; make sure even a stray
      // tap on one is ignored.
      const heart = document.createElement('button');
      heart.className = 'card-wishlist';
      cardElement.appendChild(heart);
      wishlistState.toggleCardWanted.mockResolvedValue(true);

      initCardInteractions(container, tooltipElement);
      await cardElement.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await heart.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(cardState.toggleCardOwned).not.toHaveBeenCalled();
      expect(wishlistState.toggleCardWanted).not.toHaveBeenCalled();
    });

    it('should not toggle ownership while a tooltip gesture is active', async () => {
      tooltip.isTooltipGestureActive.mockReturnValue(true);
      initCardInteractions(container, tooltipElement);
      await cardElement.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(cardState.toggleCardOwned).not.toHaveBeenCalled();
    });

    it('should toggle ownership once the tooltip gesture has settled', async () => {
      tooltip.isTooltipGestureActive.mockReturnValue(false);
      initCardInteractions(container, tooltipElement);
      await cardElement.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(cardState.toggleCardOwned).toHaveBeenCalledTimes(1);
    });

    it('should not toggle ownership when clicking on edhrec link', async () => {
      initCardInteractions(container, tooltipElement);
      const edhrecLink = cardElement.querySelector('.edhrec-link');
      await edhrecLink.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(cardState.toggleCardOwned).not.toHaveBeenCalled();
    });

    it('toggles ownership on a short click on a pointer device', async () => {
      vi.stubGlobal('matchMedia', () => ({
        matches: true,
        addEventListener() {},
        removeEventListener() {},
      }));
      initCardInteractions(container, tooltipElement);

      await cardElement.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(cardState.toggleCardOwned).toHaveBeenCalledWith(cardElement.cardData);
      expect(tooltip.showTooltip).not.toHaveBeenCalled();
    });

    it('opens the modal preview after a long mouse press, with a progress ring', () => {
      vi.useFakeTimers();
      vi.stubGlobal('matchMedia', () => ({
        matches: true,
        addEventListener() {},
        removeEventListener() {},
      }));
      initCardInteractions(container, tooltipElement);

      cardElement.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, clientX: 20, clientY: 20 })
      );
      expect(document.querySelector('.press-indicator.active')).not.toBeNull();

      vi.advanceTimersByTime(500);

      expect(tooltip.showTooltip).toHaveBeenCalledWith(
        expect.anything(),
        cardElement.cardData,
        tooltipElement,
        { modal: true }
      );
      // The ring is gone once the gesture completes.
      expect(document.querySelector('.press-indicator.active')).toBeNull();

      cardElement.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });

    it('does not open the preview when the mouse press is released early', () => {
      vi.useFakeTimers();
      vi.stubGlobal('matchMedia', () => ({
        matches: true,
        addEventListener() {},
        removeEventListener() {},
      }));
      initCardInteractions(container, tooltipElement);

      cardElement.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, clientX: 20, clientY: 20 })
      );
      expect(document.querySelector('.press-indicator.active')).not.toBeNull();

      cardElement.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      vi.advanceTimersByTime(500);

      expect(tooltip.showTooltip).not.toHaveBeenCalled();
      expect(document.querySelector('.press-indicator.active')).toBeNull();
    });

    it('cancels a long mouse press when the pointer moves', () => {
      vi.useFakeTimers();
      vi.stubGlobal('matchMedia', () => ({
        matches: true,
        addEventListener() {},
        removeEventListener() {},
      }));
      initCardInteractions(container, tooltipElement);

      cardElement.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, clientX: 20, clientY: 20 })
      );
      cardElement.dispatchEvent(
        new MouseEvent('mousemove', { bubbles: true, clientX: 80, clientY: 80 })
      );
      vi.advanceTimersByTime(500);

      expect(tooltip.showTooltip).not.toHaveBeenCalled();
    });

    it('does not start a long press on the ownership button', () => {
      vi.useFakeTimers();
      vi.stubGlobal('matchMedia', () => ({
        matches: true,
        addEventListener() {},
        removeEventListener() {},
      }));
      initCardInteractions(container, tooltipElement);

      const toggle = cardElement.querySelector('.card-toggle');
      toggle.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, clientX: 20, clientY: 20 })
      );
      vi.advanceTimersByTime(500);

      expect(tooltip.showTooltip).not.toHaveBeenCalled();
      expect(document.querySelector('.press-indicator.active')).toBeNull();
    });

    it('still toggles via the card-toggle button on a pointer device', async () => {
      vi.stubGlobal('matchMedia', () => ({
        matches: true,
        addEventListener() {},
        removeEventListener() {},
      }));
      initCardInteractions(container, tooltipElement);

      const toggle = cardElement.querySelector('.card-toggle');
      await toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(cardState.toggleCardOwned).toHaveBeenCalled();
      expect(tooltip.showTooltip).not.toHaveBeenCalled();
    });

    it('opens a preview when the card:preview event fires (Surprise me)', () => {
      initCardInteractions(container, tooltipElement);

      document.dispatchEvent(
        new CustomEvent('card:preview', {
          detail: { element: cardElement, card: cardElement.cardData },
        })
      );

      expect(tooltip.showTooltip).toHaveBeenCalledWith(
        expect.anything(),
        cardElement.cardData,
        tooltipElement,
        { modal: true }
      );
    });

    it('exposes a status toggle for the preview', async () => {
      initCardInteractions(container, tooltipElement);
      document.dispatchEvent(
        new CustomEvent('card:preview', {
          detail: { element: cardElement, card: cardElement.cardData },
        })
      );

      expect(typeof tooltipElement.onToggle).toBe('function');

      await tooltipElement.onToggle();

      expect(cardState.toggleCardOwned).toHaveBeenCalledWith(cardElement.cardData);
      expect(ownedCounter.updateOwnedCounter).toHaveBeenCalled();
    });

    it('disables the preview status toggle in view-only mode', () => {
      appState.isViewOnlyMode = true;
      initCardInteractions(container, tooltipElement);
      document.dispatchEvent(
        new CustomEvent('card:preview', {
          detail: { element: cardElement, card: cardElement.cardData },
        })
      );

      expect(tooltipElement.onToggle).toBeNull();
      appState.isViewOnlyMode = false;
    });

    it('should revert ownership when undo is clicked', async () => {
      initCardInteractions(container, tooltipElement);
      await cardElement.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      // Check initial toggle
      expect(cardElement.classList.contains('owned')).toBe(true);

      // Get the undo callback
      const undoCallback = toast.showUndo.mock.calls[0][1];

      // Mock the revert call
      cardState.setCardsOwned.mockResolvedValue(undefined);

      // Execute undo
      await undoCallback();

      // Check if state is reverted
      expect(cardState.setCardsOwned).toHaveBeenCalledWith([cardElement.cardData], false);
      expect(cardElement.classList.contains('owned')).toBe(false);
      expect(ownedCounter.updateOwnedCounter).toHaveBeenCalledTimes(2); // Initial call + undo call
    });
  });
});
