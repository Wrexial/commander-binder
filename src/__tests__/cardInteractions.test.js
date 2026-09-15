import { vi, describe, it, expect, beforeEach } from 'vitest';
import { initCardInteractions } from '../ui/cardInteractions.js';
import * as tooltip from '../ui/tooltip.js';
import { cardSettings } from '../state/cardSettings.js';
import { appState } from '../state/appState.js';
import * as cardState from '../state/cardState.js';
import * as toast from '../ui/components/toast.js';
import * as ownedCounter from '../ui/components/ownedCounter.js';
import * as layout from '../ui/layout.js';
import { cardStore } from '../state/cardStore.js';

// Mock all dependencies
vi.mock('../ui/tooltip.js');
vi.mock('../state/cardSettings.js');
vi.mock('../state/appState.js');
vi.mock('../state/cardState.js');
vi.mock('../ui/components/toast.js');
vi.mock('../ui/components/ownedCounter.js');
vi.mock('../ui/layout.js');
vi.mock('../state/cardStore.js', () => ({
  cardStore: {
    getPrintings: vi.fn(() => []),
    getPrintingPosition: vi.fn(() => ({ index: 1, total: 1 })),
  },
}));

describe('initCardInteractions', () => {
  let container, tooltipElement, cardElement;

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
    cardStore.getPrintings.mockReturnValue([]);
    tooltip.isTooltipGestureActive.mockReturnValue(false);
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
          tooltipElement
        );
      } finally {
        vi.useRealTimers();
      }
    });

    it('exposes a printing-cycle handler when a touch begins', () => {
      initCardInteractions(container, tooltipElement);
      startTouch(cardElement);

      expect(typeof tooltipElement.onCycle).toBe('function');
      // Cancel the pending long-press timer.
      cardElement.dispatchEvent(new Event('touchend', { bubbles: true }));
    });

    it('omits the printing-cycle handler in view-only mode', () => {
      appState.isViewOnlyMode = true;
      initCardInteractions(container, tooltipElement);
      startTouch(cardElement);

      expect(tooltipElement.onCycle).toBeNull();
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

    it('does not cycle the printing when a long press fires contextmenu', () => {
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
      expect(cardElement.cardData.id).toBe('p1');

      cardElement.dispatchEvent(new Event('touchend', { bubbles: true }));
    });

    it('cycles again once the touch sequence has finished', () => {
      const first = { id: 'p1', name: 'Card', released_at: '2020-01-01' };
      const second = { id: 'p2', name: 'Card', released_at: '2021-01-01' };
      cardElement.cardData = first;
      cardStore.getPrintings.mockReturnValue([first, second]);

      initCardInteractions(container, tooltipElement);
      startTouch(cardElement);
      cardElement.dispatchEvent(new Event('touchend', { bubbles: true }));

      cardElement.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

      expect(cardElement.cardData.id).toBe('p2');
    });

    it('cycles the printing on right-click without opening the tooltip', () => {
      const first = { id: 'p1', name: 'Card', released_at: '2020-01-01' };
      const second = { id: 'p2', name: 'Card', released_at: '2021-01-01' };
      cardElement.cardData = first;
      cardStore.getPrintings.mockReturnValue([first, second]);

      initCardInteractions(container, tooltipElement);
      cardElement.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

      expect(cardElement.cardData.id).toBe('p2');
      expect(tooltip.showTooltip).not.toHaveBeenCalled();
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
