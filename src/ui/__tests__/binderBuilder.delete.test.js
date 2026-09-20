import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

/** In-memory stand-in for the IndexedDB-backed local binder store. */
const local = vi.hoisted(() => ({ records: [] }));

vi.mock('../../state/localBinders.js', () => ({
  loadLocalBinders: vi.fn(async () => local.records),
  saveLocalBinder: vi.fn(async (binder) => {
    const index = local.records.findIndex((record) => record.id === binder.id);
    if (index >= 0) local.records[index] = binder;
    else local.records.push(binder);
    return true;
  }),
  removeLocalBinder: vi.fn(async (id) => {
    local.records = local.records.filter((record) => record.id !== id);
    return true;
  }),
  clearLocalBinders: vi.fn(async () => {
    local.records = [];
  }),
}));

vi.mock('../../state/cardSettings.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getSetting: vi.fn((key) => ({ gridColumns: 3, gridRows: 3, pagesPerBinder: 2 })[key]),
}));

vi.mock('../cards.js', () => ({
  createCardElement: vi.fn(() => document.createElement('div')),
  updateCardState: vi.fn(),
}));
vi.mock('../components/toast.js', () => ({ showToast: vi.fn() }));
vi.mock('../components/cardPickerModal.js', () => ({ createCardPickerModal: vi.fn() }));
vi.mock('../components/printingPickerModal.js', () => ({ createPrintingPickerModal: vi.fn() }));
vi.mock('../components/confirmDialog.js', () => ({
  // Default to confirming; the dismissal test overrides this per-call.
  confirmDialog: vi.fn(async () => true),
}));
vi.mock('../../api/cardSearch.js', () => ({
  ensurePrintingsLoaded: vi.fn(),
  hydrateCardsByIds: vi.fn(),
}));

import { loadBinders, createBinder, getActiveBinder } from '../../state/bindersState.js';
import { initBinderBuilder, teardownBinderBuilder } from '../binderBuilder.js';
import { showToast } from '../components/toast.js';
import { confirmDialog } from '../components/confirmDialog.js';

const tabLabels = () => [...document.querySelectorAll('.binder-tab')].map((tab) => tab.textContent);
const activeTabLabel = () => document.querySelector('.binder-tab.is-active')?.textContent;
const clickTab = (label) =>
  [...document.querySelectorAll('.binder-tab')].find((tab) => tab.textContent === label).click();

beforeEach(() => {
  local.records = [];
  localStorage.clear();
  document.body.innerHTML = '<div id="binder-root"></div><div id="toast"></div>';
  vi.clearAllMocks();
});

afterEach(() => teardownBinderBuilder());

/** Seed three binders and mount the editor. */
async function mountThree() {
  await loadBinders();
  await createBinder({ name: 'Binder 2' });
  await createBinder({ name: 'Binder 3' });
  await initBinderBuilder(document.getElementById('binder-root'));
}

describe('binderBuilder delete', () => {
  it('deletes the binder shown as active and moves to the next one', async () => {
    await mountThree();

    clickTab('Binder 2');
    expect(activeTabLabel()).toBe('Binder 2');

    document.querySelector('.bb-delete').click();

    await vi.waitFor(() => expect(tabLabels()).toEqual(['Binder 1', 'Binder 3']));
    expect(activeTabLabel()).toBe('Binder 3');
    expect(getActiveBinder().name).toBe('Binder 3');
    expect(document.querySelector('.bb-name').value).toBe('Binder 3');
    expect(showToast).toHaveBeenCalledWith('Deleted “Binder 2”.', 'success');
  });

  it('falls back to the previous binder when the active last one is deleted', async () => {
    await mountThree();

    clickTab('Binder 3');
    document.querySelector('.bb-delete').click();

    await vi.waitFor(() => expect(tabLabels()).toEqual(['Binder 1', 'Binder 2']));
    expect(activeTabLabel()).toBe('Binder 2');
  });

  it('does not delete when the confirmation is dismissed', async () => {
    await mountThree();
    confirmDialog.mockResolvedValueOnce(false);

    document.querySelector('.bb-delete').click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(tabLabels()).toEqual(['Binder 1', 'Binder 2', 'Binder 3']);
    expect(showToast).not.toHaveBeenCalled();
  });
});
