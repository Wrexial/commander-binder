import { describe, it, expect } from 'vitest';
import {
  serializeCollection,
  parseCollection,
  parseCsv,
  TRANSFER_FORMATS,
} from '../collectionFormats.js';

const cards = [
  {
    id: 'id1',
    name: 'Sol Ring',
    set: 'cmm',
    set_name: 'Commander Masters',
    collector_number: '342',
  },
  {
    id: 'id2',
    name: "Atraxa, Praetors' Voice",
    set: '2xm',
    set_name: 'Double Masters',
    collector_number: '197',
  },
];

describe('serializeCollection', () => {
  it('writes our CSV with a header and one row per card', () => {
    const lines = serializeCollection(cards, 'csv').split('\r\n');

    expect(lines[0]).toBe('Name,Set Code,Set Name,Collector Number,Quantity');
    expect(lines[1]).toBe('Sol Ring,CMM,Commander Masters,342,1');
    // A comma in the name forces it to be quoted.
    expect(lines[2]).toBe('"Atraxa, Praetors\' Voice",2XM,Double Masters,197,1');
  });

  it('writes the Moxfield columns', () => {
    const csv = serializeCollection(cards, 'moxfield');

    expect(csv.split('\r\n')[0]).toBe(
      'Count,Tradelist Count,Name,Edition,Edition Code,Collector Number,Foil,Text,Condition,Language,Metagame'
    );
    expect(csv).toContain('1,0,Sol Ring');
  });

  it('writes the Archidekt columns', () => {
    const csv = serializeCollection(cards, 'archidekt');

    expect(csv.split('\r\n')[0]).toBe(
      'Name,Quantity,Categories,Set,Collector Number,Condition,Language,Foil,Tags,Scryfall ID'
    );
    expect(csv).toContain('id1');
  });

  it('defaults to CSV', () => {
    expect(serializeCollection(cards)).toBe(serializeCollection(cards, 'csv'));
  });
});

describe('parseCollection', () => {
  it('round-trips every exported format', () => {
    for (const { id } of TRANSFER_FORMATS) {
      const { entries } = parseCollection(serializeCollection(cards, id));

      expect(entries.map((entry) => entry.name)).toEqual(['Sol Ring', "Atraxa, Praetors' Voice"]);
      expect(entries[0]).toMatchObject({ setCode: 'cmm', collectorNumber: '342' });
    }
  });

  it('reads Moxfield CSVs via header aliases', () => {
    const text = [
      'Count,Tradelist Count,Name,Edition,Edition Code,Collector Number,Foil,Text,Condition,Language,Metagame',
      '1,0,Sol Ring,Commander Masters,CMM,342,foil,,Near Mint,English,',
    ].join('\r\n');

    expect(parseCollection(text).entries).toEqual([
      { name: 'Sol Ring', count: 1, setCode: 'cmm', collectorNumber: '342', foil: true },
    ]);
  });

  it('reads Archidekt CSVs via header aliases', () => {
    const text = [
      'Name,Quantity,Categories,Set,Collector Number,Condition,Language,Foil,Tags,Scryfall ID',
      'Sol Ring,1,,CMM,342,Near Mint,English,,,id1',
    ].join('\r\n');

    expect(parseCollection(text).entries[0]).toMatchObject({
      name: 'Sol Ring',
      setCode: 'cmm',
      collectorNumber: '342',
    });
  });

  it('reads plain "1 Name (SET) 123" lists, keeping commas in names', () => {
    const { entries } = parseCollection(
      "1 Sol Ring (CMM) 342\n2 Atraxa, Praetors' Voice (2XM) 197"
    );

    expect(entries).toEqual([
      { name: 'Sol Ring', count: 1, setCode: 'cmm', collectorNumber: '342', foil: false },
      {
        name: "Atraxa, Praetors' Voice",
        count: 2,
        setCode: '2xm',
        collectorNumber: '197',
        foil: false,
      },
    ]);
  });

  it('treats headerless text as a plain name list, commas included', () => {
    const { entries } = parseCollection("Sol Ring\nAtraxa, Praetors' Voice");

    expect(entries.map((entry) => entry.name)).toEqual(['Sol Ring', "Atraxa, Praetors' Voice"]);
  });

  it('reports rows with an unusable quantity as skipped', () => {
    const { entries, skipped } = parseCollection('Name,Quantity\r\nSol Ring,0');

    expect(entries).toEqual([]);
    expect(skipped).toEqual(['Sol Ring']);
  });
});

describe('parseCsv', () => {
  it('parses quoted fields containing commas, quotes and newlines', () => {
    expect(parseCsv('"a,b","c""d","e\nf"')).toEqual([['a,b', 'c"d', 'e\nf']]);
  });
});
