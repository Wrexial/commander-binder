// src/__tests__/cards.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createCardElement,
  updateCardState,
  applyDisplayMode,
  applyPreferredPrintings,
  refreshCardElement,
  updateCardVersionCounts,
} from '../ui/cards.js';
import { appState } from '../state/appState.js';
import { cardSettings } from '../state/cardSettings.js';
import { cardStore } from '../state/cardStore.js';
import * as cardState from '../state/cardState.js';
import { isCardWanted } from '../state/wishlistState.js';
import { getPreferredPrinting } from '../state/preferredPrintings.js';
import { clearSelection, setSelectionMode, toggleSelection } from '../state/selectionState.js';

vi.mock('../state/cardSettings.js', () => ({
  cardSettings: {
    showTooltip: true,
    displayMode: 'text',
  },
}));

vi.mock('../state/appState.js', () => ({
  appState: {
    isViewOnlyMode: false,
  },
}));

vi.mock('../state/preferredPrintings.js', () => ({
  getPreferredPrinting: vi.fn(() => null),
}));

vi.mock('../state/cardState.js', () => ({
  isCardOwned: vi.fn(),
  toggleCardOwned: vi.fn(),
  setCardsOwned: vi.fn(),
}));

vi.mock('../state/wishlistState.js', () => ({
  isCardWanted: vi.fn(() => false),
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

describe('wishlist heart', () => {
  const heartCard = { id: 'heart-1', name: 'Heart Card', color_identity: ['W'] };

  beforeEach(() => {
    cardState.isCardOwned.mockReturnValue(false);
    isCardWanted.mockReturnValue(false);
  });

  it('renders a heart and marks the tile when the card is wanted', () => {
    isCardWanted.mockReturnValue(true);

    const element = createCardElement(heartCard, 0);
    expect(element.querySelector('.card-wishlist')).not.toBeNull();

    updateCardState(element);
    expect(element.classList.contains('wanted')).toBe(true);
    expect(element.querySelector('.card-wishlist').getAttribute('aria-pressed')).toBe('true');
  });

  it('shows a read-only badge instead of a heart in view-only mode', () => {
    isCardWanted.mockReturnValue(true);
    appState.isViewOnlyMode = true;

    const element = createCardElement(heartCard, 0);
    expect(element.querySelector('.card-wishlist')).toBeNull();
    expect(element.querySelector('.wanted-badge')).not.toBeNull();

    appState.isViewOnlyMode = false;
  });
});

describe('selection outline', () => {
  const selectedCard = { id: 'sel-1', name: 'Select Me', color_identity: [] };

  afterEach(() => {
    setSelectionMode(false);
    clearSelection();
    document.body.innerHTML = '';
  });

  it('toggles the selected class from the shared selection state', () => {
    cardState.isCardOwned.mockReturnValue(false);
    const element = createCardElement(selectedCard, 0);
    document.body.appendChild(element);

    setSelectionMode(true);
    toggleSelection(selectedCard);
    updateCardState(element);
    expect(element.classList.contains('selected')).toBe(true);

    clearSelection();
    updateCardState(element);
    expect(element.classList.contains('selected')).toBe(false);
  });
});

describe('displayed printing price', () => {
  const pricedCard = (overrides = {}) => ({
    id: 'priced',
    name: 'Serra Angel',
    color_identity: ['W'],
    prices: { eur: '12.50', eur_foil: '30.00' },
    ...overrides,
  });

  beforeEach(() => {
    cardState.isCardOwned.mockReturnValue(false);
  });

  it("shows the displayed printing's own price, not a cheaper reprint", () => {
    const element = createCardElement(pricedCard(), 0);
    expect(element.querySelector('.card-price').textContent).toBe('€12.50');
  });

  it('falls back to the foil price when there is no non-foil price', () => {
    const element = createCardElement(pricedCard({ prices: { eur: null, eur_foil: '7.25' } }), 0);
    expect(element.querySelector('.card-price').textContent).toBe('€7.25');
  });

  it('omits the badge when the printing has no price', () => {
    const element = createCardElement(pricedCard({ prices: {} }), 0);
    expect(element.querySelector('.card-price')).toBeNull();
  });

  it('updates the price when the displayed printing changes', () => {
    const element = createCardElement(pricedCard(), 0);
    expect(element.querySelector('.card-price').textContent).toBe('€12.50');

    element.cardData = pricedCard({ id: 'cheap', prices: { eur: '1.00' } });
    refreshCardElement(element);

    expect(element.querySelector('.card-price').textContent).toBe('€1.00');
  });
});

describe('version badge', () => {
  const base = {
    id: 'v1',
    name: 'Serra Angel',
    released_at: '1993-01-01',
    color_identity: ['W'],
  };
  const reprint = (id, releasedAt) => ({
    id,
    name: 'Serra Angel',
    released_at: releasedAt,
    color_identity: ['W'],
  });

  beforeEach(() => {
    cardState.isCardOwned.mockReturnValue(false);
    cardStore.clear();
  });

  afterEach(() => {
    cardStore.clear();
    document.body.innerHTML = '';
  });

  it('shows "index/total printings" for a multi-printing card', () => {
    cardStore.add(base);
    cardStore.add(reprint('v2', '2000-01-01'));
    cardStore.add(reprint('v3', '2010-01-01'));

    const element = createCardElement(base, 0);
    const badge = element.querySelector('.card-versions');
    expect(badge).not.toBeNull();
    expect(badge.querySelector('.card-versions-full').textContent).toBe('1/3 printings');
    expect(badge.querySelector('.card-versions-short').textContent).toBe('1/3');
    expect(badge.tagName).toBe('BUTTON');
    expect(badge.type).toBe('button');
    expect(badge.getAttribute('aria-label')).toBe('Show next printing (1/3 printings)');
  });

  it('reflects the index of the printing being displayed', () => {
    cardStore.add(base);
    cardStore.add(reprint('v2', '2000-01-01'));

    const element = createCardElement(reprint('v2', '2000-01-01'), 0);
    expect(element.querySelector('.card-versions-full').textContent).toBe('2/2 printings');
    expect(element.querySelector('.card-versions-short').textContent).toBe('2/2');
  });

  it('matches the tooltip for the same printing', () => {
    cardStore.add(base);
    cardStore.add(reprint('v2', '2000-01-01'));
    cardStore.add(reprint('v3', '2010-01-01'));

    const element = createCardElement(reprint('v2', '2000-01-01'), 0);
    const badge = element.querySelector('.card-versions-short').textContent;
    const { index, total } = cardStore.getPrintingPosition(reprint('v2', '2000-01-01'));

    expect(badge).toBe(`${index}/${total}`);
  });

  it('omits the badge for single-printing cards', () => {
    cardStore.add(base);
    const element = createCardElement(base, 0);
    expect(element.querySelector('.card-versions')).toBeNull();
  });

  it('hints at right-click cycling for multi-printing cards', () => {
    cardStore.add(base);
    cardStore.add(reprint('v2', '2000-01-01'));

    const element = createCardElement(base, 0);
    expect(element.title).toBe('Right-click for next printing');
    expect(element.querySelector('.card-name').title).toBe('Right-click for next printing');
    expect(element.querySelector('.card-versions').title).toContain(
      'right-click for next printing'
    );
  });

  it('does not hint at right-click cycling for a single printing', () => {
    cardStore.add(base);
    const element = createCardElement(base, 0);
    expect(element.hasAttribute('title')).toBe(false);
  });

  it('adds the badge once a later printing is known', () => {
    cardStore.add(base);
    const element = createCardElement(base, 0);
    document.body.appendChild(element);
    expect(element.querySelector('.card-versions')).toBeNull();

    cardStore.add(reprint('v2', '2000-01-01'));
    updateCardVersionCounts();

    expect(element.querySelector('.card-versions-full').textContent).toBe('1/2 printings');
    expect(element.title).toBe('Right-click for next printing');
  });
});

describe('image display mode', () => {
  const textOnlyCard = {
    id: 'card-text',
    name: 'Serra Angel',
    color_identity: ['W'],
  };

  const cardWithImages = {
    id: 'card-img',
    name: 'Serra Angel',
    related_uris: { edhrec: 'http://edhrec.com/serra-angel' },
    color_identity: ['W'],
    image_uris: {
      thumb: 'https://images.test/thumb.webp',
      grid: 'https://images.test/grid.webp',
      normal: 'https://images.test/normal.jpg',
    },
  };

  beforeEach(() => {
    cardSettings.displayMode = 'images';
    cardState.isCardOwned.mockReturnValue(false);
  });

  afterEach(() => {
    cardSettings.displayMode = 'text';
    document.body.innerHTML = '';
  });

  it('renders a lazy-loaded thumbnail instead of the name', () => {
    const element = createCardElement(cardWithImages, 0);
    expect(element.classList.contains('image-tile')).toBe(true);
    expect(element.querySelector('.card-name')).toBeNull();

    const img = element.querySelector('.card-image');
    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toBe('https://images.test/thumb.webp');
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.getAttribute('decoding')).toBe('async');
  });

  it('offers the sharper grid art to wide viewports', () => {
    const element = createCardElement(cardWithImages, 0);
    const source = element.querySelector('picture source');
    expect(source.getAttribute('srcset')).toBe('https://images.test/grid.webp');
    expect(source.getAttribute('media')).toContain('min-width');
  });

  it('gathers the interactive controls into the tile footer', () => {
    appState.isViewOnlyMode = false;
    const element = createCardElement(cardWithImages, 0);
    const footer = element.querySelector('.card-footer');
    expect(footer).not.toBeNull();
    expect(footer.querySelector('.card-toggle')).not.toBeNull();
    expect(footer.querySelector('.edhrec-link')).not.toBeNull();
    expect(footer.querySelector('.owned-badge')).toBeNull();
  });

  it('shows the name, set, number and price in the footer', () => {
    const element = createCardElement(
      {
        ...cardWithImages,
        set_name: 'Dominaria',
        collector_number: '42',
        prices: { eur: '3.50' },
      },
      0
    );
    const footer = element.querySelector('.card-footer');
    expect(footer.querySelector('.card-footer-name').textContent).toBe('Serra Angel');
    expect(footer.querySelector('.card-footer-set').textContent).toBe('Dominaria');
    expect(footer.querySelector('.card-footer-num').textContent).toBe('#42');
    expect(footer.querySelector('.card-price').textContent).toBe('€3.50');
  });

  it('shows an owned badge instead of a toggle in view-only mode', () => {
    appState.isViewOnlyMode = true;
    const element = createCardElement(cardWithImages, 0);
    const footer = element.querySelector('.card-footer');
    expect(footer.querySelector('.card-toggle')).toBeNull();
    expect(footer.querySelector('.owned-badge')).not.toBeNull();
    appState.isViewOnlyMode = false;
  });

  it('can still add the version badge to the footer after later printings load', () => {
    cardStore.clear();
    const card = { ...cardWithImages, released_at: '2020-01-01' };
    cardStore.add(card);
    const element = createCardElement(card, 0);
    document.body.appendChild(element);
    expect(element.querySelector('.card-versions')).toBeNull();

    cardStore.add({ ...card, id: 'card-img-2', released_at: '2021-01-01' });
    updateCardVersionCounts();

    expect(element.querySelector('.card-footer-actions .card-versions')).not.toBeNull();
    expect(element.querySelector('.card-versions-short').textContent).toBe('1/2');
    cardStore.clear();
  });

  it('falls back to the text tile when a card has no image', () => {
    const element = createCardElement(textOnlyCard, 0);
    expect(element.classList.contains('image-tile')).toBe(false);
    expect(element.querySelector('.card-name').textContent).toBe('Serra Angel');
  });

  it('uses the front face image for multi-face cards', () => {
    const dfc = {
      id: 'dfc',
      name: 'Delver of Secrets // Insectile Aberration',
      color_identity: ['U'],
      layout: 'transform',
      card_faces: [
        { image_uris: { thumb: 'https://images.test/front.webp' } },
        { image_uris: { thumb: 'https://images.test/back.webp' } },
      ],
    };
    const element = createCardElement(dfc, 0);
    expect(element.querySelector('.card-image').getAttribute('src')).toBe(
      'https://images.test/front.webp'
    );
  });
});

describe('applyDisplayMode', () => {
  it('re-renders mounted cards for the new mode', () => {
    const card = {
      id: 'card1',
      name: 'Serra Angel',
      color_identity: ['W'],
      image_uris: { thumb: 'https://images.test/thumb.webp' },
    };
    cardState.isCardOwned.mockReturnValue(false);

    cardSettings.displayMode = 'text';
    const element = createCardElement(card, 0);
    element.dataset.cardIndex = '0';
    document.body.appendChild(element);
    expect(element.querySelector('.card-name')).not.toBeNull();

    cardSettings.displayMode = 'images';
    applyDisplayMode();
    expect(element.querySelector('.card-image')).not.toBeNull();
    expect(element.classList.contains('image-tile')).toBe(true);

    cardSettings.displayMode = 'text';
    document.body.innerHTML = '';
  });
});

describe('applyPreferredPrintings', () => {
  beforeEach(() => {
    cardStore.clear();
    getPreferredPrinting.mockReturnValue(null);
  });

  it('switches a mounted tile to the saved printing', () => {
    const base = { id: 'base', name: 'Card', released_at: '2010-01-01' };
    const chosen = { id: 'chosen', name: 'Card', released_at: '2020-01-01' };
    cardStore.add(base);
    cardStore.add(chosen);
    cardState.isCardOwned.mockReturnValue(false);
    getPreferredPrinting.mockReturnValue(chosen);

    const element = createCardElement(base, 0);
    document.body.appendChild(element);

    applyPreferredPrintings();

    expect(element.cardData).toBe(chosen);
    document.body.innerHTML = '';
  });

  it('falls back to the base printing when no preference is stored', () => {
    const base = { id: 'base', name: 'Card', released_at: '2010-01-01' };
    const other = { id: 'other', name: 'Card', released_at: '2020-01-01' };
    cardStore.add(base);
    cardStore.add(other);
    cardState.isCardOwned.mockReturnValue(false);

    const element = createCardElement(other, 0);
    document.body.appendChild(element);

    applyPreferredPrintings();

    expect(element.cardData).toBe(base);
    document.body.innerHTML = '';
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

  it('marks the tile owned and updates the toggle when the state resolves late', () => {
    cardState.isCardOwned.mockReturnValue(false);
    const element = createCardElement(card, 0);
    const toggle = element.querySelector('.card-toggle');
    expect(toggle.getAttribute('aria-label')).toBe('Mark as owned');

    // The owned set arrives after the cards were rendered.
    cardState.isCardOwned.mockReturnValue(true);
    updateCardState(element);

    expect(element.classList.contains('owned')).toBe(true);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.getAttribute('aria-label')).toBe('Mark as missing');
    expect(toggle.title).toBe('Mark as missing');
  });
});

describe('list display mode', () => {
  const card = {
    id: 'list-card',
    name: 'Serra Angel',
    set: 'dom',
    set_name: 'Dominaria',
    collector_number: '42',
    color_identity: ['W'],
    prices: { eur: '3.50' },
    related_uris: { edhrec: 'http://edhrec.com/serra-angel' },
  };

  beforeEach(() => {
    cardSettings.displayMode = 'list';
    cardState.isCardOwned.mockReturnValue(false);
  });

  afterEach(() => {
    cardSettings.displayMode = 'text';
    document.body.innerHTML = '';
  });

  it('renders a checklist row with an inline toggle, set and colour chips', () => {
    const element = createCardElement(card, 0);

    expect(element.classList.contains('list-tile')).toBe(true);
    expect(element.querySelector('.card-name').textContent).toBe('Serra Angel');
    expect(element.querySelector('.card-toggle')).not.toBeNull();
    expect(element.querySelector('.card-set-chip').textContent).toBe('DOM');
    expect(element.querySelector('.card-color-chip').textContent).toBe('W');
    expect(element.querySelector('.card-price').textContent).toBe('€3.50');
  });

  it('re-renders back to a text tile when the mode changes', () => {
    const element = createCardElement(card, 0);
    document.body.appendChild(element);
    expect(element.classList.contains('list-tile')).toBe(true);

    cardSettings.displayMode = 'text';
    applyDisplayMode();

    expect(element.classList.contains('list-tile')).toBe(false);
    expect(element.querySelector('.card-name')).not.toBeNull();
  });
});

describe('filter chips', () => {
  const card = {
    id: 'chip-card',
    name: 'Serra Angel',
    set: 'dom',
    set_name: 'Dominaria',
    collector_number: '42',
    color_identity: ['W'],
    image_uris: { thumb: 'https://images.test/thumb.webp' },
  };

  beforeEach(() => {
    cardSettings.displayMode = 'images';
    cardState.isCardOwned.mockReturnValue(false);
  });

  afterEach(() => {
    cardSettings.displayMode = 'text';
    document.body.innerHTML = '';
  });

  /** Capture `filter:set` events for the duration of `run()`. */
  function captureFilters(run) {
    const received = [];
    const listener = (event) => received.push(event.detail);
    document.addEventListener('filter:set', listener);
    run();
    document.removeEventListener('filter:set', listener);
    return received;
  }

  it('emits a set filter when the footer set badge is clicked', () => {
    const element = createCardElement(card, 0);
    document.body.appendChild(element);

    const received = captureFilters(() => element.querySelector('.card-footer-set').click());

    expect(received).toEqual([{ set: 'dom' }]);
  });

  it('emits an exclusive colour filter when the colour chip is clicked', () => {
    const element = createCardElement(card, 0);
    document.body.appendChild(element);

    const received = captureFilters(() => element.querySelector('.card-color-chip').click());

    expect(received).toEqual([{ colors: ['W'], colorMode: 'exclusive' }]);
  });

  it('filters colourless cards through the colourless pip', () => {
    const element = createCardElement({ ...card, color_identity: [] }, 0);
    document.body.appendChild(element);

    const chip = element.querySelector('.card-color-chip');
    expect(chip.textContent).toBe('C');
    const received = captureFilters(() => chip.click());

    expect(received).toEqual([{ colors: ['C'], colorMode: 'exclusive' }]);
  });
});
