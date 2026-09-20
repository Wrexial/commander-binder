import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../toast.js', () => ({ showToast: vi.fn() }));

import { createExportModal } from '../exportModal.js';
import { analyzeA11y } from '../../../__tests__/helpers/a11y.js';
import { showToast } from '../toast.js';

const cards = [
  {
    id: 'a',
    name: 'Sol Ring',
    set: 'cmm',
    set_name: 'Commander Masters',
    collector_number: '342',
  },
  {
    id: 'b',
    name: 'Arcane Signet',
    set: 'eld',
    set_name: 'Throne of Eldraine',
    collector_number: '331',
  },
];

const ownedCollection = (ownedCards) => ({
  id: 'owned',
  label: 'Collection',
  cards: ownedCards,
  filePrefix: 'owned-cards',
  noun: 'owned',
  emptyMessage: 'You don’t own any cards yet.',
});

const wishlistCollection = (wantedCards) => ({
  id: 'wishlist',
  label: 'Wishlist',
  cards: wantedCards,
  filePrefix: 'wishlist',
  noun: 'wanted',
  emptyMessage: 'Your wishlist is empty.',
});

const listCollection = (listCards) => ({
  id: 'L1',
  label: 'Trade pile',
  cards: listCards,
  filePrefix: 'list-trade-pile',
  noun: 'list',
  emptyMessage: '“Trade pile” has no cards yet.',
});

/** Open the modal with an owned collection, plus a wishlist one when given. */
function open(ownedCards, wantedCards) {
  const collections = [ownedCollection(ownedCards)];
  if (wantedCards) collections.push(wishlistCollection(wantedCards));
  return createExportModal({ collections });
}

/** The target-picker button with the given label. */
function target(label) {
  return [...document.querySelectorAll('.target-toggle-option')].find(
    (button) => button.textContent === label
  );
}

beforeEach(() => {
  document.body.innerHTML = '';
  showToast.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('exportModal', () => {
  it('lists the names sorted and copies the serialized CSV', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });

    const modal = open(cards);
    modal.show();

    const rows = [...document.querySelectorAll('.bulk-row')].map((row) => row.textContent);
    expect(rows).toEqual(['Arcane Signet', 'Sol Ring']);

    document.querySelector('.export-copy').click();
    await Promise.resolve();
    await Promise.resolve();

    expect(writeText).toHaveBeenCalledTimes(1);
    const csv = writeText.mock.calls[0][0];
    expect(csv.split('\r\n')[0]).toBe('Name,Set Code,Set Name,Collector Number,Quantity');
    expect(csv).toContain('Sol Ring');
    expect(csv).toContain('Arcane Signet');
    expect(showToast).toHaveBeenCalledWith('Copied 2 cards.', 'success');
  });

  it('copies whichever format is selected', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });

    const modal = open(cards);
    modal.show();

    const select = document.querySelector('.transfer-format');
    select.value = 'moxfield';
    select.dispatchEvent(new Event('change'));

    document.querySelector('.export-copy').click();
    await Promise.resolve();
    await Promise.resolve();

    expect(writeText.mock.calls[0][0]).toContain('Tradelist Count');
  });

  it('filters the visible list and the export together', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });

    const modal = open([...cards, { id: 'c', name: 'Mana Crypt' }]);
    modal.show();

    const input = document.querySelector('.bulk-search-input');
    input.value = 'arcane';
    input.dispatchEvent(new Event('input'));

    expect([...document.querySelectorAll('.bulk-row')].map((row) => row.textContent)).toEqual([
      'Arcane Signet',
    ]);
    expect(document.querySelector('.export-copy').textContent).toBe('Copy 1 card');

    document.querySelector('.export-copy').click();
    await Promise.resolve();
    await Promise.resolve();

    expect(writeText.mock.calls[0][0]).toContain('Arcane Signet');
    expect(writeText.mock.calls[0][0]).not.toContain('Sol Ring');
    expect(showToast).toHaveBeenCalledWith('Copied 1 card.', 'success');
  });

  it('shows an empty state and disables the actions when there is nothing to export', () => {
    const modal = open([]);
    modal.show();

    expect(document.querySelector('.bulk-empty')).not.toBeNull();
    expect(document.querySelector('.export-copy').disabled).toBe(true);
    expect(document.querySelector('.export-download').disabled).toBe(true);
  });

  it('switches the labels and empty message to the selected collection', () => {
    const modal = open([], []);
    modal.show();
    expect(document.querySelector('.bulk-search-input').placeholder).toBe('Filter owned cards…');

    target('Wishlist').click();

    expect(document.querySelector('.bulk-search-input').placeholder).toBe('Filter wanted cards…');
    expect(document.querySelector('.bulk-empty').textContent).toBe('Your wishlist is empty.');
  });

  it('exports only the cards of the selected collection', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });

    const modal = open(cards, [{ id: 'w', name: 'Wanted Card', set: 'neo' }]);
    modal.show();

    target('Wishlist').click();
    document.querySelector('.export-copy').click();
    await Promise.resolve();
    await Promise.resolve();

    expect(writeText.mock.calls[0][0]).toContain('Wanted Card');
    expect(writeText.mock.calls[0][0]).not.toContain('Sol Ring');
  });

  it('exports a custom list like any other collection', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });

    const modal = createExportModal({
      collections: [
        ownedCollection(cards),
        listCollection([{ id: 'x', name: 'List Card', set: 'neo', collector_number: '1' }]),
      ],
    });
    modal.show();

    target('Trade pile').click();
    expect(document.querySelector('.bulk-search-input').placeholder).toBe('Filter list cards…');

    document.querySelector('.export-copy').click();
    await Promise.resolve();
    await Promise.resolve();

    expect(writeText.mock.calls[0][0]).toContain('List Card');
    expect(writeText.mock.calls[0][0]).not.toContain('Sol Ring');
  });

  it('names the downloaded file after the active collection prefix', () => {
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();
    let downloaded;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      downloaded = this.download;
    });

    const modal = open(cards, [cards[0]]);
    modal.show();

    target('Wishlist').click();
    document.querySelector('.export-download').click();

    expect(downloaded).toBe('wishlist.csv');
  });

  it('downloads the selected format as a .csv file', () => {
    const createObjectURL = vi.fn(() => 'blob:mock');
    const revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const modal = open([cards[0]]);
    modal.show();

    const select = document.querySelector('.transfer-format');
    select.value = 'archidekt';
    select.dispatchEvent(new Event('change'));

    document.querySelector('.export-download').click();

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith('Downloaded 1 card.', 'success');
  });

  it('closes on Escape', () => {
    const modal = open([cards[0]]);
    modal.show();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(document.querySelector('.list-modal-backdrop')).toBeNull();
  });

  it('opens on the requested collection (e.g. the visible binder)', () => {
    const collections = [ownedCollection(cards), listCollection([cards[0]])];

    createExportModal({ collections, initialId: 'L1' }).show();

    const active = document.querySelector('.target-toggle-option[aria-pressed="true"]');
    expect(active.textContent).toBe('Trade pile');
  });

  it('has no accessibility violations', async () => {
    open(cards).show();
    const { violations, summary } = await analyzeA11y(document.body);
    expect(violations.length, summary).toBe(0);
  });
});
