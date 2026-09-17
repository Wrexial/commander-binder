import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initScrollPosition } from '../scrollPosition.js';
import { saveScroll } from '../../state/viewState.js';

function setScrollHeight(value) {
  Object.defineProperty(document.documentElement, 'scrollHeight', {
    configurable: true,
    value,
  });
}

describe('initScrollPosition', () => {
  let scrollTo;

  beforeEach(() => {
    sessionStorage.clear();
    setScrollHeight(0);
    scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  });

  afterEach(() => {
    scrollTo.mockRestore();
  });

  it('restores the saved offset once the grid is tall enough', () => {
    saveScroll(1200);
    setScrollHeight(5000);

    initScrollPosition();

    expect(scrollTo).toHaveBeenCalledWith(0, 1200);
  });

  it('does not scroll when nothing has been saved', () => {
    initScrollPosition();

    expect(scrollTo).not.toHaveBeenCalled();
  });
});
