import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../tooltip.js', () => ({
  showTooltip: vi.fn(),
  hideTooltip: vi.fn(),
  positionTooltip: vi.fn(),
}));
vi.mock('../../../utils/pointer.js', () => ({ isHoverCapable: vi.fn(() => true) }));
vi.mock('../../../utils/cardImages.js', () => ({ preloadCardImages: vi.fn() }));
vi.mock('../../../state/cardStore.js', () => ({
  cardStore: {
    getByPrintingId: vi.fn((id) => (id === 'a' ? { id: 'a', name: 'Alpha' } : null)),
    getOldestPrinting: vi.fn((name) => (name === 'Beta' ? { id: 'b', name: 'Beta' } : null)),
  },
}));

import { attachCardPreview, hideCardPreview } from '../cardPreview.js';
import { showTooltip, hideTooltip } from '../../tooltip.js';
import { isHoverCapable } from '../../../utils/pointer.js';

function mountRows() {
  document.body.innerHTML = '<div id="tooltip"></div><ul id="list"></ul>';
  const list = document.getElementById('list');
  list.innerHTML = `
    <li data-card-preview data-card-id="a">Alpha</li>
    <li data-card-preview data-card-name="Beta">Beta</li>
    <li data-card-preview data-card-id="ghost">Ghost</li>`;
  attachCardPreview(list);
  return list;
}

beforeEach(() => {
  vi.clearAllMocks();
  isHoverCapable.mockReturnValue(true);
});

afterEach(() => {
  hideCardPreview();
  document.body.innerHTML = '';
});

describe('attachCardPreview', () => {
  it('opens the floating preview on hover and makes it read-only', () => {
    const list = mountRows();
    const tooltip = document.getElementById('tooltip');
    tooltip.onToggle = () => {};
    tooltip.onCycle = () => {};

    list
      .querySelector('[data-card-id="a"]')
      .dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: 5, clientY: 6 }));

    expect(showTooltip).toHaveBeenCalledTimes(1);
    expect(tooltip.onToggle).toBeNull();
    expect(tooltip.onCycle).toBeNull();
    expect(tooltip.onNavigate).toBeNull();
  });

  it('resolves a row by name when it has no printing id', () => {
    const list = mountRows();

    list
      .querySelector('[data-card-name="Beta"]')
      .dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    expect(showTooltip).toHaveBeenCalledTimes(1);
    expect(showTooltip.mock.calls[0][1]).toMatchObject({ name: 'Beta' });
  });

  it('ignores rows whose card is not loaded', () => {
    const list = mountRows();

    list
      .querySelector('[data-card-id="ghost"]')
      .dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    expect(showTooltip).not.toHaveBeenCalled();
  });

  it('hides the preview when the pointer leaves the row', () => {
    const list = mountRows();
    const row = list.querySelector('[data-card-id="a"]');

    row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    row.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));

    expect(hideTooltip).toHaveBeenCalled();
  });

  it('opens the full-screen preview on tap for touch devices', () => {
    isHoverCapable.mockReturnValue(false);
    const list = mountRows();

    list
      .querySelector('[data-card-id="a"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(showTooltip).toHaveBeenCalledTimes(1);
    expect(showTooltip.mock.calls[0][3]).toEqual({ modal: true });
  });

  it('does not open a tap preview from a control inside the row', () => {
    isHoverCapable.mockReturnValue(false);
    const list = mountRows();
    const row = list.querySelector('[data-card-id="a"]');
    const button = document.createElement('button');
    row.appendChild(button);

    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(showTooltip).not.toHaveBeenCalled();
  });
});

describe('hideCardPreview', () => {
  it('tears the shared tooltip down after a preview has opened', () => {
    const list = mountRows();
    list
      .querySelector('[data-card-id="a"]')
      .dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    hideCardPreview();

    expect(hideTooltip).toHaveBeenCalled();
  });

  it('does nothing when no preview is active', () => {
    document.body.innerHTML = '<div id="tooltip"></div>';
    hideCardPreview();
    expect(hideTooltip).not.toHaveBeenCalled();
  });
});
