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
    // Guest Mode indicator + the (hidden) install button.
    const userActions = document.querySelector('#user-actions');
    expect(userActions.children.length).toBe(2);
    expect(userActions.querySelector('#install-button')).not.toBeNull();
    // The top bars reserve room for the fixed hamburger.
    expect(document.body.classList.contains('has-hamburger')).toBe(true);
    // Share-token guests get the Guest Mode indicator, not the sign-in welcome.
    expect(document.querySelector('.guest-welcome')).toBeNull();
  });

  it('should setup for a logged-out user if no user and no share token', async () => {
    mainState.shareToken = undefined;
    const emptyClerk = { openSignIn: vi.fn() };
    clerk.getClerk.mockReturnValue(emptyClerk); // No user object

    await setupUI();

    expect(signInButton.createSignInButton).toHaveBeenCalledWith(emptyClerk);
    // Signed-out visitors are not view-only: they can track locally, so the
    // tiles keep their ownership toggle.
    expect(appState.isViewOnlyMode).toBe(false);
    expect(guestModeText.createGuestModeText).not.toHaveBeenCalled();
    const signIn = document.querySelector('#user-actions').querySelector('button');
    expect(signIn).not.toBeNull();
    // Guests can open the sidebar and use the local collection tools.
    expect(document.body.classList.contains('has-hamburger')).toBe(true);
    const sidebarButtons = [...document.querySelectorAll('#sidebar button')].map(
      (button) => button.textContent
    );
    expect(sidebarButtons).toEqual(
      expect.arrayContaining([
        '📊 Show Statistics',
        '☑️ Bulk Edit',
        '➕ Add Cards',
        '🎲 Surprise Me',
        '🕒 Recent Additions',
      ])
    );
    // Sharing needs an account, so the guest entry opens the sign-in flow.
    const shareButton = [...document.querySelectorAll('#sidebar button')].find((button) =>
      button.textContent.includes('Share')
    );
    expect(shareButton).toBeTruthy();
    shareButton.click();
    expect(emptyClerk.openSignIn).toHaveBeenCalledTimes(1);
    // Signed-out visitors get the first-run welcome prompting sign-in.
    expect(document.querySelector('.guest-welcome')).not.toBeNull();
  });

  it('omits the browse-grid tools on the Binder Builder page', async () => {
    document.body.innerHTML = `
      <div id="user-actions"></div>
      <div id="sidebar"></div>
      <div id="guest-welcome"></div>
      <button id="openbtn"></button>
      <div id="binder-root"></div>
    `;
    mainState.shareToken = undefined;
    clerk.getClerk.mockReturnValue({ openSignIn: vi.fn() });

    await setupUI();

    const labels = [...document.querySelectorAll('#sidebar button')].map((b) => b.textContent);
    // Surprise Me / Recent Additions act on the browse grid, so they are omitted.
    expect(labels).not.toContain('🎲 Surprise Me');
    expect(labels).not.toContain('🕒 Recent Additions');
    // The collection tools that do work on both pages remain.
    expect(labels).toContain('📊 Show Statistics');
    expect(labels).toContain('➕ Add Cards');
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

    // Bulk edit is reached from the sidebar, not a floating button.
    const sidebarButtons = [...document.querySelectorAll('#sidebar button')].map(
      (button) => button.textContent
    );
    expect(sidebarButtons.some((text) => text.includes('Bulk Edit'))).toBe(true);
  });

  it('omits the grid-only Bulk Edit tool on the Binder Builder page', async () => {
    document.body.innerHTML = `
      <div id="user-actions"></div>
      <div id="sidebar"></div>
      <div id="guest-welcome"></div>
      <button id="openbtn"></button>
      <div id="binder-root"></div>
    `;
    clerk.getClerk.mockReturnValue({ openSignIn: vi.fn() });

    await setupUI();

    const labels = [...document.querySelectorAll('#sidebar button')].map(
      (button) => button.textContent
    );
    expect(labels.some((text) => text.includes('Bulk Edit'))).toBe(false);
    // The other collection tools are still offered.
    expect(labels.some((text) => text.includes('Add Cards'))).toBe(true);
    expect(labels.some((text) => text.includes('Bulk Check'))).toBe(true);
    expect(labels.some((text) => text.includes('Export Cards'))).toBe(true);
  });
});
