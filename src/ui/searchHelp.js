// src/ui/searchHelp.js

/**
 * The documented search syntax, grouped the way people actually search.
 *
 * This lives in JS rather than in index.html so the sheet and the test that
 * checks every example against `parseQuery` cannot drift apart.
 *
 * @typedef {{key: string, label: string, example: string}} SyntaxEntry
 * @typedef {{title: string, entries: SyntaxEntry[]}} SyntaxGroup
 */

/** @type {SyntaxGroup[]} */
export const SEARCH_SYNTAX_GROUPS = [
  {
    title: 'Card',
    entries: [
      { key: 't:', label: 'Type line', example: 't:dragon' },
      { key: 'o:', label: 'Rules text — quote multi-word phrases', example: 'o:"draw a card"' },
      { key: 's:', label: 'Set code or set name', example: 's:dom' },
      { key: 'r:', label: 'Rarity', example: 'r:mythic' },
    ],
  },
  {
    title: 'Colours',
    entries: [
      { key: 'c:', label: 'Exactly these colours', example: 'c:wug' },
      { key: 'c>', label: 'Includes these colours', example: 'c>wg' },
      { key: 'c<', label: 'Only these colours', example: 'c<wug' },
    ],
  },
  {
    title: 'Date & price',
    entries: [
      { key: 'd:', label: 'Release year, or a year range', example: 'd:2018-2020' },
      { key: 'price:', label: 'Price in € — a minimum, or a range', example: 'price:1.50-20' },
    ],
  },
  {
    title: 'Collection',
    entries: [
      { key: 'is:', label: 'Cards you marked as owned', example: 'is:owned' },
      { key: 'is:', label: 'Cards you have not marked', example: 'is:missing' },
      { key: 'is:', label: 'Cards on your wishlist', example: 'is:wanted' },
      { key: 'is:', label: 'Added in the last 30 days', example: 'is:new' },
      { key: 'is:', label: 'Cards on any of your lists', example: 'is:listed' },
      { key: 'list:', label: 'Cards on a named list', example: 'list:"Trade pile"' },
      { key: 'is:', label: 'Multicoloured cards', example: 'is:multicolor' },
      { key: 'is:', label: 'Colourless cards', example: 'is:colorless' },
      { key: 'is:', label: 'Double-faced cards', example: 'is:dfc' },
    ],
  },
  {
    title: 'Combining',
    entries: [
      { key: '!', label: 'Exclude a filter', example: '!t:goblin' },
      { key: 'and', label: 'Both must match', example: 't:elf and c:g' },
      { key: 'or', label: 'Either can match', example: 'c:wu or c:bg' },
      { key: '( )', label: 'Group terms together', example: '(t:elf or t:goblin) and c:g' },
    ],
  },
];

/** Filter prefixes `cardMatchesFilter` understands, for the docs/parser test. */
export const SUPPORTED_FILTER_PREFIXES = [
  't:',
  'o:',
  'c:',
  'c=',
  'c<',
  'c>',
  's:',
  'd:',
  'r:',
  'is:',
  'list:',
  'price:',
];

function createCode(text, className) {
  const code = document.createElement('code');
  code.className = className;
  code.textContent = text;
  return code;
}

/**
 * Render the syntax reference into `container`, replacing anything inside it.
 *
 * @param {HTMLElement} container
 * @returns {void}
 */
export function renderSearchHelp(container) {
  container.textContent = '';

  const header = document.createElement('div');
  header.className = 'search-help-header';

  const title = document.createElement('h4');
  title.className = 'search-help-title';
  title.textContent = 'Search syntax';
  header.appendChild(title);

  const hint = document.createElement('p');
  hint.className = 'search-help-hint';
  hint.append('Plain words match the card name, e.g. ');
  hint.appendChild(createCode('atraxa', 'search-help-inline'));
  hint.append('. Press ');
  hint.appendChild(createCode('/', 'search-help-inline'));
  hint.append(' to jump to the search box.');
  header.appendChild(hint);

  container.appendChild(header);

  for (const group of SEARCH_SYNTAX_GROUPS) {
    const section = document.createElement('section');
    section.className = 'search-help-group';

    const heading = document.createElement('h5');
    heading.className = 'search-help-group-title';
    heading.textContent = group.title;
    section.appendChild(heading);

    const rows = document.createElement('dl');
    rows.className = 'search-help-rows';

    for (const entry of group.entries) {
      const row = document.createElement('div');
      row.className = 'search-help-row';

      const key = document.createElement('dt');
      key.appendChild(createCode(entry.key, 'search-help-key'));
      row.appendChild(key);

      const label = document.createElement('dd');
      label.className = 'search-help-label';
      label.append(entry.label);
      // The key often is the example (`c>wg`); only show both when they differ.
      if (entry.example !== entry.key) {
        label.appendChild(createCode(entry.example, 'search-help-example'));
      }
      row.appendChild(label);

      rows.appendChild(row);
    }

    section.appendChild(rows);
    container.appendChild(section);
  }

  const footer = document.createElement('p');
  footer.className = 'search-help-footer';
  footer.textContent = 'Tap anywhere to close';
  container.appendChild(footer);
}
