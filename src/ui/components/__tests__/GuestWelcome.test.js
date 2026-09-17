import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createGuestWelcome } from '../GuestWelcome.js';

describe('createGuestWelcome', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('renders the explanation, a sign-in button and a dismiss button', () => {
    const el = createGuestWelcome();

    expect(el.querySelector('h2').textContent).toBe('Track your collection');
    expect(el.querySelector('p').textContent).toContain('Sign in');
    expect(el.querySelector('.sign-in-button').textContent).toBe('Sign In');
    expect(el.querySelector('.guest-welcome-dismiss')).not.toBeNull();
  });

  it('gives the dismiss control an accessible name', () => {
    const el = createGuestWelcome();

    expect(el.querySelector('.guest-welcome-dismiss').getAttribute('aria-label')).toBe(
      'Dismiss welcome message'
    );
  });

  it('calls onSignIn when the sign-in button is clicked', () => {
    const onSignIn = vi.fn();
    const el = createGuestWelcome({ onSignIn });

    el.querySelector('.sign-in-button').click();

    expect(onSignIn).toHaveBeenCalledTimes(1);
  });

  it('persists the dismissal and calls onDismiss', () => {
    const onDismiss = vi.fn();
    const el = createGuestWelcome({ onDismiss });

    el.querySelector('.guest-welcome-dismiss').click();

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('guestWelcomeDismissed')).toBe('1');
  });
});
