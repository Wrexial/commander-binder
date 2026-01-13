import { vi, describe, it, expect, beforeEach } from 'vitest';
import { createShareButton } from '../ShareButton.js';
import * as toast from '../../ui/toast.js';

// Mock dependencies
vi.mock('../../ui/toast.js');

describe('createShareButton', () => {
  const userId = 'test-user-123';

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Mock clipboard API
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      writable: true,
      configurable: true,
    });

    // Mock window.location
    delete window.location;
    window.location = new URL('https://www.example.com/page');
  });

  it('should create a button with the correct initial properties', () => {
    const button = createShareButton(userId);

    expect(button).toBeInstanceOf(HTMLButtonElement);
    expect(button.id).toBe('share-button');
    expect(button.textContent).toBe('Share');
    expect(button.classList.contains('hidden')).toBe(true);
  });

  it('should copy the URL with user ID to clipboard and show toast on click', () => {
    const button = createShareButton(userId);

    // Simulate a click
    button.dispatchEvent(new MouseEvent('click'));

    // Verify clipboard was called correctly
    const expectedUrl = 'https://www.example.com/page?user=test-user-123';
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expectedUrl);

    // Verify toast was shown
    expect(toast.showToast).toHaveBeenCalledWith('Link copied to clipboard!');
  });
  
  it('should overwrite an existing user query parameter', () => {
    window.location = new URL('https://www.example.com/page?user=old-user');
    const button = createShareButton('new-user-456');

    button.dispatchEvent(new MouseEvent('click'));

    const expectedUrl = 'https://www.example.com/page?user=new-user-456';
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expectedUrl);
  });
});
