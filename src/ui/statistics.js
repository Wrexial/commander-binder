import { isCardOwned } from '../state/cardState.js';
import { cardStore } from '../state/cardStore.js';
import { showToast } from './components/toast.js';
import { showTooltip, hideTooltip, positionTooltip } from './tooltip.js';
import { preloadCardImages } from '../utils/cardImages.js';

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
 * Cheapest EUR price across every known printing of a card, considering both
 * the non-foil and foil prices. Returns `null` when nothing is priced.
 *
 * @param {object} card Scryfall card object.
 * @returns {number|null}
 */
function cheapestPrice(card) {
    const prices = cardStore
        .getPrintings(card.name)
        .flatMap((printing) => [
            printing?.prices?.eur,
            printing?.prices?.eur_foil,
        ])
        .map((price) => (price == null ? null : parseFloat(price)))
        .filter((price) => Number.isFinite(price));

    return prices.length > 0 ? Math.min(...prices) : null;
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

    return sorted.length % 2 === 0
        ? (sorted[middle - 1] + sorted[middle]) / 2
        : sorted[middle];
}

/**
 * Compute the collection statistics shown in the statistics modal.
 *
 * @param {object[]} cards Owned cards to analyze.
 * @param {number} [totalAvailable] Total unique legendary creatures known to
 *   the app, used as the denominator for the completion percentage.
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
 * }}
 */
export function calculateStatistics(cards, totalAvailable = cards.length) {
    const totalCards = cards.length;
    let totalValue = 0;
    const colors = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
    const colorIdentity = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
    const colorCombinations = {};
    const types = {};
    const rarities = {};
    const pricedCards = [];
    const manaValues = [];
    const manaCurve = Object.fromEntries(
        MANA_CURVE_LABELS.map((label) => [label, 0]),
    );

    for (const card of cards) {
        const price = cheapestPrice(card);
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

        const manaValue = Number.isFinite(card.cmc)
            ? Math.max(0, Math.floor(card.cmc))
            : 0;
        manaValues.push(manaValue);
        const curveKey = manaValue >= 7 ? '7+' : String(manaValue);
        manaCurve[curveKey] += 1;
    }

    const top5ValuableCards = [...pricedCards]
        .sort((a, b) => b.price - a.price)
        .slice(0, 5);
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
        averageManaValue:
            manaValues.length > 0 ? manaSum / manaValues.length : null,
        medianManaValue: median(manaValues),
        priceBuckets,
        top5ValuableCards,
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
    return Object.entries(record).sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    );
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
            }),
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
            const ordered = [...combo].sort(
                (a, b) => COLOR_ORDER.indexOf(a) - COLOR_ORDER.indexOf(b),
            );
            const symbols = ordered.map((color) => manaSymbol(color)).join('');
            return `<span class="stats-combo">${symbols}<span class="stats-combo-count">${count}</span></span>`;
        })
        .join('');

    return section(
        'Color Combinations',
        `<div class="stats-combos">${chips}</div>`,
        `${entries.length} total`,
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
            }),
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
    const rows = shown
        .map(([type, count]) => barRow({ label: type, count, max }))
        .join('');

    return section(
        'Creature Types',
        `<div class="stats-bars">${rows}</div>`,
        `${entries.length} type${entries.length === 1 ? '' : 's'}`,
    );
}

function renderPriceDistribution(priceBuckets, medianValue) {
    const total = priceBuckets.reduce((sum, bucket) => sum + bucket.count, 0);
    if (total === 0) {
        return section(
            'Price Distribution',
            '<p class="stats-empty">No priced cards in this collection yet.</p>',
        );
    }

    const max = Math.max(...priceBuckets.map((bucket) => bucket.count));
    const rows = priceBuckets
        .map((bucket) => barRow({ label: bucket.label, count: bucket.count, max }))
        .join('');

    return section(
        'Price Distribution',
        `<div class="stats-bars">${rows}</div>`,
        `median ${formatEuro(medianValue)}`,
    );
}

