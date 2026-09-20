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
import { getDisplayedPrice, formatPrice, formatPriceRange } from '../utils/prices.js';
import { rememberPreferredPrinting, resolveDisplayPrinting } from '../state/preferredPrintings.js';
import { openPrintingPicker } from './components/printingPickerModal.js';
import { recordSnapshot } from '../state/collectionHistory.js';

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
};

/**
 * Scryfall rarities the app does not present (the `special`/`bonus` frame
 * printings). They are left out of the rarity breakdown entirely.
 */
const EXCLUDED_RARITIES = new Set(['special', 'bonus']);

/** Buckets for the mana-value curve. 7+ is the final catch-all column. */
const MANA_CURVE_LABELS = ['0', '1', '2', '3', '4', '5', '6', '7+'];

/**
 * Price brackets in ascending order, spaced geometrically so a collection that
 * clusters at the low end (most cards are cheap) still gets detail there
 * instead of everything landing in one "< €1" bar. Labels are built lazily so
 * they follow the selected currency (EUR/USD/TIX).
 */
const PRICE_BUCKETS = [
  { min: 0, max: 0.25 },
  { min: 0.25, max: 0.5 },
  { min: 0.5, max: 1 },
  { min: 1, max: 2 },
  { min: 2, max: 5 },
  { min: 5, max: 10 },
  { min: 10, max: 20 },
  { min: 20, max: 50 },
  { min: 50, max: 100 },
  { min: 100, max: null },
].map((band) => ({
  ...band,
  label: () =>
    band.min === 0 ? `< ${formatPrice(band.max)}` : formatPriceRange(band.min, band.max),
  test: (price) => price >= band.min && (band.max == null || price < band.max),
}));

/** How many sets to list in the per-set completion breakdown. */
const MAX_SETS_SHOWN = 12;

/** Cap on names listed in a stats-row hover tooltip before "…and N more". */
const MAX_TOOLTIP_NAMES = 25;

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
 * Linear-interpolated percentile (`p` in 0–1) of an unsorted numeric array.
 * Returns `null` for an empty array.
 *
 * @param {number[]} values
 * @param {number} p
 * @returns {number|null}
 */
function percentile(values, p) {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
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
 *   minCardValue: number|null,
 *   maxCardValue: number|null,
 *   pricePercentiles: { p25: number|null, p50: number|null, p75: number|null, p90: number|null },
 *   topDecileValueShare: number,
 *   completion: { owned: number, total: number, percent: number },
 *   colors: Record<string, number>,
 *   colorIdentity: Record<string, number>,
 *   colorCombinations: Record<string, number>,
 *   types: Record<string, number>,
 *   rarities: Record<string, number>,
 *   manaCurve: Record<string, number>,
 *   averageManaValue: number|null,
 *   medianManaValue: number|null,
 *   priceBuckets: { label: string, count: number, value: number }[],
 *   top5ValuableCards: { name: string, price: number, card: object }[],
 *   sets: { code: string, name: string, owned: number, total: number, percent: number, missing: string[], wantedMissing: string[] }[],
 *   setsCompleted: number,
 *   missingCount: number,
 *   missingNames: string[],
 *   wishlist: { wanted: number, missing: number, missingNames: string[] },
 * }}
 */
