// src/__tests__/cards.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCardElement, updateCardState } from '../ui/cards.js';
import { appState } from '../state/appState.js';
import * as cardState from '../state/cardState.js';

vi.mock('../state/cardSettings.js', () => ({
  cardSettings: {
    persistentReveal: false,
    showTooltip: true,
  },
}));

vi.mock('../state/appState.js', () => ({
  appState: {
    isViewOnlyMode: false,
  },
}));

vi.mock('../state/cardState.js', () => ({
  isCardOwned: vi.fn(),
  toggleCardOwned: vi.fn(),
  setCardsOwned: vi.fn(),
}));

describe('createCardElement', () => {
  const card = {
    id: 'card1',
    name: 'Serra Angel',
    related_uris: {
      edhrec: 'http://edhrec.com/serra-angel',
    },
    color_identity: ['W'],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a card element with the correct class and data', () => {
    cardState.isCardOwned.mockReturnValue(false);
    const element = createCardElement(card, 0);
    expect(element.className).toBe('card loading has-toggle');
    expect(element.cardData).toEqual(card);
  });

  it('should create a card element with a name', () => {
    const element = createCardElement(card, 0);
    const nameElement = element.querySelector('.card-name');
    expect(nameElement.textContent).toBe('Serra Angel');
  });

  it('should create a card element with an EDHREC link', () => {
    const element = createCardElement(card, 0);
    const edhrecLink = element.querySelector('.edhrec-link');
    expect(edhrecLink.href).toBe('http://edhrec.com/serra-angel');
  });

  it('should draw the EDHREC icon in CSS instead of an <img>', () => {
    const element = createCardElement(card, 0);
    const edhrecLink = element.querySelector('.edhrec-link');
    expect(edhrecLink.querySelector('img')).toBeNull();
    expect(edhrecLink.getAttribute('aria-label')).toBe('View on EDHREC');
  });

  it('should resolve the owned state only once per card', () => {
    cardState.isCardOwned.mockReturnValue(false);
    createCardElement(card, 0);
    expect(cardState.isCardOwned).toHaveBeenCalledTimes(1);
  });

  it('should create a card element with a toggle button', () => {
    const element = createCardElement(card, 0);
    const toggleButton = element.querySelector('.card-toggle');
    expect(toggleButton).not.toBeNull();
  });

  it('should create a card element with an owned badge', () => {
    const element = createCardElement(card, 0);
    const ownedBadge = element.querySelector('.owned-badge');
    expect(ownedBadge).not.toBeNull();
  });

  it('should add the "owned" class if the card is not missing', () => {
    cardState.isCardOwned.mockReturnValue(true);
    const element = createCardElement(card, 0);
    updateCardState(element);
    expect(element.classList.contains('owned')).toBe(true);
  });

  it('should not add the "owned" class if the card is not owned', () => {
    cardState.isCardOwned.mockReturnValue(false);
    const element = createCardElement(card, 0);
    expect(element.classList.contains('owned')).toBe(false);
  });

  it('should not create a toggle button in view-only mode', () => {
    appState.isViewOnlyMode = true;
    const element = createCardElement(card, 0);
    const toggleButton = element.querySelector('.card-toggle');
    expect(toggleButton).toBeNull();
    appState.isViewOnlyMode = false; // Reset for other tests
  });
});

describe('updateCardState', () => {
    const card = {
        id: 'card1',
        name: 'Serra Angel',
        related_uris: {
        edhrec: 'http://edhrec.com/serra-angel',
        },
        color_identity: ['W'],
    };

    it('should remove the loading class', () => {
        const element = createCardElement(card, 0);
        expect(element.classList.contains('loading')).toBe(true);
        updateCardState(element);
        expect(element.classList.contains('loading')).toBe(false);
    });
});
