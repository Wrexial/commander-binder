import { describe, it, expect, vi, beforeEach } from 'vitest';

// Break the import chain into main.js/@clerk, which is irrelevant here.
vi.mock('../../state/cardState.js', () => ({
  isCardOwned: vi.fn(() => false),
}));
vi.mock('../../state/wishlistState.js', () => ({
  isCardWanted: vi.fn(() => false),
  setCardsWanted: vi.fn(() => Promise.resolve()),
}));
vi.mock('../cards.js', () => ({ updateAllCardStates: vi.fn() }));
vi.mock('../../state/appState.js', () => ({ appState: { isViewOnlyMode: false } }));

vi.mock('../../state/cardStore.js', async (importOriginal) => ({
  ...(await importOriginal()),
  cardStore: { getPrintings: vi.fn(() => []), getAll: vi.fn(() => []) },
}));

vi.mock('../components/toast.js', () => ({ showToast: vi.fn() }));

const printingPicker = vi.hoisted(() => ({ openPrintingPicker: vi.fn() }));
vi.mock('../components/printingPickerModal.js', () => ({
  openPrintingPicker: printingPicker.openPrintingPicker,
}));

vi.mock('../tooltip.js', () => ({
  showTooltip: vi.fn(),
  hideTooltip: vi.fn(),
  positionTooltip: vi.fn(),
}));

import { calculateStatistics, createStatisticsHTML, showStatisticsModal } from '../statistics.js';
import { analyzeA11y } from '../../__tests__/helpers/a11y.js';
import { cardStore } from '../../state/cardStore.js';
import { isCardOwned } from '../../state/cardState.js';
import { isCardWanted, setCardsWanted } from '../../state/wishlistState.js';
import { updateAllCardStates } from '../cards.js';
import { appState } from '../../state/appState.js';
import { showTooltip } from '../tooltip.js';
import { getHistory, recordSnapshot, resetHistory } from '../../state/collectionHistory.js';
import { setSetting } from '../../state/cardSettings.js';

function makeCard(overrides = {}) {
  return {
    name: 'Test Card',
    colors: [],
    color_identity: [],
    type_line: 'Legendary Creature — Human',
    rarity: 'common',
    cmc: 3,
    ...overrides,
  };
}

beforeEach(() => {
  cardStore.getPrintings.mockReturnValue([]);
  cardStore.getAll.mockReturnValue([]);
  isCardOwned.mockReturnValue(false);
  isCardWanted.mockReturnValue(false);
  setCardsWanted.mockClear();
  setCardsWanted.mockResolvedValue();
  updateAllCardStates.mockClear();
  appState.isViewOnlyMode = false;
  showTooltip.mockClear();
  resetHistory();
  setSetting('defaultPrinting', 'oldest');
});