export function calculateStatistics(
  cards,
  totalAvailable = cards.length,
  allCards = cards,
  { exactPrintings = false } = {}
) {
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
    // Value the printing the tile actually shows. On the grid that is the
    // user's pinned printing or the cheapest one, so resolve it; a binder pocket
    // already *is* its exact printing, so `exactPrintings` values it as-is (two
    // pockets of the same card can then hold two different prices).
    const displayCard = exactPrintings ? card : resolveDisplayPrinting(card);
    const price = displayCard ? getDisplayedPrice(displayCard) : null;
    if (price !== null) {
      totalValue += price;
      pricedCards.push({ name: card.name, price, card: displayCard });
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
    if (!EXCLUDED_RARITIES.has(rarity)) {
      rarities[rarity] = (rarities[rarity] || 0) + 1;
    }

    const manaValue = Number.isFinite(card.cmc) ? Math.max(0, Math.floor(card.cmc)) : 0;
    manaValues.push(manaValue);
    const curveKey = manaValue >= 7 ? '7+' : String(manaValue);
    manaCurve[curveKey] += 1;
  }

  const top5ValuableCards = [...pricedCards].sort((a, b) => b.price - a.price).slice(0, 5);
  const averageCardValue = totalCards > 0 ? totalValue / totalCards : 0;

  // Per-bucket count *and* total value, so the distribution shows where the
  // money actually sits rather than only how many cards fall in each range.
  const priceBuckets = PRICE_BUCKETS.map((bucket) => ({
    label: bucket.label(),
    count: 0,
    value: 0,
  }));
  for (const { price } of pricedCards) {
    const index = PRICE_BUCKETS.findIndex((bucket) => bucket.test(price));
    if (index >= 0) {
      priceBuckets[index].count += 1;
      priceBuckets[index].value += price;
    }
  }

  const pricedValues = pricedCards.map((card) => card.price);
  const minCardValue = pricedValues.length > 0 ? Math.min(...pricedValues) : null;
  const maxCardValue = pricedValues.length > 0 ? Math.max(...pricedValues) : null;
  const pricePercentiles = {
    p25: percentile(pricedValues, 0.25),
    p50: percentile(pricedValues, 0.5),
    p75: percentile(pricedValues, 0.75),
    p90: percentile(pricedValues, 0.9),
  };

  // Value concentration: the most valuable tenth of the priced cards can hold
  // most of the collection's value, which the bands alone don't convey.
  const descendingValues = [...pricedValues].sort((a, b) => b - a);
  const topCount = Math.max(1, Math.ceil(descendingValues.length * 0.1));
  const topValue = descendingValues.slice(0, topCount).reduce((sum, value) => sum + value, 0);
  const topDecileValueShare = totalValue > 0 ? (topValue / totalValue) * 100 : 0;

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
    medianCardValue: median(pricedValues),
    minCardValue,
    maxCardValue,
    pricePercentiles,
    topDecileValueShare,
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

function formatMoney(value) {
  return formatPrice(value);
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

/** Signed integer delta, e.g. "+12" / "-3" / "0". */
function signedCount(value) {
  return `${value > 0 ? '+' : ''}${value}`;
}

/** Signed percentage delta, e.g. "+3.5%" / "-2%" / "0%". */
function signedPercent(value) {
  if (!Number.isFinite(value) || Math.abs(value) < 0.05) return '0%';
  const rounded = Math.abs(value) >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
}

/** Signed money delta, e.g. "+€3.50" / "−€1.20" (a real minus, not a hyphen). */
function signedMoney(value) {
  if (!Number.isFinite(value) || Math.abs(value) < 0.005) return formatMoney(0);
  return `${value > 0 ? '+' : '−'}${formatMoney(Math.abs(value))}`;
}

/** One metric tile in the progress section. */
function progressMetric(label, current, delta, deltaValue) {
  const tone = deltaValue > 0 ? 'up' : deltaValue < 0 ? 'down' : 'flat';
  return `
    <div class="stats-progress-item">
      <span class="stats-progress-label">${escapeHtml(label)}</span>
      <span class="stats-progress-value">${current}</span>
      <span class="stats-progress-delta is-${tone}">${delta}</span>
    </div>`;
}

/**
 * The "since last visit" section. `previous` is the last daily snapshot before
 * today (see `state/collectionHistory.js`); `null` means tracking just started.
 *
 * @param {object} current Stats for the collection being reported on.
 * @param {object|null} previous The prior snapshot.
 * @returns {string}
 */
function renderProgress(current, previous) {
  if (!previous) {
    return section(
      'Progress',
      '<p class="stats-empty">Tracking starts today — check back tomorrow to see how your collection grew.</p>'
    );
  }

  const ownedDelta = current.completion.owned - previous.owned;
  const percentNow = current.completion.percent;
  const percentBefore = previous.total > 0 ? (previous.owned / previous.total) * 100 : 0;
  const percentDelta = percentNow - percentBefore;
  const valueDelta = current.totalValue - previous.value;
  const setsDelta = (current.setsCompleted || 0) - (previous.setsCompleted || 0);

  const since = new Date(`${previous.date}T00:00:00`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const body = `
    <div class="stats-progress">
      ${progressMetric('Cards owned', `${current.completion.owned}`, signedCount(ownedDelta), ownedDelta)}
      ${progressMetric('Completion', formatPercent(percentNow), signedPercent(percentDelta), percentDelta)}
      ${progressMetric('Value', formatMoney(current.totalValue), signedMoney(valueDelta), valueDelta)}
      ${progressMetric('Sets completed', `${current.setsCompleted || 0}`, signedCount(setsDelta), setsDelta)}
    </div>
    <p class="stats-progress-since">Compared with your collection on ${escapeHtml(since)}.</p>`;

  return section('Progress', body);
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

/** A card inside a {@link sectionGroup}: same chrome, but an `h4` label. */
function groupCard(title, body, meta) {
  return `
        <section class="stats-group-card">
            <h4>${title}${meta ? `<span class="stats-section-total">${meta}</span>` : ''}</h4>
            ${body}
        </section>`;
}

/**
 * A row of related cards sharing one header. The header spans every column of
 * `.stats-grid` so the group starts a fresh row, and the member cards sit side
 * by side inside it.
 *
 * @param {string} title Shared header text (may contain HTML).
 * @param {string[]} cards `groupCard(...)` markup.
 */
function sectionGroup(title, cards) {
  return `
        <section class="stats-section-group">
            <h3 class="stats-group-title">${title}</h3>
            <div class="stats-group-cards">${cards.join('')}</div>
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

/**
 * A hover tooltip body listing card names, one per line. Long lists are
 * truncated so a set with hundreds of missing cards stays readable.
 *
 * @param {string[]} names
 * @returns {string}
 */
function cardsTitle(names) {
  if (names.length === 0) return '';
  const shown = names.slice(0, MAX_TOOLTIP_NAMES);
  const extra = names.length - shown.length;
  return extra > 0 ? `${shown.join('\n')}\n…and ${extra} more` : shown.join('\n');
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
                <span class="stat-card-value">${formatMoney(stats.totalValue)}</span>
            </div>
            <div class="stat-card">
                <span class="stat-card-label">Average Card Value</span>
                <span class="stat-card-value">${formatMoney(stats.averageCardValue)}</span>
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

function rarityBars(rarities) {
  const entries = entriesByCount(rarities);
  if (entries.length === 0) {
    return '<p class="stats-empty">No rarity data.</p>';
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

  return `<div class="stats-bars">${rows}</div>`;
}

function creatureTypeBars(types) {
  const entries = entriesByCount(types);
  if (entries.length === 0) {
    return { body: '<p class="stats-empty">No type data.</p>', meta: '' };
  }

  const max = entries[0][1];
  const rows = entries.map(([type, count]) => barRow({ label: type, count, max })).join('');

  return {
    // All types are rendered; the list scrolls inside its card so a collection
    // with hundreds of creature types can't stretch the whole modal.
    body: `<div class="stats-bars stats-bars-scroll">${rows}</div>`,
    meta: `${entries.length} type${entries.length === 1 ? '' : 's'}`,
  };
}

function setCompletionBody(sets, setsCompleted) {
  const meta = `Sets completed: ${setsCompleted}`;

  if (sets.length === 0) {
    return { body: '<p class="stats-empty">No owned cards yet.</p>', meta: '' };
  }

  // Completed sets are summarised in the meta line; the rows are the sets still
  // in progress, nearest to completion first.
  const inProgress = sets.filter((set) => set.total === 0 || set.owned < set.total);
  if (inProgress.length === 0) {
    return {
      body: '<p class="stats-empty">Every set you have started is complete. Nice work!</p>',
      meta,
    };
  }

  const rows = inProgress
    .slice(0, MAX_SETS_SHOWN)
    .map((set) => {
      // Only offer the action while at least one missing card isn't wanted yet.
      const canWishlist = set.wantedMissing.length < set.missing.length;
      const title = cardsTitle(set.missing);
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
      return `
        <div class="stats-bar-row${canWishlist ? ' has-copy' : ''}"${titleAttr}>
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

  return { body: `<div class="stats-bars">${rows}</div>`, meta };
}

/**
 * Sets ranked by how many of their missing cards are on the wishlist, so the
 * collector can see which set to chase next. Only *missing* cards count: a
 * wanted card already owned is not a target.
 */
function wishlistTargetsBody(sets) {
  const targets = sets
    .filter((set) => set.wantedMissing.length > 0)
    .sort((a, b) => b.wantedMissing.length - a.wantedMissing.length || a.name.localeCompare(b.name))
    .slice(0, MAX_SETS_SHOWN);

  if (targets.length === 0) {
    return {
      body: '<p class="stats-empty">No missing cards on your wishlist.</p>',
      meta: '',
    };
  }

  const rows = targets
    .map((set) => {
      const title = cardsTitle(set.wantedMissing);
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
      return `
        <div class="stats-bar-row has-copy"${titleAttr}>
            <span class="stats-bar-label">${escapeHtml(set.name)} <span class="stats-set-code">${escapeHtml(set.code.toUpperCase())}</span></span>
            <span class="stats-bar-count">${set.wantedMissing.length} wanted</span>
            <button type="button" class="stats-wishlist-copy" data-set="${escapeHtml(set.code)}" title="Copy ${set.wantedMissing.length} wanted card name${set.wantedMissing.length === 1 ? '' : 's'}" aria-label="Copy ${set.wantedMissing.length} wanted card name${set.wantedMissing.length === 1 ? '' : 's'} from ${escapeHtml(set.name)}">Copy names</button>
        </div>`;
    })
    .join('');

  return {
    body: `<div class="stats-bars">${rows}</div>`,
    meta: `${targets.length} set${targets.length === 1 ? '' : 's'}`,
  };
}

function renderPriceDistribution(stats) {
  const { priceBuckets, minCardValue, maxCardValue, pricePercentiles, topDecileValueShare } = stats;
  const total = priceBuckets.reduce((sum, bucket) => sum + bucket.count, 0);
  if (total === 0) {
    return section(
      'Price Distribution',
      '<p class="stats-empty">No priced cards in this collection yet.</p>'
    );
  }

  const max = Math.max(...priceBuckets.map((bucket) => bucket.count));
  const rows = priceBuckets
    .map((bucket) => {
      const share = Math.round((bucket.count / total) * 100);
      const width = max > 0 ? Math.max((bucket.count / max) * 100, 3) : 0;
      const title =
        `${bucket.label}: ${bucket.count} card${bucket.count === 1 ? '' : 's'} (${share}%)` +
        (bucket.count > 0 ? ` · ${formatMoney(bucket.value)}` : '');
      return `
        <div class="stats-bar-row stats-price-row" title="${escapeHtml(title)}">
            <span class="stats-bar-label">${bucket.label}</span>
            <span class="stats-bar-track"><span class="stats-bar-fill" style="width: ${width}%"></span></span>
            <span class="stats-bar-count">${bucket.count}<span class="stats-price-share">${share}%</span></span>
            <span class="stats-price-value">${bucket.count > 0 ? formatMoney(bucket.value) : '—'}</span>
        </div>`;
    })
    .join('');

  // Percentile strip: where the bulk of the collection sits, which the bands
  // alone don't summarise.
  const summaryItems = [
    ['Min', minCardValue],
    ['25th', pricePercentiles.p25],
    ['Median', pricePercentiles.p50],
    ['75th', pricePercentiles.p75],
    ['90th', pricePercentiles.p90],
    ['Max', maxCardValue],
  ];
  const summary = `<dl class="stats-price-summary">${summaryItems
    .map(([label, value]) => `<div><dt>${label}</dt><dd>${formatMoney(value)}</dd></div>`)
    .join('')}</dl>`;

  const concentration = `The most valuable <strong>10%</strong> of cards hold <strong>${Math.round(topDecileValueShare)}%</strong> of the value.`;

  return section(
    'Price Distribution',
    `<div class="stats-bars">${rows}</div>${summary}<p class="stats-price-concentration">${concentration}</p>`,
    `${total} priced card${total === 1 ? '' : 's'}`
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
                <span class="stats-top-price">${formatMoney(card.price)}</span>
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
    tooltip.onChoosePrinting = (chooseEvent) => openRowPrintingPicker(row, chooseEvent);
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
    tooltip.onChoosePrinting = null;
    event.currentTarget.removeAttribute('aria-describedby');
    hideTooltip(tooltip);
  };

  // Open the printing picker for a statistics row; the pick follows the card to
  // the grid. Right-click and the preview's "Choose printing" button both do it.
  const openRowPrintingPicker = (row, event) => {
    if (!row.cardData) return;
    const current = row.cardData;
    openPrintingPicker({
      card: current,
      currentId: current.id,
      onPick: (printing) => {
        rememberPreferredPrinting(printing);
        row.cardData = printing;
        showTooltip(event, row.cardData, tooltip);
      },
    });
  };

  const handleContextMenu = (event) => {
    event.preventDefault();
    if (tooltip.style.display === 'none') return;
    openRowPrintingPicker(event.currentTarget, event);
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
export function createStatisticsHTML(stats, { extra = '' } = {}) {
  const types = creatureTypeBars(stats.types);
  const setCompletion = setCompletionBody(stats.sets, stats.setsCompleted);
  const wishlistTargets = wishlistTargetsBody(stats.sets);

  return `
        ${renderSummary(stats)}
        ${extra}
        <div class="stats-grid">
            ${sectionGroup('Colors', [
              groupCard('Card Colors', renderColorBars(stats.colors)),
              groupCard('Color Identity', renderColorBars(stats.colorIdentity)),
            ])}
            ${renderColorCombinations(stats.colorCombinations)}
            ${renderManaCurve(stats)}
            ${sectionGroup('Rarity &amp; Type', [
              groupCard('Rarities', rarityBars(stats.rarities)),
              groupCard('Creature Types', types.body, types.meta),
            ])}
            ${sectionGroup('Sets', [
              groupCard('Set Completion', setCompletion.body, setCompletion.meta),
              groupCard('Wishlist Targets', wishlistTargets.body, wishlistTargets.meta),
            ])}
            ${renderPriceDistribution(stats)}
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
/**
 * Open the statistics modal.
 *
 * @param {object} [options]
 * @param {object[]} [options.cards] Cards to report on; defaults to the whole
 *   loaded collection. The Binder Builder passes the visible binder's pockets.
 * @param {boolean} [options.countAll] Report every provided card instead of only
 *   the owned subset. The binder scope uses this so unowned non-legendary
 *   pockets and duplicates still count.
 * @param {string} [options.title] Modal heading.
 * @param {string} [options.emptyMessage] Toast shown when there is nothing to report.
 */
/**
 * Drop the grid's card-specific actions from the shared hover preview. The
 * statistics preview is read-only (it only cycles printings), so leaving the
 * grid's owned/wishlist/list handlers wired would fire them against whichever
 * tile was last previewed rather than the hovered row.
 */
function resetTooltipCardActions(tooltip) {
  if (!tooltip) return;
  tooltip.onNavigate = null;
  tooltip.onToggle = null;
  tooltip.onWishlistToggle = null;
  tooltip.onAddToList = null;
}

export function showStatisticsModal({
  cards = null,
  countAll = false,
  exactPrintings = false,
  title = 'Collection Statistics',
  emptyMessage = 'No owned cards have been loaded yet. Scroll to load more cards.',
} = {}) {
  const allCards = cards || cardStore.getAll();
  const countedCards = countAll ? allCards : allCards.filter(isCardOwned);

  if (countedCards.length === 0) {
    showToast(emptyMessage, 'warning');
    return;
  }

  // Completion is measured against unique card names, which is what the
  // collection UI tracks (the search's apiTotalCards counts printings).
  let stats = calculateStatistics(countedCards, allCards.length, allCards, { exactPrintings });

  // Only a whole-collection report is a meaningful progress point: a scoped
  // (binder) report would record that binder's total as the collection's, and a
  // share visitor must never record the owner's collection on their device.
  const tracksProgress = !cards && !countAll && !appState.isViewOnlyMode;
  const previousSnapshot = tracksProgress
    ? recordSnapshot({
        owned: stats.completion.owned,
        total: stats.completion.total,
        value: stats.totalValue,
        setsCompleted: stats.setsCompleted,
      })
    : null;
  const tooltip = document.getElementById('tooltip');
  // The stats preview is hover-driven; make sure it never inherits the grid's
  // swipe-navigation or card-action handlers.
  resetTooltipCardActions(tooltip);
  let cleanupTopCardTooltips = () => {};

  const shell = createModal({
    className: 'statistics-modal',
    ariaLabel: title,
    onClose: () => {
      cleanupTopCardTooltips();
      if (tooltip) {
        tooltip.onChoosePrinting = null;
        resetTooltipCardActions(tooltip);
        hideTooltip(tooltip);
      }
    },
  });
  const { modal, close } = shell;

  const header = document.createElement('div');
  header.className = 'statistics-header';

  const headerText = document.createElement('div');

  const modalHeader = document.createElement('h2');
  modalHeader.textContent = title;

  const subtitle = document.createElement('p');
  subtitle.className = 'statistics-subtitle';

  headerText.appendChild(modalHeader);
  headerText.appendChild(subtitle);

  const contentArea = document.createElement('div');
  contentArea.className = 'modal-content-area statistics-content';

  // A quick index of the sections. It is its own flex row between the (fixed)
  // header and the scrolling content, so it stays visible the whole time.
  const nav = document.createElement('nav');
  nav.className = 'stats-nav';
  nav.setAttribute('aria-label', 'Statistics sections');

  let navItems = [];

  /** Rebuild the section chips from the freshly rendered content. */
  function buildSectionNav() {
    nav.replaceChildren();
    navItems = [];

    const summary = contentArea.querySelector('.stats-summary');
    const targets = [
      summary,
      ...contentArea.querySelectorAll('.stats-section-group, .stats-section'),
    ].filter(Boolean);

    targets.forEach((target, index) => {
      if (!target.id) target.id = `stats-section-${index}`;
      const isGroup = target.classList.contains('stats-section-group');
      const title =
        target === summary
          ? 'Summary'
          : isGroup
            ? target.querySelector('.stats-group-title')?.textContent?.trim() ||
              `Section ${index + 1}`
            : target.querySelector('h3')?.firstChild?.textContent?.trim() || `Section ${index + 1}`;

      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'stats-nav-chip';
      chip.textContent = title;
      chip.addEventListener('click', () => {
        target.scrollIntoView({ block: 'start', behavior: 'smooth' });
      });
      nav.appendChild(chip);
      navItems.push({ chip, target });
    });

    syncActiveChip();
  }

  /** Highlight the chip for the section nearest the top of the viewport. */
  function syncActiveChip() {
    if (navItems.length === 0) return;
    const containerTop = contentArea.getBoundingClientRect().top;
    let active = navItems[0].chip;

    for (const item of navItems) {
      if (item.target.getBoundingClientRect().top - containerTop <= 60) active = item.chip;
    }

    for (const item of navItems) {
      const isActive = item.chip === active;
      item.chip.classList.toggle('is-active', isActive);
      if (isActive) item.chip.setAttribute('aria-current', 'location');
      else item.chip.removeAttribute('aria-current');
    }
  }

  contentArea.addEventListener('scroll', syncActiveChip, { passive: true });

  const cardsByName = new Map(allCards.map((card) => [card.name, card]));

  /** Recompute and repaint after a wishlist change. */
  function renderContent() {
    stats = calculateStatistics(countedCards, allCards.length, allCards, { exactPrintings });

    const cardWord = stats.totalCards === 1 ? 'card' : 'cards';
    const ownershipWord = countAll ? '' : 'owned ';
    const wishlistSuffix = stats.wishlist.wanted > 0 ? ` · ${stats.wishlist.wanted} wanted` : '';
    // The binder scope counts every pocket, so still report how many are owned.
    const ownedSuffix = countAll ? ` · ${allCards.filter(isCardOwned).length} owned` : '';
    subtitle.textContent = `${stats.totalCards} ${ownershipWord}${cardWord} · ${formatMoney(stats.totalValue)} total value${wishlistSuffix}${ownedSuffix}`;

    contentArea.innerHTML = createStatisticsHTML(stats, {
      extra: tracksProgress ? renderProgress(stats, previousSnapshot) : '',
    });
    buildSectionNav();
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
  copyMissingButton.textContent = `Copy all ${stats.missingCount} missing`;
  copyMissingButton.disabled = stats.missingCount === 0;
  copyMissingButton.addEventListener('click', () =>
    copyCardNames(stats.missingNames, 'missing cards')
  );

  const closeButton = document.createElement('button');
  closeButton.textContent = 'Close';
  closeButton.addEventListener('click', close);
  buttonContainer.append(copyMissingButton, closeButton);

  modal.appendChild(header);
  modal.appendChild(nav);
  modal.appendChild(contentArea);
  modal.appendChild(buttonContainer);

  shell.show();
  syncActiveChip();
  closeButton.focus();
}
