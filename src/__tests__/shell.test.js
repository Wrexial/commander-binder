import { vi, describe, it, expect, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({ loggedInUserId: null, shareToken: null }));

vi.mock('../state/mainState.js', () => ({ mainState: state }));
vi.mock('../state/appState.js', () => ({ appState: { isViewOnlyMode: false } }));
vi.mock('../auth/clerk.js', () => ({ initClerk: vi.fn(async () => {}), getClerk: vi.fn() }));
vi.mock('../pwa.js', () => ({ registerServiceWorker: vi.fn(() => false) }));
vi.mock('../ui/installPrompt.js', () => ({
  initInstallPrompt: vi.fn(),
  mountInstallButton: vi.fn(),
}));
vi.mock('../ui/components/sidebar.js', () => ({
  initSidebar: vi.fn(),
  addButtonToSidebar: vi.fn(),
}));
vi.mock('../state/cardState.js', () => ({
  loadCardStates: vi.fn(async () => {}),
  mergeLocalCollectionToAccount: vi.fn(async () => false),
}));
vi.mock('../state/wishlistState.js', () => ({
  loadWishlistStates: vi.fn(async () => {}),
  mergeLocalWishlistToAccount: vi.fn(async () => false),
}));
vi.mock('../state/listsState.js', () => ({
  loadLists: vi.fn(async () => {}),
  mergeLocalListsToAccount: vi.fn(async () => false),
}));
vi.mock('../state/bindersState.js', () => ({
  loadBinders: vi.fn(async () => []),
  mergeLocalBindersToAccount: vi.fn(async () => false),
  getActiveBinder: vi.fn(() => null),
  getActiveBinderId: vi.fn(() => null),
  getBinderPrintingIds: vi.fn(() => []),
  getBinderSlotCards: vi.fn(() => []),
}));
vi.mock('../state/settingsSync.js', () => ({
  initSettingsSync: vi.fn(),
  pullSettings: vi.fn(async () => true),
}));
vi.mock('../state/onboarding.js', () => ({ isGuestWelcomeDismissed: vi.fn(() => true) }));
vi.mock('../ui/settingsUI.js', () => ({
  initCardSettings: vi.fn(),
  applySettingsFromStore: vi.fn(),
}));
vi.mock('../ui/cards.js', () => ({ updateAllCardStates: vi.fn() }));
vi.mock('../ui/layout.js', () => ({
  createAddCardsButton: vi.fn(),
  createBulkCheckButton: vi.fn(),
  createCompareButton: vi.fn(),
  createExportButton: vi.fn(),
  createRecentActivityButton: vi.fn(),
  createSurpriseButton: vi.fn(),
  updateAllBinderCounts: vi.fn(),
}));
vi.mock('../ui/bulkEdit.js', () => ({ toggleSelectionMode: vi.fn() }));
vi.mock('../ui/components/toast.js', () => ({ showToast: vi.fn() }));
vi.mock('../ui/components/ownedCounter.js', () => ({ updateOwnedCounter: vi.fn() }));
vi.mock('../ui/components/signInButton.js', () => ({
  createSignInButton: vi.fn(() => document.createElement('button')),
}));
vi.mock('../ui/components/guestModeText.js', () => ({
  createGuestModeText: vi.fn(() => document.createElement('div')),
}));
vi.mock('../ui/components/guestWelcome.js', () => ({
  createGuestWelcome: vi.fn(() => document.createElement('div')),
}));
vi.mock('../api/cardSearch.js', () => ({ hydrateCardsByIds: vi.fn(async () => []) }));

import { bootShell } from '../app/shell.js';
import { getClerk, initClerk } from '../auth/clerk.js';
import { loadCardStates, mergeLocalCollectionToAccount } from '../state/cardState.js';
import { mergeLocalWishlistToAccount } from '../state/wishlistState.js';
import { mergeLocalListsToAccount } from '../state/listsState.js';
import { loadBinders, mergeLocalBindersToAccount } from '../state/bindersState.js';
import { pullSettings } from '../state/settingsSync.js';
import { applySettingsFromStore } from '../ui/settingsUI.js';
import { updateAllCardStates } from '../ui/cards.js';
import { updateAllBinderCounts } from '../ui/layout.js';
import { addButtonToSidebar } from '../ui/components/sidebar.js';

