#!/usr/bin/env node
/**
 * Sanity-check that Scryfall's `default_cards` bulk file covers everything the
 * `type:legendary type:creature` search returns — i.e. that the app can replace
 * its ~72 paginated search requests with a single bulk download.
 *
 * Run:  node scripts/verify-bulk-coverage.mjs
 *
 * Exit code is non-zero when any search result is missing from the bulk subset,
 * so it can be wired into CI or run before shipping.
 */

import { getLegendaryCreatures } from '../src/api/bulkData.js';

const SEARCH_URL =
  'https://api.scryfall.com/cards/search?q=type:legendary type:creature&unique=prints&order=released&dir=asc';

const ACCEPT = {
  Accept: 'application/json',
  'User-Agent': 'ScryfallCollectionTracker/1.0',
};

async function fetchApiSearchSet() {
  const cards = new Map();
  let url = SEARCH_URL;
  let pages = 0;

  while (url) {
    pages += 1;
    const res = await fetch(url, { headers: ACCEPT });
    if (!res.ok) throw new Error(`Search page ${pages} failed: HTTP ${res.status}`);

    const data = await res.json();
    for (const card of data.data) {
      if (Array.isArray(card.games) && card.games.includes('paper')) {
        cards.set(card.id, card);
      }
    }
    url = data.has_more ? data.next_page : null;

    // Stay well under Scryfall's search rate limit.
    if (url) await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return { cards, pages };
}

const { cards: bulkCards, updatedAt } = await getLegendaryCreatures();
const bulkIds = new Set(bulkCards.map((card) => card.id));
console.log(`bulk data (updated ${updatedAt}): ${bulkIds.size} legendary creatures`);

const { cards: apiCards, pages } = await fetchApiSearchSet();
console.log(`search API: ${apiCards.size} paper legendary creatures across ${pages} pages`);

const missing = [...apiCards.keys()].filter((id) => !bulkIds.has(id));
const extra = [...bulkIds].filter((id) => !apiCards.has(id));

console.log(`missing from bulk: ${missing.length}`);
console.log(`bulk-only extras:  ${extra.length}`);

for (const id of missing.slice(0, 25)) {
  const card = apiCards.get(id);
  console.log(`  MISSING  ${card.set}  ${card.name}  (${card.layout}, ${card.set_type})`);
}
for (const id of extra.slice(0, 10)) {
  console.log(`  EXTRA    ${id}`);
}

if (missing.length > 0) {
  console.error('\nFAIL: bulk data does not cover every search result.');
  process.exitCode = 1;
} else {
  console.log('\nOK: every search result exists in the bulk data.');
}
