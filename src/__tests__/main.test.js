import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock all dependencies FIRST
vi.mock('../appState.js', () => ({
  appState: { isViewOnlyMode: false },
}));
vi.mock('../clerk.js');
vi.mock('../components/SignInButton.js');
vi.mock('../components/GuestModeText.js');
vi.mock('../components/ShareButton.js');

// NOW, import the modules we need, including the state object
import { setupUI, mainState } from '../main.js';
import { appState } from '../appState.js';
import * as clerk from '../clerk.js';
import * as signInButton from '../components/SignInButton.js';
import * as guestModeText from '../components/GuestModeText.js';
import * as shareButton from '../components/ShareButton.js';


describe('setupUI', () => {

  beforeEach(() => {
    // Setup DOM
    document.body.innerHTML = '<div class="main-header"></div>';

    // Reset mocks and module state before each test
    vi.clearAllMocks();
    mainState.guestUserId = undefined;
    mainState.loggedInUserId = undefined;
    mainState.isLoggedIn = false;
    appState.isViewOnlyMode = false;

    // Provide default mock implementations
    signInButton.createSignInButton.mockReturnValue(document.createElement('button'));
    guestModeText.createGuestModeText.mockReturnValue(document.createElement('div'));
    shareButton.createShareButton.mockReturnValue(document.createElement('button'));
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('should setup for a guest user if guestUserId is present', async () => {
    mainState.guestUserId = 'guest-123';
    clerk.getClerk.mockReturnValue({}); // No user object

    await setupUI();

    expect(guestModeText.createGuestModeText).toHaveBeenCalledTimes(1);
    expect(appState.isViewOnlyMode).toBe(true);
    expect(signInButton.createSignInButton).not.toHaveBeenCalled();
    const guestText = document.querySelector('.user-actions').querySelector('div');
    expect(guestText).toBeDefined();
  });

  it('should setup for a logged-out user if no user and no guestId', async () => {
    mainState.guestUserId = undefined;
    clerk.getClerk.mockReturnValue({}); // No user object

    await setupUI();

    expect(signInButton.createSignInButton).toHaveBeenCalledTimes(1);
    expect(appState.isViewOnlyMode).toBe(true);
    expect(guestModeText.createGuestModeText).not.toHaveBeenCalled();
    const signIn = document.querySelector('.user-actions').querySelector('button');
    expect(signIn).toBeDefined();
  });

  it('should setup for an authenticated user if clerk.user exists', async () => {
    const mockClerk = {
      user: { id: 'user-456' },
      mountUserButton: vi.fn(),
    };
    clerk.getClerk.mockReturnValue(mockClerk);
    const mockShareButton = document.createElement('button');
    mockShareButton.classList.add('hidden');
    shareButton.createShareButton.mockReturnValue(mockShareButton);


    await setupUI();

    expect(mockClerk.mountUserButton).toHaveBeenCalled();
    expect(mainState.isLoggedIn).toBe(true);
    expect(mainState.loggedInUserId).toBe('user-456');
    expect(shareButton.createShareButton).toHaveBeenCalledWith('user-456');
    expect(mockShareButton.classList.contains('hidden')).toBe(false);

    // Verify other paths not taken
    expect(signInButton.createSignInButton).not.toHaveBeenCalled();
    expect(guestModeText.createGuestModeText).not.toHaveBeenCalled();
  });
});