function setupDom() {
  document.body.innerHTML = `
    <button id="openbtn"></button>
    <div id="sidebar"></div>
    <div id="sidebar-backdrop"></div>
    <div id="user-actions"></div>
    <div id="guest-welcome"></div>
    <div id="results"></div>
    <div id="tooltip"></div>
    <div id="toast"></div>
  `;
}

/** A Clerk stub. `user` null means signed out. */
function clerkStub(user = null) {
  return {
    user,
    addListener: vi.fn(),
    openSignIn: vi.fn(),
    mountUserButton: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  setupDom();
  state.loggedInUserId = null;
  state.shareToken = null;
  window.history.replaceState({}, '', '/');
  initClerk.mockResolvedValue(undefined);
  getClerk.mockReturnValue(clerkStub(null));
  pullSettings.mockResolvedValue(true);
});

describe('bootShell', () => {
  it('returns before Clerk resolves so the page content can mount', async () => {
    // Park Clerk on a promise we control.
    let releaseClerk;
    initClerk.mockImplementation(() => new Promise((resolve) => (releaseClerk = resolve)));

    let shellResolved = false;
    const { results, tooltip, shellReady } = await bootShell();
    shellReady.then(() => (shellResolved = true));

    // The shell handed back the mount points without waiting on auth...
    expect(results).not.toBeNull();
    expect(tooltip).not.toBeNull();
    expect(shellResolved).toBe(false);
    expect(addButtonToSidebar).not.toHaveBeenCalled();

    // ...and finishes the auth-dependent chrome once Clerk is ready.
    releaseClerk();
    await shellReady;
    expect(shellResolved).toBe(true);
    expect(addButtonToSidebar).toHaveBeenCalled();
  });

  it('merges guest data into the account and applies synced settings on sign-in', async () => {
    getClerk.mockReturnValue(clerkStub({ id: 'user_1' }));
    mergeLocalCollectionToAccount.mockResolvedValue(true);
    mergeLocalWishlistToAccount.mockResolvedValue(true);
    mergeLocalListsToAccount.mockResolvedValue(true);
    mergeLocalBindersToAccount.mockResolvedValue(true);

    const { statesReady } = await bootShell();
    await statesReady;

    expect(mergeLocalCollectionToAccount).toHaveBeenCalledTimes(1);
    expect(mergeLocalWishlistToAccount).toHaveBeenCalledTimes(1);
    expect(mergeLocalListsToAccount).toHaveBeenCalledTimes(1);
    expect(mergeLocalBindersToAccount).toHaveBeenCalledTimes(1);
    // A successful collection merge re-reads the server copy.
    expect(loadCardStates).toHaveBeenCalledTimes(2);
    expect(updateAllCardStates).toHaveBeenCalled();
    expect(updateAllBinderCounts).toHaveBeenCalled();
    expect(applySettingsFromStore).toHaveBeenCalled();
    // Binders load for the bulk modals without seeding on this page.
    expect(loadBinders).toHaveBeenCalledWith({ seed: false });
  });

  it('loads state but merges nothing for a signed-out visitor', async () => {
    const { statesReady } = await bootShell();
    await statesReady;

    expect(mergeLocalCollectionToAccount).not.toHaveBeenCalled();
    expect(mergeLocalWishlistToAccount).not.toHaveBeenCalled();
    expect(mergeLocalListsToAccount).not.toHaveBeenCalled();
    expect(mergeLocalBindersToAccount).not.toHaveBeenCalled();
    expect(loadCardStates).toHaveBeenCalledTimes(1);
    expect(applySettingsFromStore).toHaveBeenCalled();
  });

  it('is read-only for a share visitor and never merges', async () => {
    window.history.replaceState({}, '', '/?share=tok');
    const { statesReady } = await bootShell();
    await statesReady;

    expect(state.shareToken).toBe('tok');
    expect(mergeLocalCollectionToAccount).not.toHaveBeenCalled();
    expect(mergeLocalBindersToAccount).not.toHaveBeenCalled();
  });
});
