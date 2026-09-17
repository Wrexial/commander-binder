import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../toast.js', () => ({ showToast: vi.fn() }));

import { createExportModal } from '../exportModal.js';
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

    const modal = createExportModal(cards);
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

    const modal = createExportModal(cards);
    modal.show();

    const select = document.querySelector('.transfer-format');
    select.value = 'moxfield';
    select.dispatchEvent(new Event('change'));

    document.querySelector('.export-copy').click();
    await Promise.resolve();
    await Promise.resolve();

    expect(writeText.mock.calls[0][0]).toContain('Tradelist Count');
  });

  it('filters the visible list while keeping the total', () => {
    const modal = createExportModal([...cards, { id: 'c', name: 'Mana Crypt' }]);
    modal.show();

    const input = document.querySelector('.bulk-search-input');
    input.value = 'arcane';
    input.dispatchEvent(new Event('input'));

    expect([...document.querySelectorAll('.bulk-row')].map((row) => row.textContent)).toEqual([
      'Arcane Signet',
    ]);
    expect(document.querySelector('.export-copy').textContent).toBe('Copy all 3 cards');
  });

  it('shows an empty state and disables the actions when there is nothing to export', () => {
    const modal = createExportModal([]);
    modal.show();

    expect(document.querySelector('.bulk-empty')).not.toBeNull();
    expect(document.querySelector('.export-copy').disabled).toBe(true);
    expect(document.querySelector('.export-download').disabled).toBe(true);
  });

  it('downloads the selected format as a .csv file', () => {
    const createObjectURL = vi.fn(() => 'blob:mock');
    const revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const modal = createExportModal([cards[0]]);
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
    const modal = createExportModal([cards[0]]);
    modal.show();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(document.querySelector('.list-modal-backdrop')).toBeNull();
  });
});