describe('calculateStatistics', () => {
  it('counts colors, colorless cards, and color combinations', () => {
    const cards = [
      makeCard({ name: 'A', colors: ['U'], type_line: 'Legendary Creature — Human Wizard' }),
      makeCard({ name: 'B', colors: ['U', 'R'], type_line: 'Legendary Creature — Dragon' }),
      makeCard({ name: 'C', colors: [], type_line: 'Legendary Artifact Creature — Golem' }),
    ];

    const stats = calculateStatistics(cards);

    expect(stats.totalCards).toBe(3);
    expect(stats.colors.U).toBe(2);
    expect(stats.colors.R).toBe(1);
    expect(stats.colors.C).toBe(1);
    expect(stats.colorCombinations).toEqual({ U: 1, RU: 1, C: 1 });
    expect(stats.types).toMatchObject({ Human: 1, Wizard: 1, Dragon: 1, Golem: 1 });
    expect(stats.rarities).toEqual({ common: 3 });
  });

  it('leaves the retired special/bonus rarities out of the breakdown', () => {
    const stats = calculateStatistics([
      makeCard({ name: 'A', rarity: 'mythic' }),
      makeCard({ name: 'B', rarity: 'special' }),
      makeCard({ name: 'C', rarity: 'bonus' }),
    ]);

    expect(stats.rarities).toEqual({ mythic: 1 });
  });

  it('counts color identity separately from card colors', () => {
    const cards = [
      makeCard({ name: 'A', colors: ['U'], color_identity: ['U', 'B'] }),
      makeCard({ name: 'B', colors: [], color_identity: [] }),
    ];

    const stats = calculateStatistics(cards);

    expect(stats.colors.U).toBe(1);
    expect(stats.colors.B).toBe(0);
    expect(stats.colorIdentity.U).toBe(1);
    expect(stats.colorIdentity.B).toBe(1);
    expect(stats.colorIdentity.C).toBe(1);
  });

  it('falls back to face colors for modal double-faced cards', () => {
    const cards = [
      makeCard({
        name: 'MDFC',
        colors: [],
        card_faces: [{ colors: ['W'] }, { colors: ['B'] }],
      }),
    ];

    const stats = calculateStatistics(cards);

    expect(stats.colors.W).toBe(1);
    expect(stats.colors.B).toBe(1);
    expect(stats.colorCombinations).toEqual({ BW: 1 });
  });

  it('buckets mana values into a curve with average and median', () => {
    const cards = [
      makeCard({ name: 'A', cmc: 0 }),
      makeCard({ name: 'B', cmc: 3 }),
      makeCard({ name: 'C', cmc: 3 }),
      makeCard({ name: 'D', cmc: 9 }),
    ];

    const stats = calculateStatistics(cards);

    expect(stats.manaCurve['0']).toBe(1);
    expect(stats.manaCurve['3']).toBe(2);
    expect(stats.manaCurve['7+']).toBe(1);
    expect(stats.manaCurve['5']).toBe(0);
    expect(stats.averageManaValue).toBe(3.75);
    expect(stats.medianManaValue).toBe(3);
  });

  it('values cards by the printing the grid shows (oldest by default)', () => {
    cardStore.getPrintings.mockImplementation((name) =>
      name === 'Dated'
        ? [
            { released_at: '1993-08-05', prices: { eur: '10.00' } },
            { released_at: '2020-01-01', prices: { eur: '5.00' } },
          ]
        : []
    );

    const stats = calculateStatistics([
      makeCard({ name: 'Dated' }),
      makeCard({ name: 'Unpriced' }),
    ]);

    expect(stats.totalValue).toBe(10);
    expect(stats.averageCardValue).toBe(5);
    expect(stats.medianCardValue).toBe(10);
    expect(stats.top5ValuableCards).toHaveLength(1);
    expect(stats.top5ValuableCards[0]).toMatchObject({ name: 'Dated', price: 10 });
  });

  it('values cards by their cheapest printing when that mode is selected', () => {
    setSetting('defaultPrinting', 'cheapest');
    cardStore.getPrintings.mockImplementation((name) =>
      name === 'Cheap'
        ? [
            { released_at: '1993-08-05', prices: { eur: '10.00' } },
            { released_at: '2020-01-01', prices: { eur: '5.00' } },
          ]
        : []
    );

    const stats = calculateStatistics([
      makeCard({ name: 'Cheap' }),
      makeCard({ name: 'Unpriced' }),
    ]);

    expect(stats.totalValue).toBe(5);
    expect(stats.top5ValuableCards[0]).toMatchObject({ name: 'Cheap', price: 5 });
  });

  it('values a card by its selected (pinned) printing, not the cheapest', async () => {
    const { rememberPreferredPrinting, resetPreferredPrintings } =
      await import('../../state/preferredPrintings.js');
    cardStore.getPrintings.mockReturnValue([
      { id: 'cheap', name: 'Pinned Card', prices: { eur: '5.00' } },
      { id: 'pricey', name: 'Pinned Card', prices: { eur: '50.00' } },
    ]);
    rememberPreferredPrinting({ id: 'pricey', name: 'Pinned Card' });

    try {
      const stats = calculateStatistics([makeCard({ name: 'Pinned Card' })]);
      expect(stats.totalValue).toBe(50);
      expect(stats.top5ValuableCards[0]).toMatchObject({ price: 50 });
    } finally {
      resetPreferredPrintings();
    }
  });

  it('values each card at its own printing when exactPrintings is set', () => {
    const cheap = { id: 'cheap', name: 'Dup Card', prices: { eur: '2.00' } };
    const fancy = { id: 'fancy', name: 'Dup Card', prices: { eur: '20.00' } };
    cardStore.getPrintings.mockReturnValue([cheap, fancy]);

    // Default: every card resolves to the cheapest printing.
    const resolved = calculateStatistics([cheap, fancy], 2, [cheap, fancy]);
    expect(resolved.totalValue).toBe(4);

    // exactPrintings: each keeps its own printing's price (binder pockets).
    const exact = calculateStatistics([cheap, fancy], 2, [cheap, fancy], {
      exactPrintings: true,
    });
    expect(exact.totalValue).toBe(22);
  });

  it('computes price distribution buckets and the median', () => {
    cardStore.getPrintings.mockImplementation((name) => {
      const prices = { Cheap: '0.50', Mid: '3.00', Pricey: '30.00', Grail: '120.00' };
      return prices[name] ? [{ prices: { eur: prices[name], eur_foil: null } }] : [];
    });

    const stats = calculateStatistics([
      makeCard({ name: 'Cheap' }),
      makeCard({ name: 'Mid' }),
      makeCard({ name: 'Pricey' }),
      makeCard({ name: 'Grail' }),
    ]);

    expect(stats.priceBuckets).toEqual([
      { label: '< €0.25', count: 0, value: 0 },
      { label: '€0.25–0.5', count: 0, value: 0 },
      { label: '€0.5–1', count: 1, value: 0.5 },
      { label: '€1–2', count: 0, value: 0 },
      { label: '€2–5', count: 1, value: 3 },
      { label: '€5–10', count: 0, value: 0 },
      { label: '€10–20', count: 0, value: 0 },
      { label: '€20–50', count: 1, value: 30 },
      { label: '€50–100', count: 0, value: 0 },
      { label: '€100+', count: 1, value: 120 },
    ]);
    expect(stats.medianCardValue).toBe(16.5);
    expect(stats.minCardValue).toBe(0.5);
    expect(stats.maxCardValue).toBe(120);
    expect(stats.pricePercentiles.p25).toBeCloseTo(2.375);
    expect(stats.pricePercentiles.p90).toBeCloseTo(93);
    // The single most valuable card (120/153.5) is already ~78% of the value.
    expect(stats.topDecileValueShare).toBeCloseTo(78.18, 1);
  });

  it('sorts the top cards by price and caps the list at five', () => {
    const cards = Array.from({ length: 7 }, (_, i) => makeCard({ name: `Card ${i}` }));
    cardStore.getPrintings.mockImplementation((name) => {
      const index = Number(name.replace('Card ', ''));
      return [{ prices: { eur: `${index}.00`, eur_foil: null } }];
    });

    const stats = calculateStatistics(cards);

    expect(stats.top5ValuableCards).toHaveLength(5);
    expect(stats.top5ValuableCards.map((card) => card.price)).toEqual([6, 5, 4, 3, 2]);
  });

  it('measures completion against the total collection size', () => {
    const cards = [makeCard({ name: 'A' }), makeCard({ name: 'B' })];

    const stats = calculateStatistics(cards, 8);

    expect(stats.completion).toEqual({ owned: 2, total: 8, percent: 25 });
  });

  it('computes per-set completion against the full collection', () => {
    const all = [
      makeCard({ name: 'A', set: 'lea', set_name: 'Limited Edition Alpha' }),
      makeCard({ name: 'B', set: 'lea', set_name: 'Limited Edition Alpha' }),
      makeCard({ name: 'C', set: 'm21', set_name: 'Core Set 2021' }),
    ];

    const stats = calculateStatistics([all[0], all[2]], all.length, all);

    // Highest completion first; sets with no owned cards are omitted.
    expect(stats.sets).toEqual([
      {
        code: 'm21',
        name: 'Core Set 2021',
        total: 1,
        owned: 1,
        percent: 100,
        missing: [],
        wantedMissing: [],
      },
      {
        code: 'lea',
        name: 'Limited Edition Alpha',
        total: 2,
        owned: 1,
        percent: 50,
        missing: ['B'],
        wantedMissing: [],
      },
    ]);
    expect(stats.missingCount).toBe(1);
    expect(stats.missingNames).toEqual(['B']);
    // Core Set 2021 is fully collected, so it counts as completed.
    expect(stats.setsCompleted).toBe(1);
  });

  it('omits sets the collection has no cards in', () => {
    const all = [
      makeCard({ name: 'A', set: 'lea', set_name: 'Limited Edition Alpha' }),
      makeCard({ name: 'B', set: 'ice', set_name: 'Ice Age' }),
    ];

    const stats = calculateStatistics([all[0]], 2, all);

    expect(stats.sets.map((set) => set.code)).toEqual(['lea']);
  });
});

