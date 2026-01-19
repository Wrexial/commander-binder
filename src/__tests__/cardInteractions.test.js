
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { initCardInteractions } from '../cardInteractions.js';
import * as tooltip from '../tooltip.js';
import { cardSettings } from '../cardSettings.js';
import { appState } from '../appState.js';
import * as cardState from '../cardState.js';
import * as toast from '../ui/toast.js';
import * as ownedCounter from '../ui/ownedCounter.js';
import * as layout from '../layout.js';

// Mock all dependencies
vi.mock('../tooltip.js');
vi.mock('../cardSettings.js');
vi.mock('../appState.js');
vi.mock('../cardState.js');
vi.mock('../ui/toast.js');
vi.mock('../ui/ownedCounter.js');
vi.mock('../layout.js');

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
  });

  describe('Tooltip Interactions', () => {
    it('should show tooltip on mouseover if enabled', () => {
      initCardInteractions(container, tooltipElement);
      cardElement.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      expect(tooltip.showTooltip).toHaveBeenCalledWith(expect.any(Event), cardElement.cardData, tooltipElement);
      expect(cardElement.getAttribute('aria-describedby')).toBe('tooltip');
    });

    it('should not show tooltip on mouseover if disabled', () => {
      cardSettings.showTooltip = false;
      initCardInteractions(container, tooltipElement);
      cardElement.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      expect(tooltip.showTooltip).not.toHaveBeenCalled();
    });

    it('should hide tooltip on mouseout', () => {
      initCardInteractions(container, tooltipElement);
      cardElement.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
      expect(tooltip.hideTooltip).toHaveBeenCalledWith(tooltipElement);
      expect(cardElement.hasAttribute('aria-describedby')).toBe(false);
    });

    it('should not hide tooltip when moving between child elements', () => {
        initCardInteractions(container, tooltipElement);
        const childLink = cardElement.querySelector('.edhrec-link');
        cardElement.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: childLink }));
        expect(tooltip.hideTooltip).not.toHaveBeenCalled();
    });

    it('should position tooltip on mousemove if visible', () => {
      tooltipElement.style.display = 'block';
      initCardInteractions(container, tooltipElement);
      container.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
      expect(tooltip.positionTooltip).toHaveBeenCalledWith(expect.any(Event), tooltipElement);
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
      expect(layout.updateBinderCounts).toHaveBeenCalledWith(binderElement);
    });

    it('should not toggle ownership when in view-only mode', async () => {
        appState.isViewOnlyMode = true;
        initCardInteractions(container, tooltipElement);
        await cardElement.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        
        expect(cardState.toggleCardOwned).not.toHaveBeenCalled();
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
