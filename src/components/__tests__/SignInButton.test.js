import { vi, describe, it, expect, beforeEach } from 'vitest';
import { createSignInButton } from '../SignInButton.js';

describe('createSignInButton', () => {
  // Create a mock Clerk object
  const mockClerk = {
    openSignIn: vi.fn(),
  };

  beforeEach(() => {
    // Reset the mock before each test
    vi.clearAllMocks();
  });

  it('should create a button with the correct text and class', () => {
    const button = createSignInButton(mockClerk);

    expect(button).toBeInstanceOf(HTMLButtonElement);
    expect(button.textContent).toBe('Sign In');
    expect(button.className).toBe('sign-in-button');
  });

  it('should call clerk.openSignIn() when clicked', () => {
    const button = createSignInButton(mockClerk);

    // Simulate a click
    button.dispatchEvent(new MouseEvent('click'));

    // Verify that the mock function was called
    expect(mockClerk.openSignIn).toHaveBeenCalledTimes(1);
  });
});
