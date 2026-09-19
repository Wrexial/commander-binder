import { isCardOwned } from '../state/cardState.js';
import { isCardWanted, setCardsWanted } from '../state/wishlistState.js';
import { appState } from '../state/appState.js';
import { cardStore } from '../state/cardStore.js';
import { escapeHtml } from '../utils/html.js';
import { createModal } from './components/modal.js';
import { showToast } from './components/toast.js';
import { updateAllCardStates } from './cards.js';
import { showTooltip, hideTooltip, positionTooltip } from './tooltip.js';
import { preloadCardImages } from '../utils/cardImages.js';
import { getCheapestPrice } from '../utils/prices.js';
import { nextPrinting } from '../utils/printings.js';
import { rememberPreferredPrinting } from '../state/preferredPrintings.js';

/** Canonical display order and labels for the five colors plus colorless. */
const COLOR_ORDER = ['W', 'U', 'B', 'R', 'G', 'C'];
const COLOR_LABELS = {
  W: 'White',
  U: 'Blue',
  B: 'Black',
  R: 'Red',
  G: 'Green',
  C: 'Colorless',
};
const RARITY_LABELS = {
  mythic: 'Mythic',
  rare: 'Rare',
  uncommon: 'Uncommon',
  common: 'Common',
  special: 'Special',
  bonus: 'Bonus',
};

/** Buckets for the mana-value curve. 7+ is the final catch-all column. */
const MANA_CURVE_LABELS = ['0', '1', '2', '3', '4', '5', '6', '7+'];

/** EUR price brackets, checked in order. Covers every non-negative price. */
const PRICE_BUCKETS = [
  { label: '< €1', test: (price) => price < 1 },
  { label: '€1–5', test: (price) => price >= 1 && price < 5 },
  { label: '€5–20', test: (price) => price >= 5 && price < 20 },
  { label: '€20–50', test: (price) => price >= 20 && price < 50 },
  { label: '€50+', test: (price) => price >= 50 },
];

/** How many creature types to list before the breakdown gets noisy. */
const MAX_TYPES_SHOWN = 12;

/** How many sets to list in the per-set completion breakdown. */
const MAX_SETS_SHOWN = 12;

/**
 * Resolve the colors of a card, falling back to its faces for modal DFCs.
 * Returns a de-duplicated array of color letters (empty for colorless cards).
 *
 * @param {object} card Scryfall card object.
 * @returns {string[]}
 */
function resolveColors(card) {
  let colors = Array.isArray(card.colors) ? card.colors : [];

  if (colors.length === 0 && Array.isArray(card.card_faces)) {
    colors = card.card_faces.flatMap((face) => face?.colors || []);
  }

  return [...new Set(colors)];
}

/**
 * Resolve a card's color identity, which for commanders includes colors
 * produced or referenced by its rules text, not just its casting cost.
 *
 * @param {object} card Scryfall card object.
 * @returns {string[]}
 */
function resolveColorIdentity(card) {
  let identity = Array.isArray(card.color_identity) ? card.color_identity : [];

  if (identity.length === 0 && Array.isArray(card.card_faces)) {
    identity = card.card_faces.flatMap((face) => face?.color_identity || []);
  }

  return [...new Set(identity)];
}

/**
 * Pull the creature subtypes from a card's front face, e.g.
 * "Legendary Creature — Human Wizard" -> ["Human", "Wizard"].
 *
 * @param {object} card Scryfall card object.
 * @returns {string[]}
 */
function resolveCreatureTypes(card) {
  const typeLine = (card.type_line || '').split(' // ')[0];
  const [, subtype = ''] = typeLine.split(' — ');
  return subtype.trim().split(/\s+/).filter(Boolean);
}

/**
 * Median of a numeric array. Returns `null` for an empty array.
 *
 * @param {number[]} values
 * @returns {number|null}
 */
