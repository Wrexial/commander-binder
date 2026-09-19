// src/utils/collectionFormats.js
/**
 * Serialize and parse collection files for the import/export modal.
 *
 * Every format is CSV on disk; only the column set differs:
 *  - `csv`       a small, round-trippable CSV of our own
 *  - `moxfield`  Moxfield's export columns
 *  - `archidekt` Archidekt's export columns
 *
 * Parsing is header-driven and accepts column aliases, so a file exported by
 * any of the three sites (or by us) reads back correctly. `name` is the only
 * required column; set code + collector number pin an exact printing when
 * present. Both sites also export plain "1 Card Name (SET) 123" lists, which are
 * detected and parsed too.
 */

/** Formats offered by the export picker, in display order. */
export const TRANSFER_FORMATS = [
  { id: 'csv', label: 'CSV' },
  { id: 'moxfield', label: 'Moxfield' },
  { id: 'archidekt', label: 'Archidekt' },
  { id: 'arena', label: 'MTG Arena' },
  { id: 'mtgo', label: 'MTGO' },
  { id: 'plain', label: 'Plain text' },
];

/** Formats that serialize to plain text rather than CSV. */
export const TEXT_TRANSFER_FORMATS = new Set(['arena', 'mtgo', 'plain']);

export const DEFAULT_TRANSFER_FORMAT = 'csv';