function renderTopCards(cards) {
    if (cards.length === 0) {
        return section(
            'Top 5 Most Valuable Cards',
            '<p class="stats-empty">No priced cards in this collection yet.</p>',
        );
    }

    const items = cards
        .map(
            (card, index) => `
            <li class="stats-top-card">
                <span class="stats-top-rank">${index + 1}</span>
                <span class="stats-top-name" title="${card.name}">${card.name}</span>
                <span class="stats-top-price">${formatEuro(card.price)}</span>
            </li>`,
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
        event.currentTarget.removeAttribute('aria-describedby');
        hideTooltip(tooltip);
    };

    // Match the main grid: advance a row to its next printing. Right-click does
    // this on desktop; the tooltip's "Next printing" button covers touch.
    const cycleRowPrinting = (row, event) => {
        if (!row.cardData) return;

        const printings = cardStore.getPrintings(row.cardData.name);
        if (printings.length <= 1) return;

        const currentIndex = printings.findIndex(
            (printing) => printing.id === row.cardData.id,
        );
        const nextIndex = (currentIndex + 1) % printings.length;
        row.cardData = printings[nextIndex];
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
            ${renderPriceDistribution(stats.priceBuckets, stats.medianCardValue)}
        </div>
        ${renderTopCards(stats.top5ValuableCards)}
    `;
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
        showToast(
            'No owned cards have been loaded yet. Scroll to load more cards.',
            'warning',
        );
        return;
    }

    // Completion is measured against unique card names, which is what the
    // collection UI tracks (the search's apiTotalCards counts printings).
    const stats = calculateStatistics(ownedCards, allCards.length);
    const tooltip = document.getElementById('tooltip');
    let cleanupTopCardTooltips = () => {};

    const modalBackdrop = document.createElement('div');
    modalBackdrop.className = 'list-modal-backdrop';

    const modal = document.createElement('div');
    modal.className = 'list-modal statistics-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Collection Statistics');

    const header = document.createElement('div');
    header.className = 'statistics-header';

    const headerText = document.createElement('div');

    const modalHeader = document.createElement('h2');
    modalHeader.textContent = 'Collection Statistics';

    const subtitle = document.createElement('p');
    subtitle.className = 'statistics-subtitle';
    const cardWord = stats.totalCards === 1 ? 'card' : 'cards';
    subtitle.textContent = `${stats.totalCards} owned ${cardWord} · ${formatEuro(stats.totalValue)} total value`;

    headerText.appendChild(modalHeader);
    headerText.appendChild(subtitle);

    const contentArea = document.createElement('div');
    contentArea.className = 'modal-content-area statistics-content';
    contentArea.innerHTML = createStatisticsHTML(stats);

    // Hover the "most valuable cards" rows to preview the full card.
    cleanupTopCardTooltips = wireTopCardTooltips(
        contentArea,
        tooltip,
        stats.top5ValuableCards,
    );

    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'modal-button-container';

    const close = () => {
        cleanupTopCardTooltips();
        if (tooltip) hideTooltip(tooltip);
        document.removeEventListener('keydown', onKeyDown);
        modalBackdrop.remove();
    };

    const onKeyDown = (event) => {
        if (event.key === 'Escape') close();
    };

    const closeIcon = document.createElement('button');
    closeIcon.type = 'button';
    closeIcon.className = 'statistics-close';
    closeIcon.setAttribute('aria-label', 'Close statistics');
    closeIcon.innerHTML = '&times;';
    closeIcon.addEventListener('click', close);

    header.appendChild(headerText);
    header.appendChild(closeIcon);

    const closeButton = document.createElement('button');
    closeButton.textContent = 'Close';
    closeButton.addEventListener('click', close);
    buttonContainer.appendChild(closeButton);

    modal.appendChild(header);
    modal.appendChild(contentArea);
    modal.appendChild(buttonContainer);
    modalBackdrop.appendChild(modal);
    document.body.appendChild(modalBackdrop);

    modalBackdrop.addEventListener('click', (event) => {
        if (event.target === modalBackdrop) close();
    });
    document.addEventListener('keydown', onKeyDown);

    closeButton.focus();
}