function median(values) {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

/**
 * Compute the collection statistics shown in the statistics modal.
 *
 * @param {object[]} cards Owned cards to analyze.
 * @param {number} [totalAvailable] Total unique legendary creatures known to
 *   the app, used as the denominator for the completion percentage.
 * @param {object[]} [allCards] Full collection (one entry per creature). Used to
 *   compute per-set completion; defaults to `cards`.
 * @returns {{
 *   totalCards: number,
 *   totalValue: number,
 *   averageCardValue: number,
 *   medianCardValue: number|null,
 *   completion: { owned: number, total: number, percent: number },
 *   colors: Record<string, number>,
 *   colorIdentity: Record<string, number>,
 *   colorCombinations: Record<string, number>,
 *   types: Record<string, number>,
 *   rarities: Record<string, number>,
 *   manaCurve: Record<string, number>,
 *   averageManaValue: number|null,
 *   medianManaValue: number|null,
 *   priceBuckets: { label: string, count: number }[],
 *   top5ValuableCards: { name: string, price: number, card: object }[],
 *   sets: { code: string, name: string, owned: number, total: number, percent: number, missing: string[], wantedMissing: string[] }[],
 *   setsCompleted: number,
 *   missingCount: number,
 *   missingNames: string[],
 *   wishlist: { wanted: number, missing: number, missingNames: string[] },
 * }}
 */
export function calculateStatistics(cards, totalAvailable = cards.length, allCards = cards) {
  const totalCards = cards.length;
  let totalValue = 0;
  const colors = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  const colorIdentity = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  const colorCombinations = {};
  const types = {};
  const rarities = {};
  const pricedCards = [];
  const manaValues = [];
  const manaCurve = Object.fromEntries(MANA_CURVE_LABELS.map((label) => [label, 0]));

  for (const card of cards) {
    const price = getCheapestPrice(card);
    if (price !== null) {
      totalValue += price;
      pricedCards.push({ name: card.name, price, card });
    }

    const cardColors = resolveColors(card);

    if (cardColors.length === 0) {
      // Colorless cards still belong in the color breakdown (artifacts,
      // lands, Eldrazi, ...) instead of being silently dropped.
      colors.C += 1;
      colorCombinations.C = (colorCombinations.C || 0) + 1;
    } else {
      for (const color of cardColors) {
        colors[color] = (colors[color] || 0) + 1;
      }

      const key = [...cardColors].sort().join('');
      colorCombinations[key] = (colorCombinations[key] || 0) + 1;
    }

    const identity = resolveColorIdentity(card);
    if (identity.length === 0) {
      colorIdentity.C += 1;
    } else {
      for (const color of identity) {
        colorIdentity[color] = (colorIdentity[color] || 0) + 1;
      }
    }

    for (const type of resolveCreatureTypes(card)) {
      types[type] = (types[type] || 0) + 1;
    }

    const rarity = card.rarity || 'unknown';
    rarities[rarity] = (rarities[rarity] || 0) + 1;

    const manaValue = Number.isFinite(card.cmc) ? Math.max(0, Math.floor(card.cmc)) : 0;
    manaValues.push(manaValue);
    const curveKey = manaValue >= 7 ? '7+' : String(manaValue);
    manaCurve[curveKey] += 1;
  }

  const top5ValuableCards = [...pricedCards].sort((a, b) => b.price - a.price).slice(0, 5);
  const averageCardValue = totalCards > 0 ? totalValue / totalCards : 0;

  const priceBuckets = PRICE_BUCKETS.map((bucket) => ({
    label: bucket.label,
    count: 0,
  }));
  for (const { price } of pricedCards) {
    const index = PRICE_BUCKETS.findIndex((bucket) => bucket.test(price));
    if (index >= 0) priceBuckets[index].count += 1;
  }

  const manaSum = manaValues.reduce((sum, value) => sum + value, 0);

  // Per-set completion: of the legendary creatures a set introduced (each
  // `allCards` entry is a creature's default printing), how many are owned.
  // Only sets the collector has at least one card in are listed, so the long
  // tail of untouched sets does not bury the useful rows.
  const setTotals = new Map();
  for (const card of allCards) {
    const code = card.set;
    if (!code) continue;
    const entry = setTotals.get(code) || { code, name: card.set_name || code, total: 0 };
    entry.total += 1;
    if (!entry.name && card.set_name) entry.name = card.set_name;
    setTotals.set(code, entry);
  }

  const setOwned = new Map();
  for (const card of cards) {
    const code = card.set;
    if (!code) continue;
    setOwned.set(code, (setOwned.get(code) || 0) + 1);
  }

  // Missing cards are the entries of `allCards` that `cards` does not contain.
  // `cards` is always the owned subset of `allCards` (same object references),
  // so identity is both correct and cheap here.
  const ownedSet = new Set(cards);
  const missingBySet = new Map();
  const missingNames = [];
  const wantedMissingBySet = new Map();
  const wantedMissingNames = [];
  let wantedCount = 0;
  for (const card of allCards) {
    const wanted = isCardWanted(card);
    if (wanted) wantedCount += 1;
    if (ownedSet.has(card)) continue;
    missingNames.push(card.name);
    if (wanted) {
      wantedMissingNames.push(card.name);
      if (card.set) {
        const wantedList = wantedMissingBySet.get(card.set);
        if (wantedList) wantedList.push(card.name);
        else wantedMissingBySet.set(card.set, [card.name]);
      }
    }
    if (!card.set) continue;
    const list = missingBySet.get(card.set);
    if (list) list.push(card.name);
    else missingBySet.set(card.set, [card.name]);
  }

  const sets = Array.from(setTotals.values())
    .map((entry) => {
      const owned = setOwned.get(entry.code) || 0;
      return {
        ...entry,
        owned,
        percent: entry.total > 0 ? (owned / entry.total) * 100 : 0,
        missing: missingBySet.get(entry.code) || [],
        wantedMissing: wantedMissingBySet.get(entry.code) || [],
      };
    })
    .filter((entry) => entry.owned > 0)
    .sort((a, b) => b.percent - a.percent || b.owned - a.owned || a.name.localeCompare(b.name));

  // Fully-collected sets are reported as a count, not mixed into the list of
  // in-progress sets (which are the useful "what to finish next" ones).
  const setsCompleted = sets.filter(
    (entry) => entry.total > 0 && entry.owned >= entry.total
  ).length;

  return {
    totalCards,
    totalValue,
    averageCardValue,
    medianCardValue: median(pricedCards.map((card) => card.price)),
    completion: {
      owned: totalCards,
      total: totalAvailable,
      percent: totalAvailable > 0 ? (totalCards / totalAvailable) * 100 : 100,
    },
    colors,
    colorIdentity,
    colorCombinations,
    types,
    rarities,
    manaCurve,
    averageManaValue: manaValues.length > 0 ? manaSum / manaValues.length : null,
    medianManaValue: median(manaValues),
    priceBuckets,
    top5ValuableCards,
    sets,
    setsCompleted,
    missingCount: missingNames.length,
    missingNames,
    wishlist: {
      wanted: wantedCount,
      missing: wantedMissingNames.length,
      missingNames: wantedMissingNames,
    },
  };
}

function formatEuro(value) {
  return `€${Number(value).toFixed(2)}`;
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return '—';
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded}%`;
}

function formatManaValue(value) {
  if (value == null) return '—';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function manaSymbol(symbol) {
  return `<img src="https://svgs.scryfall.io/card-symbols/${symbol}.svg" class="mana-symbol" alt="${COLOR_LABELS[symbol] || symbol}" loading="lazy">`;
}

function section(title, body, meta) {
  return `
        <section class="stats-section">
            <h3>${title}${meta ? `<span class="stats-section-total">${meta}</span>` : ''}</h3>
            ${body}
        </section>`;
}

function barRow({ label, count, max, className = '', symbol = '' }) {
  const percent = max > 0 ? Math.max((count / max) * 100, 3) : 0;
  return `
        <div class="stats-bar-row">
            <span class="stats-bar-label">${symbol}${label}</span>
            <span class="stats-bar-track"><span class="stats-bar-fill ${className}" style="width: ${percent}%"></span></span>
            <span class="stats-bar-count">${count}</span>
        </div>`;
}

function entriesByCount(record) {
  return Object.entries(record).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function renderSummary(stats) {
  const { owned, total, percent } = stats.completion;
  const creatureWord = total === 1 ? 'legendary creature' : 'legendary creatures';

  return `
        <div class="stats-summary">
            <div class="stat-card">
                <span class="stat-card-label">Total Cards</span>
                <span class="stat-card-value">${stats.totalCards}</span>
            </div>
            <div class="stat-card">
                <span class="stat-card-label">Total Value</span>
                <span class="stat-card-value">${formatEuro(stats.totalValue)}</span>
            </div>
            <div class="stat-card">
                <span class="stat-card-label">Average Card Value</span>
                <span class="stat-card-value">${formatEuro(stats.averageCardValue)}</span>
            </div>
            <div class="stat-card">
                <span class="stat-card-label">Completion</span>
                <span class="stat-card-value">${formatPercent(percent)}</span>
                <span class="stat-card-sub">${owned} / ${total} ${creatureWord}</span>
                <span class="stat-card-progress"><span style="width: ${Math.min(Math.max(percent, 0), 100)}%"></span></span>
            </div>
        </div>`;
}

function renderColorBars(colors) {
  const present = COLOR_ORDER.filter((color) => colors[color] > 0);
  if (present.length === 0) {
    return '<p class="stats-empty">No color data.</p>';
  }

  const max = Math.max(...present.map((color) => colors[color]));
  const rows = present
    .map((color) =>
      barRow({
        label: COLOR_LABELS[color],
        symbol: manaSymbol(color),
        className: `stat-color-${color}`,
        count: colors[color],
        max,
      })
    )
    .join('');

  return `<div class="stats-bars">${rows}</div>`;
}

function renderColors(colors) {
  return section('Card Colors', renderColorBars(colors));
}

function renderColorIdentity(colorIdentity) {
  return section('Color Identity', renderColorBars(colorIdentity));
}

function renderColorCombinations(combinations) {
  const entries = entriesByCount(combinations);
  if (entries.length === 0) {
    return section('Color Combinations', '<p class="stats-empty">No color data.</p>');
  }

  const chips = entries
    .map(([combo, count]) => {
      // Display mana symbols in canonical WUBRG order even though the key
      // is stored alphabetically.
      const ordered = [...combo].sort((a, b) => COLOR_ORDER.indexOf(a) - COLOR_ORDER.indexOf(b));
      const symbols = ordered.map((color) => manaSymbol(color)).join('');
      return `<span class="stats-combo">${symbols}<span class="stats-combo-count">${count}</span></span>`;
    })
    .join('');

  return section(
    'Color Combinations',
    `<div class="stats-combos">${chips}</div>`,
    `${entries.length} total`
  );
}

function renderManaCurve(stats) {
  const entries = Object.entries(stats.manaCurve);
  const max = Math.max(...entries.map(([, count]) => count), 1);

  const columns = entries
    .map(([label, count]) => {
      const height = count > 0 ? Math.max((count / max) * 100, 6) : 2;
      return `
                <div class="stats-curve-col">
                    <span class="stats-curve-count">${count || ''}</span>
                    <span class="stats-curve-bar-track"><span class="stats-curve-bar" style="height: ${height}%"></span></span>
                    <span class="stats-curve-label">${label}</span>
                </div>`;
    })
    .join('');

  const meta =
    stats.averageManaValue != null
      ? `avg ${stats.averageManaValue.toFixed(1)} · median ${formatManaValue(stats.medianManaValue)}`
      : '';

  return section('Mana Value Curve', `<div class="stats-curve">${columns}</div>`, meta);
}

function renderRarities(rarities) {
  const entries = entriesByCount(rarities);
  if (entries.length === 0) {
    return section('Rarities', '<p class="stats-empty">No rarity data.</p>');
  }

  const max = entries[0][1];
  const rows = entries
    .map(([rarity, count]) =>
      barRow({
        label: RARITY_LABELS[rarity] || rarity,
        className: `stat-rarity-${rarity}`,
        count,
        max,
      })
    )
    .join('');

  return section('Rarities', `<div class="stats-bars">${rows}</div>`);
}

function renderCreatureTypes(types) {
  const entries = entriesByCount(types);
  if (entries.length === 0) {
    return section('Creature Types', '<p class="stats-empty">No type data.</p>');
  }

  const shown = entries.slice(0, MAX_TYPES_SHOWN);
  const max = shown[0][1];
  const rows = shown.map(([type, count]) => barRow({ label: type, count, max })).join('');

  return section(
    'Creature Types',
    `<div class="stats-bars">${rows}</div>`,
    `${entries.length} type${entries.length === 1 ? '' : 's'}`
  );
}

function renderSetCompletion(sets, setsCompleted) {
  const meta = `Sets completed: ${setsCompleted}`;

  if (sets.length === 0) {
    return section('Set Completion', '<p class="stats-empty">No owned cards yet.</p>');
  }

  // Completed sets are summarised in the meta line; the rows are the sets still
  // in progress, nearest to completion first.
  const inProgress = sets.filter((set) => set.total === 0 || set.owned < set.total);
  if (inProgress.length === 0) {
    return section(
      'Set Completion',
      '<p class="stats-empty">Every set you have started is complete. Nice work!</p>',
      meta
    );
  }

  const rows = inProgress
    .slice(0, MAX_SETS_SHOWN)
    .map((set) => {
      // Only offer the action while at least one missing card isn't wanted yet.
      const canWishlist = set.wantedMissing.length < set.missing.length;
      return `
        <div class="stats-bar-row${canWishlist ? ' has-copy' : ''}">
            <span class="stats-bar-label">${escapeHtml(set.name)} <span class="stats-set-code">${escapeHtml(set.code.toUpperCase())}</span></span>
            <span class="stats-bar-track"><span class="stats-bar-fill" style="width: ${Math.max(set.percent, 3)}%"></span></span>
            <span class="stats-bar-count">${set.owned}/${set.total}</span>
            ${
              canWishlist
                ? `<button type="button" class="stats-set-wishlist" data-set="${escapeHtml(set.code)}" title="Add ${set.missing.length} missing card${set.missing.length === 1 ? '' : 's'} to your wishlist" aria-label="Add ${set.missing.length} missing card${set.missing.length === 1 ? '' : 's'} from ${escapeHtml(set.name)} to your wishlist">Wishlist</button>`
                : ''
            }
        </div>`;
    })
    .join('');

  return section('Set Completion', `<div class="stats-bars">${rows}</div>`, meta);
}

/**
 * Sets ranked by how many of their missing cards are on the wishlist, so the
 * collector can see which set to chase next. Only *missing* cards count: a
 * wanted card already owned is not a target.
 */
function renderWishlistTargets(sets) {
  const targets = sets
    .filter((set) => set.wantedMissing.length > 0)
    .sort((a, b) => b.wantedMissing.length - a.wantedMissing.length || a.name.localeCompare(b.name))
    .slice(0, MAX_SETS_SHOWN);

  if (targets.length === 0) {
    return section(
      'Wishlist Targets',
      '<p class="stats-empty">No missing cards on your wishlist.</p>'
    );
  }

  const rows = targets
    .map(
      (set) => `
        <div class="stats-bar-row has-copy">
            <span class="stats-bar-label">${escapeHtml(set.name)} <span class="stats-set-code">${escapeHtml(set.code.toUpperCase())}</span></span>
            <span class="stats-bar-count">${set.wantedMissing.length} wanted</span>
            <button type="button" class="stats-wishlist-copy" data-set="${escapeHtml(set.code)}" title="Copy ${set.wantedMissing.length} wanted missing card${set.wantedMissing.length === 1 ? '' : 's'}" aria-label="Copy ${set.wantedMissing.length} wanted missing card${set.wantedMissing.length === 1 ? '' : 's'} from ${escapeHtml(set.name)}">Copy</button>
        </div>`
    )
    .join('');

  return section(
    'Wishlist Targets',
    `<div class="stats-bars">${rows}</div>`,
    `${targets.length} set${targets.length === 1 ? '' : 's'}`
  );
}

function renderPriceDistribution(priceBuckets, medianValue) {
  const total = priceBuckets.reduce((sum, bucket) => sum + bucket.count, 0);
  if (total === 0) {
    return section(
      'Price Distribution',
      '<p class="stats-empty">No priced cards in this collection yet.</p>'
    );
  }

  const max = Math.max(...priceBuckets.map((bucket) => bucket.count));
  const rows = priceBuckets
    .map((bucket) => barRow({ label: bucket.label, count: bucket.count, max }))
    .join('');

  return section(
    'Price Distribution',
    `<div class="stats-bars">${rows}</div>`,
    `median ${formatEuro(medianValue)}`
  );
}

function renderTopCards(cards) {
  if (cards.length === 0) {
    return section(
      'Top 5 Most Valuable Cards',
      '<p class="stats-empty">No priced cards in this collection yet.</p>'
    );
  }

  const items = cards
    .map(
      (card, index) => `
            <li class="stats-top-card">
                <span class="stats-top-rank">${index + 1}</span>
                <span class="stats-top-name" title="${escapeHtml(card.name)}">${escapeHtml(card.name)}</span>
                <span class="stats-top-price">${formatEuro(card.price)}</span>
            </li>`
    )
    .join('');

  return section('Top 5 Most Valuable Cards', `<ul class="stats-top-cards">${items}</ul>`);
}

/**
 * Attach the shared card tooltip to the "most valuable cards" rows. Returns a
 * cleanup function that removes the listeners when the modal closes.
 *
 * @param {HTMLElement} container Modal content that holds the rows.
 * @param {HTMLElement|null} tooltip Shared `#tooltip` element.
 * @param {{ card: object }[]} topCards Computed top cards, in render order.
 * @returns {() => void}
 */
function wireTopCardTooltips(container, tooltip, topCards) {
  if (!tooltip || topCards.length === 0) return () => {};

  const rows = Array.from(container.querySelectorAll('.stats-top-card'));

  rows.forEach((row, index) => {
    row.cardData = topCards[index]?.card || null;
  });

  const handleEnter = (event) => {
    const row = event.currentTarget;
    if (!row.cardData) return;
    tooltip.onCycle = (cycleEvent) => cycleRowPrinting(row, cycleEvent);
    // The statistics modal is mouse-driven, so spell out the right-click
    // shortcut instead of the generic touch wording.
    tooltip.cycleLabel = 'Right-click for next printing';
    preloadCardImages(row.cardData);
    row.setAttribute('aria-describedby', 'tooltip');
    showTooltip(event, row.cardData, tooltip);
  };

  const handleMove = (event) => {
    if (tooltip.style.display !== 'none') {
      positionTooltip(event, tooltip);
    }
  };

  const handleLeave = (event) => {
    tooltip.onCycle = null;
    tooltip.cycleLabel = null;
    event.currentTarget.removeAttribute('aria-describedby');
    hideTooltip(tooltip);
  };

  // Match the main grid: advance a row to its next printing. Right-click does
  // this on desktop; the tooltip's "Next printing" button covers touch.
  const cycleRowPrinting = (row, event) => {
    if (!row.cardData) return;

    const next = nextPrinting(cardStore.getPrintings(row.cardData.name), row.cardData);
    if (!next) return;

    // A pick made in the statistics preview follows the card to the grid.
    rememberPreferredPrinting(next);

    row.cardData = next;
    showTooltip(event, row.cardData, tooltip);
  };

  const handleContextMenu = (event) => {
    event.preventDefault();
    if (tooltip.style.display === 'none') return;
    cycleRowPrinting(event.currentTarget, event);
  };

  rows.forEach((row) => {
    row.addEventListener('mouseenter', handleEnter);
    row.addEventListener('mousemove', handleMove);
    row.addEventListener('mouseleave', handleLeave);
    row.addEventListener('contextmenu', handleContextMenu);
  });

  return () => {
    rows.forEach((row) => {
      row.removeEventListener('mouseenter', handleEnter);
      row.removeEventListener('mousemove', handleMove);
      row.removeEventListener('mouseleave', handleLeave);
      row.removeEventListener('contextmenu', handleContextMenu);
    });
  };
}

/**
 * Build the statistics modal markup for a computed stats object.
 *
 * @param {ReturnType<typeof calculateStatistics>} stats
 * @returns {string}
 */
export function createStatisticsHTML(stats) {
  return `
        ${renderSummary(stats)}
        <div class="stats-grid">
            ${renderColors(stats.colors)}
            ${renderColorIdentity(stats.colorIdentity)}
            ${renderColorCombinations(stats.colorCombinations)}
            ${renderManaCurve(stats)}
            ${renderRarities(stats.rarities)}
            ${renderCreatureTypes(stats.types)}
            ${renderSetCompletion(stats.sets, stats.setsCompleted)}
            ${renderWishlistTargets(stats.sets)}
            ${renderPriceDistribution(stats.priceBuckets, stats.medianCardValue)}
        </div>
        ${renderTopCards(stats.top5ValuableCards)}
    `;
}

/**
 * Copy a list of card names to the clipboard, one per line, with a toast.
 *
 * @param {string[]} names
 * @param {string} label Noun used in the toast, e.g. "missing cards".
 */
async function copyCardNames(names, label) {
  if (!names || names.length === 0) {
    showToast('Nothing to copy.', 'warning');
    return;
  }

  try {
    await navigator.clipboard.writeText(names.join('\n'));
    showToast(`Copied ${names.length} ${label}.`, 'success');
  } catch (err) {
    console.error('Failed to copy card names:', err);
    showToast('Could not copy to the clipboard.', 'error');
  }
}

/**
 * Open the collection statistics modal. Shows a toast instead when no owned
 * cards have been loaded yet.
 *
 * @returns {void}
 */
export function showStatisticsModal() {
  const allCards = cardStore.getAll();
  const ownedCards = allCards.filter(isCardOwned);

  if (ownedCards.length === 0) {
    showToast('No owned cards have been loaded yet. Scroll to load more cards.', 'warning');
    return;
  }

  // Completion is measured against unique card names, which is what the
  // collection UI tracks (the search's apiTotalCards counts printings).
  let stats = calculateStatistics(ownedCards, allCards.length, allCards);
  const tooltip = document.getElementById('tooltip');
  // The stats preview is hover-driven; make sure it never inherits the grid's
  // swipe-navigation handler.
  if (tooltip) tooltip.onNavigate = null;
  let cleanupTopCardTooltips = () => {};

  const shell = createModal({
    className: 'statistics-modal',
    ariaLabel: 'Collection Statistics',
    onClose: () => {
      cleanupTopCardTooltips();
      if (tooltip) {
        tooltip.onCycle = null;
        tooltip.onNavigate = null;
        tooltip.cycleLabel = null;
        hideTooltip(tooltip);
      }
    },
  });
  const { modal, close } = shell;

  const header = document.createElement('div');
  header.className = 'statistics-header';

  const headerText = document.createElement('div');

  const modalHeader = document.createElement('h2');
  modalHeader.textContent = 'Collection Statistics';

  const subtitle = document.createElement('p');
  subtitle.className = 'statistics-subtitle';

  headerText.appendChild(modalHeader);
  headerText.appendChild(subtitle);

  const contentArea = document.createElement('div');
  contentArea.className = 'modal-content-area statistics-content';

  const cardsByName = new Map(allCards.map((card) => [card.name, card]));

  /** Recompute and repaint after a wishlist change. */
  function renderContent() {
    stats = calculateStatistics(ownedCards, allCards.length, allCards);

    const cardWord = stats.totalCards === 1 ? 'card' : 'cards';
    const wishlistSuffix = stats.wishlist.wanted > 0 ? ` · ${stats.wishlist.wanted} wanted` : '';
    subtitle.textContent = `${stats.totalCards} owned ${cardWord} · ${formatEuro(stats.totalValue)} total value${wishlistSuffix}`;

    contentArea.innerHTML = createStatisticsHTML(stats);
    wireStatisticsActions();
  }

  function wireStatisticsActions() {
    // Each set row's "Wishlist" button adds that set's missing cards. Read-only
    // share views get the row but not the action.
    const missingCardsBySet = new Map(
      stats.sets.map((set) => [
        set.code,
        set.missing.map((name) => cardsByName.get(name)).filter(Boolean),
      ])
    );

    contentArea.querySelectorAll('.stats-set-wishlist').forEach((button) => {
      if (appState.isViewOnlyMode) {
        button.hidden = true;
        return;
      }

      button.addEventListener('click', async () => {
        const cards = missingCardsBySet.get(button.dataset.set) || [];
        if (cards.length === 0) return;

        button.disabled = true;
        try {
          await setCardsWanted(cards, true);
          updateAllCardStates();
          showToast(
            `Added ${cards.length} card${cards.length === 1 ? '' : 's'} to your wishlist.`,
            'success'
          );
          // Repaint so the Wishlist Targets section reflects the change and the
          // now-satisfied rows drop their button.
          renderContent();
        } catch (err) {
          button.disabled = false;
          console.error('Failed to wishlist set cards:', err);
          showToast('Could not update the wishlist.', 'error');
        }
      });
    });

    // The wishlist-target rows copy only the wanted-and-missing names.
    const wantedMissingBySet = new Map(stats.sets.map((set) => [set.code, set.wantedMissing]));
    contentArea.querySelectorAll('.stats-wishlist-copy').forEach((button) => {
      button.addEventListener('click', () => {
        copyCardNames(wantedMissingBySet.get(button.dataset.set) || [], 'wanted cards');
      });
    });

    // Hover the "most valuable cards" rows to preview the full card.
    cleanupTopCardTooltips();
    cleanupTopCardTooltips = wireTopCardTooltips(contentArea, tooltip, stats.top5ValuableCards);
  }

  renderContent();

  const buttonContainer = document.createElement('div');
  buttonContainer.className = 'modal-button-container';

  const closeIcon = document.createElement('button');
  closeIcon.type = 'button';
  closeIcon.className = 'statistics-close';
  closeIcon.setAttribute('aria-label', 'Close statistics');
  closeIcon.innerHTML = '&times;';
  closeIcon.addEventListener('click', close);

  header.appendChild(headerText);
  header.appendChild(closeIcon);

  const copyMissingButton = document.createElement('button');
  copyMissingButton.type = 'button';
  copyMissingButton.className = 'stats-copy-missing';
  copyMissingButton.textContent = `Copy ${stats.missingCount} missing`;
  copyMissingButton.disabled = stats.missingCount === 0;
  copyMissingButton.addEventListener('click', () =>
    copyCardNames(stats.missingNames, 'missing cards')
  );

  const closeButton = document.createElement('button');
  closeButton.textContent = 'Close';
  closeButton.addEventListener('click', close);
  buttonContainer.append(copyMissingButton, closeButton);

  modal.appendChild(header);
  modal.appendChild(contentArea);
  modal.appendChild(buttonContainer);

  closeButton.focus();
}