/** Quote a field when it contains a comma, quote, or line break (RFC 4180). */
function csvField(value) {
  const text = value == null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(rows) {
  return rows.map((row) => row.map(csvField).join(',')).join('\r\n');
}

/** Split CSV text into rows of cells, honouring quoted fields. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }

  row.push(field);
  rows.push(row);
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''));
}

const COLUMN_ALIASES = {
  name: ['name', 'card name', 'cardname', 'card'],
  count: ['count', 'quantity', 'qty', 'amount'],
  setCode: ['set code', 'setcode', 'set', 'edition code', 'editioncode', 'expansion code'],
  collectorNumber: [
    'collector number',
    'collector no',
    'collector no.',
    'number',
    'card number',
    'card no',
    'card no.',
  ],
  foil: ['foil', 'finish', 'foiling'],
};

function normalizeHeader(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, ' ');
}

function columnIndex(headers, field) {
  for (const alias of COLUMN_ALIASES[field]) {
    const index = headers.indexOf(alias);
    if (index !== -1) return index;
  }
  return -1;
}

/** Turn CSV data rows into normalized entries using a column map. */
function parseRowList(rows, columns) {
  const entries = [];
  const skipped = [];

  for (const row of rows) {
    const name = (row[columns.name] ?? '').trim();
    if (!name) continue;

    let count = 1;
    if (columns.count >= 0) {
      const parsed = Number.parseInt(row[columns.count], 10);
      if (Number.isNaN(parsed) || parsed < 1) {
        skipped.push(name);
        continue;
      }
      count = parsed;
    }

    entries.push({
      name,
      count,
      setCode: columns.setCode >= 0 ? (row[columns.setCode] ?? '').trim().toLowerCase() : '',
      collectorNumber:
        columns.collectorNumber >= 0 ? (row[columns.collectorNumber] ?? '').trim() : '',
      foil: columns.foil >= 0 ? /foil|true|yes/i.test(row[columns.foil] ?? '') : false,
    });
  }

  return { entries, skipped };
}

// "[1 ][x ]Card Name [(SET) 123]" — the shared Moxfield/Archidekt text export.
const PLAIN_LINE = /^(?:(\d+)\s*[xX]?\s+)?(.+?)(?:\s*\(([A-Za-z0-9]{2,6})\)\s*(\S+))?$/;

function parsePlainList(lines) {
  const entries = [];
  const skipped = [];

  for (const line of lines) {
    const match = PLAIN_LINE.exec(line);
    const count = match?.[1] ? Number.parseInt(match[1], 10) : 1;
    const name = (match?.[2] ?? '').trim();

    if (!match || !name || Number.isNaN(count) || count < 1) {
      skipped.push(line);
      continue;
    }

    entries.push({
      name,
      count,
      setCode: (match[3] ?? '').toLowerCase(),
      collectorNumber: match[4] ?? '',
      foil: false,
      // The pasted line verbatim, so a caller can prefer it over the
      // quantity-stripped name (e.g. a card literally named "1996 World
      // Champion").
      raw: line,
    });
  }

  return { entries, skipped };
}

/**
 * Parse pasted/imported text from any supported source.
 *
 * @param {string} text
 * @returns {{ entries: {name: string, count: number, setCode: string, collectorNumber: string, foil: boolean, raw?: string}[], skipped: string[] }}
 */
export function parseCollection(text) {
  const source = String(text ?? '');
  const rows = parseCsv(source);
  if (rows.length === 0) return { entries: [], skipped: [] };

  const headers = rows[0].map(normalizeHeader);
  const nameIndex = columnIndex(headers, 'name');

  if (nameIndex !== -1) {
    return parseRowList(rows.slice(1), {
      name: nameIndex,
      count: columnIndex(headers, 'count'),
      setCode: columnIndex(headers, 'setCode'),
      collectorNumber: columnIndex(headers, 'collectorNumber'),
      foil: columnIndex(headers, 'foil'),
    });
  }

  // No recognizable header: treat the input as a plain list of card names. All
  // three supported CSV formats always carry a header, and a name may itself
  // contain a comma ("Atraxa, Praetors' Voice"), so the whole line is the name.
  const lines = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return parsePlainList(lines);
}

const CSV_HEADERS = ['Name', 'Set Code', 'Set Name', 'Collector Number', 'Quantity'];
const MOXFIELD_HEADERS = [
  'Count',
  'Tradelist Count',
  'Name',
  'Edition',
  'Edition Code',
  'Collector Number',
  'Foil',
  'Text',
  'Condition',
  'Language',
  'Metagame',
];
const ARCHIDEKT_HEADERS = [
  'Name',
  'Quantity',
  'Categories',
  'Set',
  'Collector Number',
  'Condition',
  'Language',
  'Foil',
  'Tags',
  'Scryfall ID',
];

function setCode(card) {
  return (card.set || '').toUpperCase();
}

function serializeCsv(cards) {
  return toCsv([
    CSV_HEADERS,
    ...cards.map((card) => [
      card.name,
      setCode(card),
      card.set_name || '',
      card.collector_number || '',
      1,
    ]),
  ]);
}

function serializeMoxfield(cards) {
  return toCsv([
    MOXFIELD_HEADERS,
    ...cards.map((card) => [
      1,
      0,
      card.name,
      card.set_name || '',
      setCode(card),
      card.collector_number || '',
      '',
      '',
      'Near Mint',
      'English',
      '',
    ]),
  ]);
}

function serializeArchidekt(cards) {
  return toCsv([
    ARCHIDEKT_HEADERS,
    ...cards.map((card) => [
      card.name,
      1,
      '',
      setCode(card),
      card.collector_number || '',
      'Near Mint',
      'English',
      '',
      '',
      card.id || '',
    ]),
  ]);
}

/**
 * MTG Arena import format: "1 Card Name (SET) 123". A blank collector number
 * leaves just "1 Card Name (SET)", which Arena still accepts.
 */
function serializeArena(cards) {
  return cards
    .map(
      (card) =>
        `1 ${card.name} (${setCode(card)})${card.collector_number ? ` ${card.collector_number}` : ''}`
    )
    .join('\n');
}

/** MTGO text decklist: "1 Card Name" (MTGO ignores the set). */
function serializeMtgo(cards) {
  return cards.map((card) => `1 ${card.name}`).join('\n');
}

/** Bare names, one per line — feeds straight into the Add Cards / Bulk Check box. */
function serializePlain(cards) {
  return cards.map((card) => card.name).join('\n');
}

/**
 * Serialize owned cards in the requested format.
 *
 * @param {object[]} cards Scryfall card objects (one per owned card).
 * @param {string} format One of {@link TRANSFER_FORMATS}.
 * @returns {string}
 */
export function serializeCollection(cards, format = DEFAULT_TRANSFER_FORMAT) {
  switch (format) {
    case 'moxfield':
      return serializeMoxfield(cards);
    case 'archidekt':
      return serializeArchidekt(cards);
    case 'arena':
      return serializeArena(cards);
    case 'mtgo':
      return serializeMtgo(cards);
    case 'plain':
      return serializePlain(cards);
    case 'csv':
    default:
      return serializeCsv(cards);
  }
}
