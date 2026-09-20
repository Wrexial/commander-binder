import { describe, it, expect, vi } from 'vitest';
import { createSignInButton } from '../signInButton.js';

describe('createSignInButton', () => {
  it('renders a labelled button that opens the Clerk sign-in flow', () => {
    const clerk = { openSignIn: vi.fn() };

    const button = createSignInButton(clerk);

    expect(button.tagName).toBe('BUTTON');
    expect(button.textContent).toBe('Sign In');
    expect(button.className).toBe('sign-in-button');
    expect(button.type).toBe('button'); // never the default submit

    button.click();
    expect(clerk.openSignIn).toHaveBeenCalledTimes(1);
  });
});
