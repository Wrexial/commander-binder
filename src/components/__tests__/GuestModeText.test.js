import { describe, it, expect } from 'vitest';
import { createGuestModeText } from '../GuestModeText.js';

describe('createGuestModeText', () => {
  it('should create a div element with correct text and class', () => {
    const element = createGuestModeText();

    // Check if the element is a DIV
    expect(element).toBeInstanceOf(HTMLDivElement);

    // Check the text content
    expect(element.textContent).toBe('Guest Mode');

    // Check the class name
    expect(element.className).toBe('guest-mode-text');
  });
});
