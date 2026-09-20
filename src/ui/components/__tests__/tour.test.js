import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../state/onboarding.js', () => ({
  isTourDone: vi.fn(() => false),
  markTourDone: vi.fn(),
}));

import { startTour, startFirstRunTour } from '../tour.js';
import { isTourDone, markTourDone } from '../../../state/onboarding.js';

const anchor = () => document.getElementById('anchor');
const popoverText = () => document.querySelector('.tour-popover')?.textContent || '';

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '<div id="anchor"></div>';
  isTourDone.mockReturnValue(false);
});

afterEach(() => {
  // Tear down any tour a test left running so its document listeners don't leak.
  startTour([]);
  document.body.innerHTML = '';
});

describe('startTour', () => {
  it('shows the first step with a spotlight and popover', () => {
    startTour([{ target: anchor, title: 'One', body: 'Body' }]);

    expect(document.querySelector('.tour-overlay')).not.toBeNull();
    expect(document.querySelector('.tour-spotlight')).not.toBeNull();
    expect(popoverText()).toContain('One');
    expect(popoverText()).toContain('Body');
  });

  it('advances through steps and finishes on Done', () => {
    const onFinish = vi.fn();
    startTour(
      [
        { target: anchor, title: 'One' },
        { target: anchor, title: 'Two' },
      ],
      { onFinish }
    );

    expect(popoverText()).toContain('One');
    document.querySelector('.tour-next').click();

    expect(popoverText()).toContain('Two');
    expect(document.querySelector('.tour-next').textContent).toBe('Done');

    document.querySelector('.tour-next').click();

    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.tour-popover')).toBeNull();
  });

  it('goes back to the previous step', () => {
    startTour([
      { target: anchor, title: 'One' },
      { target: anchor, title: 'Two' },
    ]);

    expect(document.querySelector('.tour-back').disabled).toBe(true);
    document.querySelector('.tour-next').click();
    document.querySelector('.tour-back').click();

    expect(popoverText()).toContain('One');
  });

  it('skips steps whose anchor is not on the page', () => {
    startTour([
      { target: () => document.getElementById('missing'), title: 'Missing' },
      { target: anchor, title: 'Present' },
    ]);

    expect(popoverText()).toContain('Present');
  });

  it('skips an anchor that is hidden', () => {
    document.body.innerHTML = '<div id="anchor"></div><div id="hidden" hidden></div>';
    startTour([
      { target: () => document.getElementById('hidden'), title: 'Hidden' },
      { target: anchor, title: 'Present' },
    ]);

    expect(popoverText()).toContain('Present');
  });

  it('finishes from the Skip control', () => {
    const onFinish = vi.fn();
    startTour([{ target: anchor, title: 'One' }], { onFinish });

    document.querySelector('.tour-skip').click();

    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.tour-overlay')).toBeNull();
  });

  it('finishes on Escape', () => {
    const onFinish = vi.fn();
    startTour([{ target: anchor, title: 'One' }], { onFinish });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});

describe('startFirstRunTour', () => {
  it('does not start once the tour has been completed', () => {
    isTourDone.mockReturnValue(true);

    expect(startFirstRunTour()).toBeNull();
    expect(document.querySelector('.tour-popover')).toBeNull();
  });

  it('replays when forced and remembers completion', () => {
    isTourDone.mockReturnValue(true);
    document.body.innerHTML = '<div id="search-wrapper"></div>';

    const tour = startFirstRunTour({ force: true });
    expect(tour).not.toBeNull();

    // The only anchor present is the first step, so Next finishes the tour.
    document.querySelector('.tour-next').click();

    expect(markTourDone).toHaveBeenCalledWith('browse');
  });

  it('runs the binder tour and remembers it separately on the binder page', () => {
    document.body.innerHTML = '<div id="binder-root"><div class="binder-tabs"></div></div>';

    const tour = startFirstRunTour({ force: true });
    expect(tour).not.toBeNull();
    expect(popoverText()).toContain('Your binders');

    // Only the tabs exist, so Next skips the remaining steps and finishes.
    document.querySelector('.tour-next').click();

    expect(markTourDone).toHaveBeenCalledWith('binder');
  });
});