describe('createStatisticsHTML', () => {
  it('renders every section with the summary values', () => {
    const stats = calculateStatistics(
      [makeCard({ name: 'A', colors: ['U'], color_identity: ['U'], rarity: 'rare' })],
      4
    );

    const html = createStatisticsHTML(stats);

    for (const heading of [
      'Total Cards',
      'Total Value',
      'Average Card Value',
      'Completion',
      'Colors',
      'Card Colors',
      'Color Identity',
      'Color Combinations',
      'Mana Value Curve',
      'Rarity &amp; Type',
      'Rarities',
      'Creature Types',
      'Sets',
      'Set Completion',
      'Wishlist Targets',
      'Price Distribution',
      'Top 5 Most Valuable Cards',
    ]) {
      expect(html).toContain(heading);
    }

    // The colors sit in separate cards under one shared header.
    const colors = html.slice(html.indexOf('class="stats-group-title">Colors'));
    expect(colors).toContain('class="stats-group-card"');

    expect(html).toContain('card-symbols/U.svg');
    expect(html).toContain('stat-rarity-rare');
    expect(html).toContain('stats-curve-bar');
    expect(html).toContain('25%');
  });

  it('renders an empty-state message for categories with no data', () => {
    const stats = calculateStatistics([makeCard({ name: 'A', colors: ['U'] })]);
    const html = createStatisticsHTML(stats);

    expect(html).toContain('No priced cards in this collection yet.');
  });

  it('renders every creature type in a scrollable list', () => {
    const cards = Array.from({ length: 20 }, (_, i) =>
      makeCard({ name: `Card ${i}`, type_line: `Legendary Creature — Type${i}` })
    );
    const stats = calculateStatistics(cards);
    const html = createStatisticsHTML(stats);

    // A type the old 12-row cap would have dropped is present, and the list is
    // the scrollable variant.
    expect(html).toContain('Type19');
    expect(html).toContain('stats-bars stats-bars-scroll');
    expect(html).toContain('20 types');
  });

  it('shows the value and share held by each price bucket', () => {
    cardStore.getPrintings.mockImplementation((name) => {
      const prices = { Cheap: '0.50', Grail: '120.00' };
      return prices[name] ? [{ prices: { eur: prices[name], eur_foil: null } }] : [];
    });
    const stats = calculateStatistics([makeCard({ name: 'Cheap' }), makeCard({ name: 'Grail' })]);

    const html = createStatisticsHTML(stats);

    expect(html).toContain('stats-price-row');
    expect(html).toContain('stats-price-share');
    expect(html).toContain('stats-price-value');
    expect(html).toContain('2 priced cards');
    expect(html).toContain('stats-price-summary');
    expect(html).toContain('most valuable');
  });

  it('does not render the retired special/bonus rarities', () => {
    const stats = calculateStatistics([
      makeCard({ name: 'A', rarity: 'special' }),
      makeCard({ name: 'B', rarity: 'bonus' }),
    ]);
    const html = createStatisticsHTML(stats);

    expect(html).not.toContain('Special');
    expect(html).not.toContain('Bonus');
    expect(html).not.toContain('stat-rarity-special');
    expect(html).not.toContain('stat-rarity-bonus');
  });

  it('renders combination mana symbols in canonical WUBRG order', () => {
    const stats = calculateStatistics([makeCard({ name: 'A', colors: ['W', 'B'] })]);
    const html = createStatisticsHTML(stats);
    const combos = html.slice(html.indexOf('Color Combinations'));

    expect(combos.indexOf('card-symbols/W.svg')).toBeLessThan(combos.indexOf('card-symbols/B.svg'));
  });

  it('renders the per-set completion bars with owned/total counts', () => {
    const all = [
      makeCard({ name: 'A', set: 'lea', set_name: 'Limited Edition Alpha' }),
      makeCard({ name: 'B', set: 'lea', set_name: 'Limited Edition Alpha' }),
    ];
    const stats = calculateStatistics([all[0]], 2, all);

    const html = createStatisticsHTML(stats);

    expect(html).toContain('Set Completion');
    expect(html).toContain('Limited Edition Alpha');
    expect(html).toContain('LEA');
    expect(html).toContain('1/2');
  });

  it('escapes set names in the completion list', () => {
    const all = [
      makeCard({ name: 'A', set: 'x', set_name: '<img src=x onerror=alert(1)>' }),
      makeCard({ name: 'B', set: 'x', set_name: '<img src=x onerror=alert(1)>' }),
    ];
    // Only one of the two is owned, so the set stays in the in-progress list.
    const stats = calculateStatistics([all[0]], 2, all);

    const html = createStatisticsHTML(stats);

    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
  });

  it('adds a wishlist button to sets that have missing cards', () => {
    const all = [
      makeCard({ name: 'A', set: 'lea', set_name: 'Limited Edition Alpha' }),
      makeCard({ name: 'B', set: 'lea', set_name: 'Limited Edition Alpha' }),
    ];
    const stats = calculateStatistics([all[0]], 2, all);

    const html = createStatisticsHTML(stats);

    expect(html).toContain('stats-set-wishlist');
    expect(html).toContain('data-set="lea"');
  });

  it('omits the wishlist button once every missing card is already wanted', () => {
    const all = [
      makeCard({ name: 'A', set: 'lea', set_name: 'Limited Edition Alpha' }),
      makeCard({ name: 'B', set: 'lea', set_name: 'Limited Edition Alpha' }),
    ];
    isCardWanted.mockReturnValue(true);
    const stats = calculateStatistics([all[0]], 2, all);

    const html = createStatisticsHTML(stats);

    expect(html).not.toContain('stats-set-wishlist');
    // The set is still surfaced, just under Wishlist Targets instead.
    expect(html).toContain('stats-wishlist-copy');
  });

  it('lists the missing and wanted card names in row tooltips', () => {
    const all = [
      makeCard({ name: 'Owned', set: 'lea', set_name: 'Alpha' }),
      makeCard({ name: 'Wanted One', set: 'lea', set_name: 'Alpha' }),
      makeCard({ name: 'Plain Missing', set: 'lea', set_name: 'Alpha' }),
    ];
    isCardWanted.mockImplementation((card) => card.name === 'Wanted One');
    const stats = calculateStatistics([all[0]], 3, all);

    const html = createStatisticsHTML(stats);

    // Set Completion lists every missing card...
    expect(html).toContain('title="Wanted One\nPlain Missing"');
    // ...and Wishlist Targets lists only the wanted ones.
    expect(html).toContain('title="Wanted One"');
  });

  it('truncates very long tooltip name lists', () => {
    const all = [
      makeCard({ name: 'Owned', set: 'lea', set_name: 'Alpha' }),
      ...Array.from({ length: 30 }, (_, i) =>
        makeCard({ name: `Missing ${i}`, set: 'lea', set_name: 'Alpha' })
      ),
    ];
    const stats = calculateStatistics([all[0]], all.length, all);

    const html = createStatisticsHTML(stats);

    expect(html).toContain('…and 5 more');
  });

  it('summarises completed sets and lists the near-complete ones', () => {
    const all = [
      makeCard({ name: 'A', set: 'lea', set_name: 'Limited Edition Alpha' }),
      makeCard({ name: 'B', set: 'lea', set_name: 'Limited Edition Alpha' }),
      makeCard({ name: 'C', set: 'm21', set_name: 'Core Set 2021' }),
      makeCard({ name: 'D', set: 'm21', set_name: 'Core Set 2021' }),
    ];
    // Alpha fully owned; Core Set 2021 is half owned.
    const stats = calculateStatistics([all[0], all[1], all[2]], 4, all);

    const html = createStatisticsHTML(stats);

    expect(stats.setsCompleted).toBe(1);
    expect(html).toContain('Sets completed: 1');
    expect(html).toContain('Core Set 2021');
    // The completed set is summarised, not listed among the in-progress rows.
    expect(html).not.toContain('Limited Edition Alpha');
  });

  it('celebrates when every started set is complete', () => {
    const all = [
      makeCard({ name: 'A', set: 'lea', set_name: 'Limited Edition Alpha' }),
      makeCard({ name: 'B', set: 'lea', set_name: 'Limited Edition Alpha' }),
    ];
    const stats = calculateStatistics(all, 2, all);

    const html = createStatisticsHTML(stats);

    expect(html).toContain('Sets completed: 1');
    expect(html).toContain('Every set you have started is complete');
  });

  it('renders wishlist targets for wanted missing cards', () => {
    const all = [
      makeCard({ name: 'Owned', set: 'abc', set_name: 'Set ABC' }),
      makeCard({ name: 'Wanted One', set: 'abc', set_name: 'Set ABC' }),
      makeCard({ name: 'Wanted Two', set: 'abc', set_name: 'Set ABC' }),
    ];
    isCardWanted.mockImplementation((card) => card.name !== 'Owned');
    const stats = calculateStatistics([all[0]], 3, all);

    expect(stats.wishlist).toMatchObject({ wanted: 2, missing: 2 });
    expect(stats.wishlist.missingNames).toEqual(['Wanted One', 'Wanted Two']);
    expect(stats.sets[0].wantedMissing).toHaveLength(2);

    const html = createStatisticsHTML(stats);
    expect(html).toContain('Wishlist Targets');
    expect(html).toContain('2 wanted');
    expect(html).toContain('stats-wishlist-copy');
  });
});

