import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPrintingPickerModal } from '../printingPickerModal.js';

const card = { id: 'c', name: 'Sol Ring' };
const printings = [
  {
    id: 'p1',
    name: 'Sol Ring',
    set: 'lea',
    set_name: 'Limited Edition Alpha',
    collector_number: '1',
    released_at: '1993-08-05',
    prices: { eur: '100.00' },
    image_uris: { thumb: 'https://img/p1.jpg' },
  },
  {
    id: 'p2',
    name: 'Sol Ring',
    set: 'cmm',
    set_name: 'Commander Masters',
    collector_number: '342',
    released_at: '2023-08-04',
    prices: { eur: '1.20' },
    image_uris: { thumb: 'https://img/p2.jpg' },
  },
];

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('printingPickerModal', () => {
  it('lists every printing with set, number, year and thumbnail', () => {
    const picker = createPrintingPickerModal({ card, printings, currentId: 'p1', onPick: vi.fn() });
    picker.show();

    const rows = document.querySelectorAll('.printing-picker-row');
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector('.printing-picker-set').textContent).toBe(
      'LEA · Limited Edition Alpha'
    );
    expect(rows[0].querySelector('.printing-picker-thumb img').getAttribute('src')).toBe(
      'https://img/p1.jpg'
    );

    const meta = rows[1].querySelector('.printing-picker-meta').textContent;
    expect(meta).toContain('#342');
    expect(meta).toContain('2023');

    // The pocket's current printing is marked.
    expect(rows[0].classList.contains('is-current')).toBe(true);
    expect(rows[0].querySelector('.printing-picker-check').textContent).toBe('✓');
    expect(rows[1].classList.contains('is-current')).toBe(false);
  });

  it('reports the chosen printing and closes the modal', () => {
    const onPick = vi.fn();
    const picker = createPrintingPickerModal({ card, printings, currentId: 'p1', onPick });
    picker.show();

    document.querySelectorAll('.printing-picker-row')[1].click();

    expect(onPick).toHaveBeenCalledWith(printings[1]);
    expect(document.querySelector('.list-modal-backdrop')).toBeNull();
  });

  it('filters printings by set code or set name', () => {
    const picker = createPrintingPickerModal({ card, printings, currentId: 'p1', onPick: vi.fn() });
    picker.show();

    const input = document.querySelector('.printing-picker-search');
    const filter = (value) => {
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };

    filter('cmm');
    let rows = document.querySelectorAll('.printing-picker-row');
    expect(rows).toHaveLength(1);
    expect(rows[0].querySelector('.printing-picker-set').textContent).toContain(
      'Commander Masters'
    );

    filter('limited edition');
    rows = document.querySelectorAll('.printing-picker-row');
    expect(rows).toHaveLength(1);
    expect(rows[0].querySelector('.printing-picker-set').textContent).toContain(
      'Limited Edition Alpha'
    );

    filter('commander 342');
    expect(document.querySelectorAll('.printing-picker-row')).toHaveLength(1);

    filter('nope');
    expect(document.querySelector('.printing-picker-empty')).not.toBeNull();

    filter('');
    expect(document.querySelectorAll('.printing-picker-row')).toHaveLength(2);
  });
});
