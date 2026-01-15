// src/__tests__/cards.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCardElement, updateCardState } from '../cards';
import { appState } from '../appState';
import * as cardState from '../cardState';

vi.mock('../cardSettings', () => ({
  cardSettings: {
    persistentReveal: false,
    showTooltip: true,
  },
}));

vi.mock('../appState', () => ({
  appState: {
    isViewOnlyMode: false,
  },
}));

vi.mock('../cardState', () => ({
  isCardMissing: vi.fn(),
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
    cardState.isCardMissing.mockReturnValue(true);
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
    cardState.isCardMissing.mockReturnValue(false);
    const element = createCardElement(card, 0);
    updateCardState(element);
    expect(element.classList.contains('owned')).toBe(true);
  });

  it('should not add the "owned" class if the card is missing', () => {
    cardState.isCardMissing.mockReturnValue(true);
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