describe('showStatisticsModal', () => {
  it('scopes the report to the provided cards and title', () => {
    document.body.innerHTML = '<div id="tooltip" class="tooltip"></div>';
    const binderCard = makeCard({ id: 'b1', name: 'Binder Card' });
    const otherCard = makeCard({ id: 'o1', name: 'Other Card' });
    cardStore.getAll.mockReturnValue([binderCard, otherCard]);
    isCardOwned.mockReturnValue(true);

    showStatisticsModal({
      cards: [binderCard],
      title: '“My Binder” Statistics',
      emptyMessage: 'Nothing owned.',
    });

    expect(document.querySelector('.statistics-header h2').textContent).toBe(
      '“My Binder” Statistics'
    );
    // Only the binder's single card is counted, not the whole store.
    expect(document.querySelector('.statistics-subtitle').textContent).toContain('1 owned card');
  });

  it('values each pocket at its own printing when exactPrintings is set', () => {
    document.body.innerHTML = '<div id="tooltip" class="tooltip"></div>';
    const cheap = { ...makeCard({ id: 'cheap', name: 'Dup' }), prices: { eur: '2.00' } };
    const fancy = { ...makeCard({ id: 'fancy', name: 'Dup' }), prices: { eur: '20.00' } };
    cardStore.getPrintings.mockReturnValue([cheap, fancy]);
    isCardOwned.mockReturnValue(true);

    showStatisticsModal({ cards: [cheap, fancy], countAll: true, exactPrintings: true });

    expect(document.querySelector('.statistics-subtitle').textContent).toContain('22');
  });

  it('clears the grid card actions from the hover preview on open', () => {
    document.body.innerHTML = '<div id="tooltip" class="tooltip"></div>';
    const tooltip = document.getElementById('tooltip');
    tooltip.onToggle = () => {};
    tooltip.onWishlistToggle = () => {};
    tooltip.onAddToList = () => {};
    cardStore.getAll.mockReturnValue([makeCard({ id: 'a', name: 'A' })]);
    isCardOwned.mockReturnValue(true);

    showStatisticsModal();

    expect(tooltip.onToggle).toBeNull();
    expect(tooltip.onWishlistToggle).toBeNull();
    expect(tooltip.onAddToList).toBeNull();
  });

  it('counts every provided card and duplicate when countAll is set', () => {
    document.body.innerHTML = '<div id="tooltip" class="tooltip"></div>';
    const card = makeCard({ id: 'c1', name: 'Sol Ring' });
    // Not owned — the binder scope still counts it.
    isCardOwned.mockReturnValue(false);

    showStatisticsModal({
      cards: [card, card, card],
      countAll: true,
      title: '“Binder” Statistics',
    });

    const subtitle = document.querySelector('.statistics-subtitle').textContent;
    expect(subtitle).toContain('3 cards');
    expect(subtitle).not.toContain('3 owned');
  });

  it('attaches the card tooltip to the most valuable cards', () => {
    // These printings differ only by price, so use the cheapest mode to keep the
    // "starts on the shown printing" assertion meaningful.
    setSetting('defaultPrinting', 'cheapest');
    document.body.innerHTML = '<div id="tooltip" class="tooltip"></div>';
    const card = makeCard({
      id: 'printing-1',
      name: 'Grail',
      set_name: 'Test Set',
      collector_number: '42',
    });
    cardStore.getAll.mockReturnValue([card]);
    cardStore.getPrintings.mockReturnValue([
      { ...card, id: 'printing-1', prices: { eur: '120.00', eur_foil: null } },
      { ...card, id: 'printing-2', prices: { eur: '90.00', eur_foil: null } },
    ]);
    isCardOwned.mockReturnValue(true);

    showStatisticsModal();

    // The modal must actually be revealed, not just created hidden.
    expect(document.querySelector('.list-modal-backdrop').style.display).toBe('block');

    const row = document.querySelector('.stats-top-card');
    expect(row).toBeTruthy();

    row.dispatchEvent(new MouseEvent('mouseenter', { clientX: 10, clientY: 10 }));

    expect(showTooltip).toHaveBeenCalledTimes(1);
    expect(showTooltip.mock.calls[0][1]).toMatchObject({ name: 'Grail' });

    // The row starts on the printing the grid shows (the cheapest, since
    // nothing is pinned); right-click opens the printing picker instead of
    // cycling.
    expect(row.cardData.id).toBe('printing-2');
    row.dispatchEvent(new MouseEvent('contextmenu', { clientX: 10, clientY: 10 }));
    expect(printingPicker.openPrintingPicker).toHaveBeenCalledWith(
      expect.objectContaining({ card: expect.objectContaining({ id: 'printing-2' }) })
    );
    // The tooltip itself is not rebuilt by the picker opening.
    expect(showTooltip).toHaveBeenCalledTimes(1);

    document.querySelector('.statistics-close').click();
    expect(document.querySelector('.list-modal-backdrop')).toBeNull();
  });

  it('copies every missing card from the footer button', async () => {
    document.body.innerHTML = '<div id="tooltip" class="tooltip"></div>';
    const owned = makeCard({ id: 'owned', name: 'Owned', set: 'lea', set_name: 'Alpha' });
    const missing = makeCard({ id: 'missing', name: 'Missing One', set: 'lea', set_name: 'Alpha' });
    cardStore.getAll.mockReturnValue([owned, missing]);
    cardStore.getPrintings.mockReturnValue([]);
    isCardOwned.mockImplementation((card) => card.id === 'owned');

    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });

    showStatisticsModal();

    const button = document.querySelector('.stats-copy-missing');
    expect(button.textContent).toBe('Copy all 1 missing');
    button.click();
    await Promise.resolve();

    expect(writeText).toHaveBeenCalledWith('Missing One');
  });

  it("adds a set's missing cards and refreshes the wishlist targets", async () => {
    document.body.innerHTML = '<div id="tooltip" class="tooltip"></div>';
    const owned = makeCard({ id: 'o', name: 'Owned', set: 'lea', set_name: 'Alpha' });
    const missing = makeCard({ id: 'm', name: 'Missing One', set: 'lea', set_name: 'Alpha' });
    cardStore.getAll.mockReturnValue([owned, missing]);
    cardStore.getPrintings.mockReturnValue([]);
    isCardOwned.mockImplementation((card) => card.id === 'o');
    // Once wishlisted, the live state reports the card as wanted.
    setCardsWanted.mockImplementation(() => {
      isCardWanted.mockReturnValue(true);
      return Promise.resolve();
    });

    showStatisticsModal();
    expect(document.querySelector('.stats-set-wishlist')).toBeTruthy();
    expect(document.querySelector('.stats-wishlist-copy')).toBeNull();

    document.querySelector('.stats-set-wishlist').click();
    await Promise.resolve();
    await Promise.resolve();

    expect(setCardsWanted).toHaveBeenCalledWith([missing], true);
    expect(updateAllCardStates).toHaveBeenCalled();

    // Repainted immediately: the satisfied row drops its button and the set
    // now appears under Wishlist Targets.
    expect(document.querySelector('.stats-set-wishlist')).toBeNull();
    expect(document.querySelector('.stats-wishlist-copy')).toBeTruthy();
  });

  it('hides the wishlist row buttons in a view-only share', () => {
    document.body.innerHTML = '<div id="tooltip" class="tooltip"></div>';
    const owned = makeCard({ id: 'o', name: 'Owned', set: 'lea', set_name: 'Alpha' });
    const missing = makeCard({ id: 'm', name: 'Missing One', set: 'lea', set_name: 'Alpha' });
    cardStore.getAll.mockReturnValue([owned, missing]);
    cardStore.getPrintings.mockReturnValue([]);
    isCardOwned.mockImplementation((card) => card.id === 'o');
    appState.isViewOnlyMode = true;

    showStatisticsModal();

    expect(document.querySelector('.stats-set-wishlist').hidden).toBe(true);
  });

  it('copies wanted-and-missing cards from a wishlist target row', async () => {
    document.body.innerHTML = '<div id="tooltip" class="tooltip"></div>';
    const owned = makeCard({ id: 'owned', name: 'Owned', set: 'lea', set_name: 'Alpha' });
    const wanted = makeCard({ id: 'wanted', name: 'Wanted One', set: 'lea', set_name: 'Alpha' });
    cardStore.getAll.mockReturnValue([owned, wanted]);
    cardStore.getPrintings.mockReturnValue([]);
    isCardOwned.mockImplementation((card) => card.id === 'owned');
    isCardWanted.mockImplementation((card) => card.id === 'wanted');

    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });

    showStatisticsModal();

    const button = document.querySelector('.stats-wishlist-copy');
    expect(button).toBeTruthy();
    button.click();
    await Promise.resolve();

    expect(writeText).toHaveBeenCalledWith('Wanted One');
  });

  it('renders a section index whose chips jump to each section', () => {
    document.body.innerHTML = '<div id="tooltip" class="tooltip"></div>';
    cardStore.getAll.mockReturnValue([makeCard({ id: 'a', name: 'A' })]);
    cardStore.getPrintings.mockReturnValue([]);
    isCardOwned.mockReturnValue(true);

    showStatisticsModal();

    const chips = [...document.querySelectorAll('.stats-nav-chip')].map((chip) => chip.textContent);
    expect(chips[0]).toBe('Summary');
    expect(chips).toEqual(expect.arrayContaining(['Colors', 'Sets', 'Top 5 Most Valuable Cards']));

    // Every jump target carries the id its chip points at.
    expect(document.querySelector('.stats-summary').id).toBeTruthy();
    expect(document.querySelector('.stats-section').id).toBeTruthy();
    const chipCount = document.querySelectorAll('.stats-nav-chip').length;
    const targetCount = document.querySelectorAll(
      '.stats-summary, .stats-section, .stats-section-group'
    ).length;
    expect(chipCount).toBe(targetCount);
  });

  it('has no accessibility violations', async () => {
    document.body.innerHTML = '<div id="tooltip" class="tooltip"></div>';
    cardStore.getAll.mockReturnValue([makeCard({ id: 'a', name: 'A', colors: ['U'] })]);
    cardStore.getPrintings.mockReturnValue([]);
    isCardOwned.mockReturnValue(true);

    showStatisticsModal();

    const { violations, summary } = await analyzeA11y(document.body);
    expect(violations.length, summary).toBe(0);
  });

  it('shows progress against the last tracked day', () => {
    document.body.innerHTML = '<div id="tooltip" class="tooltip"></div>';
    recordSnapshot(
      { owned: 1, total: 2, value: 5, setsCompleted: 0 },
      new Date('2024-01-01T12:00:00')
    );
    cardStore.getAll.mockReturnValue([
      makeCard({ id: 'a', name: 'A' }),
      makeCard({ id: 'b', name: 'B' }),
    ]);
    isCardOwned.mockReturnValue(true);

    showStatisticsModal();

    const progress = [...document.querySelectorAll('.stats-section')].find((section) =>
      section.querySelector('h3')?.textContent.includes('Progress')
    );
    expect(progress).toBeTruthy();
    expect(progress.textContent).toContain('Compared with');
    // 2 owned now vs 1 yesterday.
    expect(progress.textContent).toContain('+1');
    // Today's totals are recorded for next time.
    expect(getHistory()).toHaveLength(2);
  });

  it('invites the user back when nothing is tracked yet', () => {
    document.body.innerHTML = '<div id="tooltip" class="tooltip"></div>';
    cardStore.getAll.mockReturnValue([makeCard({ id: 'a', name: 'A' })]);
    isCardOwned.mockReturnValue(true);

    showStatisticsModal();

    const progress = [...document.querySelectorAll('.stats-section')].find((section) =>
      section.querySelector('h3')?.textContent.includes('Progress')
    );
    expect(progress.textContent).toContain('Tracking starts today');
    expect(getHistory()).toHaveLength(1);
  });

  it('does not record a scoped or view-only report', () => {
    document.body.innerHTML = '<div id="tooltip" class="tooltip"></div>';
    cardStore.getAll.mockReturnValue([makeCard({ id: 'a', name: 'A' })]);
    isCardOwned.mockReturnValue(true);

    showStatisticsModal({ cards: [makeCard({ id: 'a', name: 'A' })], countAll: true });
    expect(getHistory()).toHaveLength(0);

    appState.isViewOnlyMode = true;
    showStatisticsModal();
    expect(getHistory()).toHaveLength(0);
  });
});
