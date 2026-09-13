// src/ui/components/__tests__/GuestModeText.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createGuestModeText, getBaseUrl } from '../GuestModeText';

describe('GuestModeText', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('should render the Guest Mode label and an Exit Guest View button', () => {
    const el = createGuestModeText();

    expect(el.querySelector('.guest-mode-text').textContent).toBe('Guest Mode');
    const button = el.querySelector('.exit-guest-button');
    expect(button).not.toBeNull();
    expect(button.textContent).toBe('Exit Guest View');
  });

  it('should call the provided exit handler when clicked', () => {
    const onExit = vi.fn();
    const el = createGuestModeText(onExit);

    el.querySelector('.exit-guest-button').click();

    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('should navigate to the base URL when no handler is provided', () => {
    const el = createGuestModeText();
    // jsdom does not implement navigation, so stub the location setter.
    const location = {
      href: 'https://example.com/?share=token',
      origin: 'https://example.com',
      pathname: '/',
    };
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: location,
    });

    el.querySelector('.exit-guest-button').click();

    expect(location.href).toBe('https://example.com/');
  });

  it('getBaseUrl should strip the query string', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { origin: 'https://example.com', pathname: '/' },
    });

    expect(getBaseUrl()).toBe('https://example.com/');
  });
});
