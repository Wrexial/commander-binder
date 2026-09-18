import { describe, it, expect, vi, beforeEach } from 'vitest';

// Break the import chain into main.js/@clerk, which is irrelevant here.
vi.mock('../../state/cardState.js', () => ({
  isCardOwned: vi.fn(() => false),
}));

vi.mock('../../state/cardStore.js', () => ({
  cardStore: { getPrintings: vi.fn(() => []), getAll: vi.fn(() => []) },
}));

vi.mock('../components/toast.js', () => ({ showToast: vi.fn() }));

vi.mock('../tooltip.js', () => ({
  showTooltip: vi.fn(),
  hideTooltip: vi.fn(),
  positionTooltip: vi.fn(),
}));

import { calculateStatistics, createStatisticsHTML, showStatisticsModal } from '../statistics.js';
import { cardStore } from '../../state/cardStore.js';
import { isCardOwned } from '../../state/cardState.js';
import { showTooltip } from '../tooltip.js';

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
  showTooltip.mockClear();
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

  it('values cards by their cheapest available printing', () => {
    cardStore.getPrintings.mockImplementation((name) =>
      name === 'Cheap'
        ? [
            { prices: { eur: '10.00', eur_foil: '20.00' } },
            { prices: { eur: '5.00', eur_foil: null } },
          ]
        : []
    );

    const stats = calculateStatistics([
      makeCard({ name: 'Cheap' }),
      makeCard({ name: 'Unpriced' }),
    ]);

    expect(stats.totalValue).toBe(5);
    expect(stats.averageCardValue).toBe(2.5);
    expect(stats.medianCardValue).toBe(5);
    expect(stats.top5ValuableCards).toHaveLength(1);
    expect(stats.top5ValuableCards[0]).toMatchObject({ name: 'Cheap', price: 5 });
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
      { label: '< €1', count: 1 },
      { label: '€1–5', count: 1 },
      { label: '€5–20', count: 0 },
      { label: '€20–50', count: 1 },
      { label: '€50+', count: 1 },
    ]);
    expect(stats.medianCardValue).toBe(16.5);
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
      { code: 'm21', name: 'Core Set 2021', total: 1, owned: 1, percent: 100, missing: [] },
      {
        code: 'lea',
        name: 'Limited Edition Alpha',
        total: 2,
        owned: 1,
        percent: 50,
        missing: ['B'],
      },
    ]);
    expect(stats.missingCount).toBe(1);
    expect(stats.missingNames).toEqual(['B']);
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
      'Card Colors',
      'Color Identity',
      'Color Combinations',
      'Mana Value Curve',
      'Rarities',
      'Creature Types',
      'Set Completion',
      'Price Distribution',
      'Top 5 Most Valuable Cards',
    ]) {
      expect(html).toContain(heading);
    }

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
    const all = [makeCard({ name: 'A', set: 'x', set_name: '<img src=x onerror=alert(1)>' })];
    const stats = calculateStatistics(all, 1, all);

    const html = createStatisticsHTML(stats);

    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
  });

  it('adds a copy button to sets that have missing cards', () => {
    const all = [
      makeCard({ name: 'A', set: 'lea', set_name: 'Limited Edition Alpha' }),
      makeCard({ name: 'B', set: 'lea', set_name: 'Limited Edition Alpha' }),
    ];
    const stats = calculateStatistics([all[0]], 2, all);

    const html = createStatisticsHTML(stats);

    expect(html).toContain('stats-set-copy');
    expect(html).toContain('data-set="lea"');
  });
});

describe('showStatisticsModal', () => {
  it('attaches the card tooltip to the most valuable cards', () => {
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

    const row = document.querySelector('.stats-top-card');
    expect(row).toBeTruthy();

    row.dispatchEvent(new MouseEvent('mouseenter', { clientX: 10, clientY: 10 }));

    expect(showTooltip).toHaveBeenCalledTimes(1);
    expect(showTooltip.mock.calls[0][1]).toMatchObject({ name: 'Grail' });
    // The modal advertises the right-click shortcut rather than touch wording.
    expect(document.getElementById('tooltip').cycleLabel).toBe('Right-click for next printing');

    // Right-click cycles to the next printing, like the main card grid.
    row.dispatchEvent(new MouseEvent('contextmenu', { clientX: 10, clientY: 10 }));
    expect(showTooltip).toHaveBeenCalledTimes(2);
    expect(row.cardData.id).toBe('printing-2');

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
    expect(button.textContent).toBe('Copy 1 missing');
    button.click();
    await Promise.resolve();

    expect(writeText).toHaveBeenCalledWith('Missing One');
  });

  it("copies a single set's missing cards from its row button", async () => {
    document.body.innerHTML = '<div id="tooltip" class="tooltip"></div>';
    const owned = makeCard({ id: 'o', name: 'Owned', set: 'lea', set_name: 'Alpha' });
    const missing = makeCard({ id: 'm', name: 'Missing One', set: 'lea', set_name: 'Alpha' });
    cardStore.getAll.mockReturnValue([owned, missing]);
    cardStore.getPrintings.mockReturnValue([]);
    isCardOwned.mockImplementation((card) => card.id === 'o');

    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });

    showStatisticsModal();

    document.querySelector('.stats-set-copy').click();
    await Promise.resolve();

    expect(writeText).toHaveBeenCalledWith('Missing One');
  });
});
