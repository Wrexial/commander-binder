// src/utils/__tests__/debounce.test.js
import { describe, it, expect, vi } from 'vitest';
import { debounce } from '../debounce';

describe('debounce', () => {
  it('should only call the function after the specified delay', () => {
    const func = vi.fn();
    const debouncedFunc = debounce(func, 100);

    debouncedFunc();
    debouncedFunc();
    debouncedFunc();

    expect(func).not.toHaveBeenCalled();

    setTimeout(() => {
      expect(func).toHaveBeenCalledTimes(1);
    }, 100);
  });
});
