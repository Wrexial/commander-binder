import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock all dependencies FIRST
vi.mock('../state/appState.js', () => ({
  appState: { isViewOnlyMode: false },
}));
vi.mock('../auth/clerk.js');
vi.mock('../ui/components/SignInButton.js');
vi.mock('../ui/components/GuestModeText.js');

// NOW, import the modules we need, including the state object
import { setupUI } from '../main.js';
import { mainState } from '../state/mainState.js';
import { appState } from '../state/appState.js';
import * as clerk from '../auth/clerk.js';
import * as signInButton from '../ui/components/SignInButton.js';
import * as guestModeText from '../ui/components/GuestModeText.js';

describe('setupUI', () => {
  beforeEach(() => {
    // setupUI clears the user-actions and sidebar containers, so both must exist.
    document.body.innerHTML = `
      <div id="user-actions"></div>
      <div id="sidebar"></div>
      <div id="guest-welcome"></div>
      <button id="openbtn"></button>
    `;

    // Reset mocks and module state before each test
    vi.clearAllMocks();
    localStorage.clear();
    document.body.classList.remove('has-hamburger');
    mainState.shareToken = undefined;
    mainState.loggedInUserId = undefined;
    appState.isViewOnlyMode = false;

    // Provide default mock implementations
    signInButton.createSignInButton.mockReturnValue(document.createElement('button'));
    guestModeText.createGuestModeText.mockReturnValue(document.createElement('div'));
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('should setup for a guest user if a share token is present', async () => {
    mainState.shareToken = 'share-123';
    clerk.getClerk.mockReturnValue({}); // No user object

    await setupUI();

    expect(guestModeText.createGuestModeText).toHaveBeenCalledTimes(1);
    expect(appState.isViewOnlyMode).toBe(true);
    expect(signInButton.createSignInButton).not.toHaveBeenCalled();
    expect(document.querySelector('#user-actions').children.length).toBe(1);
    // The top bars reserve room for the fixed hamburger.
    expect(document.body.classList.contains('has-hamburger')).toBe(true);
    // Share-token guests get the Guest Mode indicator, not the sign-in welcome.
    expect(document.querySelector('.guest-welcome')).toBeNull();
  });

  it('should setup for a logged-out user if no user and no share token', async () => {
    mainState.shareToken = undefined;
    const emptyClerk = {};
    clerk.getClerk.mockReturnValue(emptyClerk); // No user object

    await setupUI();

    expect(signInButton.createSignInButton).toHaveBeenCalledWith(emptyClerk);
    expect(appState.isViewOnlyMode).toBe(true);
    expect(guestModeText.createGuestModeText).not.toHaveBeenCalled();
    const signIn = document.querySelector('#user-actions').querySelector('button');
    expect(signIn).not.toBeNull();
    expect(document.body.classList.contains('has-hamburger')).toBe(false);
    // Signed-out visitors get the first-run welcome prompting sign-in.
    expect(document.querySelector('.guest-welcome')).not.toBeNull();
  });

  it('should setup for an authenticated user if clerk.user exists', async () => {
    const mockClerk = {
      user: { id: 'user-456' },
      mountUserButton: vi.fn(),
    };
    clerk.getClerk.mockReturnValue(mockClerk);

    await setupUI();

    const userButton = document.getElementById('user-button');
    expect(userButton).not.toBeNull();
    expect(mockClerk.mountUserButton).toHaveBeenCalledWith(userButton);
    expect(mainState.loggedInUserId).toBe('user-456');

    // Verify other paths not taken
    expect(signInButton.createSignInButton).not.toHaveBeenCalled();
    expect(guestModeText.createGuestModeText).not.toHaveBeenCalled();
    expect(document.body.classList.contains('has-hamburger')).toBe(true);
    expect(document.querySelector('.guest-welcome')).toBeNull();
  });
});
