// src/app/shell.js
/**
 * The shared application shell used by both entry points (`main.js` for the
 * card browse/collection view and `binderMain.js` for the Binder Builder page).
 *
 * It owns everything that is page-agnostic: Clerk auth, the sidebar and its
 * collection tools, the guest welcome, collection/wishlist/list loading and the
 * guest→account merges, settings sync and the install prompt. Each page then
 * mounts its own main content and wires its own content-specific modules.
 */
import { appState } from '../state/appState.js';
import { mainState } from '../state/mainState.js';
import { initCardSettings, applySettingsFromStore } from '../ui/settingsUI.js';
import { loadCardStates, mergeLocalCollectionToAccount } from '../state/cardState.js';
import { loadWishlistStates, mergeLocalWishlistToAccount } from '../state/wishlistState.js';
import { loadLists, mergeLocalListsToAccount } from '../state/listsState.js';
import { initClerk, getClerk } from '../auth/clerk.js';
import { createSignInButton } from '../ui/components/SignInButton.js';
import { createGuestModeText } from '../ui/components/GuestModeText.js';
import { createGuestWelcome } from '../ui/components/GuestWelcome.js';
import { isGuestWelcomeDismissed } from '../state/onboarding.js';
import { initSettingsSync, pullSettings } from '../state/settingsSync.js';
import { updateOwnedCounter } from '../ui/components/ownedCounter.js';
import {
  createAddCardsButton,
  createCompareButton,
  createRecentActivityButton,
  createSurpriseButton,
  updateAllBinderCounts,
} from '../ui/layout.js';
import { updateAllCardStates } from '../ui/cards.js';
import { toggleSelectionMode } from '../ui/bulkEdit.js';
import { showToast } from '../ui/components/toast.js';
import { getShareToken } from '../api/share.js';
import { initSidebar, addButtonToSidebar } from '../ui/components/sidebar.js';
import { registerServiceWorker } from '../pwa.js';
import { initInstallPrompt, mountInstallButton } from '../ui/installPrompt.js';

/** The card add/manager dialogs, pulled in on demand as separate chunks. */
const loadAddCardsModal = async () =>
  (await import('../ui/components/addCardsModal.js')).createAddCardsModal();
const loadListsModal = async () =>
  (await import('../ui/components/listsModal.js')).createListsModal();
const loadSettingsModal = async () =>
  (await import('../ui/components/settingsModal.js')).createSettingsModal();

/** Open a lazily-loaded modal, when it built successfully. */
export async function showModal(loadModal) {
  const modal = await loadModal();
  if (modal) modal.show();
}

/** The statistics dialog is large, so it ships in its own chunk. */
export async function showStatistics() {
  const { showStatisticsModal } = await import('../ui/statistics.js');
  await showStatisticsModal();
}

/**
 * The collection/browse tools shared by signed-in and signed-out modes. Guests
 * can use every one of them against their device-local collection, so the same
 * list keeps the two sidebars in sync.
 */
function addCollectionTools() {
  addButtonToSidebar('📊 Show Statistics', showStatistics, 'browse', 30);
  addButtonToSidebar('☑️ Bulk Edit', () => toggleSelectionMode(), 'collection', 35);
  addButtonToSidebar('📋 Lists', () => showModal(loadListsModal), 'collection', 25);

  createAddCardsButton(() => showModal(loadAddCardsModal));
  createSurpriseButton();
  createRecentActivityButton();
}

function setupAuthenticatedUser(userButtonDiv, clerk) {
  clerk.mountUserButton(userButtonDiv);
  mainState.loggedInUserId = clerk.user.id;
  updateOwnedCounter();

  addButtonToSidebar(
    '🔗 Share',
    async () => {
      try {
        const token = await getShareToken();
        const url = new URL(window.location.href);
        url.searchParams.delete('user');
        url.searchParams.set('share', token);
        await navigator.clipboard.writeText(url.href);
        showToast('Link copied to clipboard!');
      } catch (err) {
        console.error('Failed to create share link:', err);
        showToast('Could not create a share link.', 'error');
      }
    },
    'sharing',
    10
  );

  addButtonToSidebar(
    '♻️ Regenerate Share Link',
    async () => {
      try {
        await getShareToken({ regenerate: true });
        showToast('Share link regenerated. Old links no longer work.', 'success');
      } catch (err) {
        console.error('Failed to regenerate share link:', err);
        showToast('Could not regenerate the share link.', 'error');
      }
    },
    'sharing',
    20
  );

  addCollectionTools();
}

/**
 * Show/hide the sidebar hamburger and flag the body so the mobile top bars can
 * reserve room for it (the button is fixed, so it would otherwise overlap the
 * header logo and the sticky search bar).
 * @param {HTMLElement|null} button
 * @param {boolean} visible
 */
function setHamburgerVisible(button, visible) {
  if (button) button.style.display = visible ? 'block' : 'none';
  document.body.classList.toggle('has-hamburger', visible);
}

export async function setupUI() {
  const clerk = getClerk();
  const userActionsContainer = document.getElementById('user-actions');
  const openBtn = document.getElementById('openbtn');
  const sidebar = document.getElementById('sidebar');
  const welcomeMount = document.getElementById('guest-welcome');

  // Clear previous state
  userActionsContainer.innerHTML = '';
  sidebar.innerHTML = '';
  welcomeMount?.replaceChildren();
  appState.isViewOnlyMode = false;

  if (mainState.shareToken) {
    const guestModeText = createGuestModeText();
    userActionsContainer.appendChild(guestModeText);
    addButtonToSidebar('📊 Show Statistics', showStatistics, 'browse', 30);
    addButtonToSidebar('📋 Lists', () => showModal(loadListsModal), 'browse', 35);
    createSurpriseButton();
    createRecentActivityButton();
    createCompareButton();
    appState.isViewOnlyMode = true;
    setHamburgerVisible(openBtn, true);
  } else if (clerk.user) {
    const userButtonDiv = document.createElement('div');
    userButtonDiv.id = 'user-button';
    userActionsContainer.appendChild(userButtonDiv);
    setupAuthenticatedUser(userButtonDiv, clerk);
    setHamburgerVisible(openBtn, true);
  } else {
    const signInButton = createSignInButton(clerk);
    userActionsContainer.appendChild(signInButton);
    mainState.loggedInUserId = undefined;
    // Signed-out visitors are not view-only: they track a collection on this
    // device, which is merged into their account on sign-in. They get the full
    // collection sidebar (add / export / bulk edit / statistics) as well.
    addCollectionTools();

    // Sharing needs an account, so the guest entry just opens the sign-in flow.
    addButtonToSidebar(
      '🔗 Share',
      () => {
        showToast('Sign in to create a share link.');
        clerk.openSignIn();
      },
      'sharing',
      10
    );

    setHamburgerVisible(openBtn, true);
    renderGuestWelcome(clerk, welcomeMount);
  }

  // Available in every mode (signed in, local guest, or share view); it stays
  // hidden until the browser reports the app is installable.
  mountInstallButton(userActionsContainer);

  // Settings are per-device/per-account preferences, so the entry point is the
  // same in every mode.
  addButtonToSidebar('⚙️ Settings', () => showModal(loadSettingsModal), 'settings', 10);
}

/**
 * First-run prompt for signed-out visitors, shown once until dismissed or they
 * sign in. Share-token guests get the separate "Guest Mode" indicator instead.
 * @param {object} clerk
 * @param {HTMLElement|null} mount
 */
function renderGuestWelcome(clerk, mount) {
  if (!mount || isGuestWelcomeDismissed()) return;

  mount.appendChild(
    createGuestWelcome({
      onSignIn: () => clerk.openSignIn(),
      onDismiss: () => mount.replaceChildren(),
    })
  );
}

/**
 * Reload the app when the Clerk user changes so the next boot applies the right
 * collection mode: a signed-in boot merges any local guest marks into the
 * account (see the load chain below), while sign-out returns to device-local
 * tracking. Clerk emits the current state on registration, so the initial id is
 * captured to ignore that first emission.
 * @param {object} clerk
 */
function watchAuthChanges(clerk) {
  if (typeof clerk.addListener !== 'function') return;

  let knownUserId = clerk.user?.id ?? null;

  clerk.addListener(({ user }) => {
    const nextUserId = user?.id ?? null;
    if (nextUserId === knownUserId) return;

    knownUserId = nextUserId;
    window.location.reload();
  });
}

/**
 * Boot the shared shell.
 *
 * @returns {Promise<{results: HTMLElement|null, tooltip: HTMLElement|null, statesReady: Promise<void>}>}
 *   `statesReady` resolves once the saved ownership/wishlist/list state (and the
 *   cross-device settings pull) has been applied.
 */
export async function bootShell() {
  initSidebar();
  initInstallPrompt();
  registerServiceWorker();
  await initClerk();
  watchAuthChanges(getClerk());

  const urlParams = new URLSearchParams(window.location.search);
  mainState.shareToken = urlParams.get('share');

  const tooltip = document.getElementById('tooltip');
  const results = document.getElementById('results');

  await setupUI();
  // Apply the stored grid dimensions before the first cards render.
  initCardSettings();
  initSettingsSync();

  // List membership is painted on the tiles, so repaint them whenever lists
  // load or change (the filter bar has its own listener).
  document.addEventListener('lists:changed', () => {
    updateAllCardStates();
  });

  // Load saved marks in parallel with the page content so Clerk/Netlify/DB
  // latency does not delay the first paint. Marks are re-applied here once the
  // owned/wishlist state arrives.
  const statesReady = Promise.all([loadCardStates(), loadWishlistStates(), loadLists()])
    .then(async () => {
      // A guest's locally-tracked cards are merged into the account the first
      // time the app boots signed in (and on any retry after a failed merge).
      // Re-read the server copy so the merged cards render immediately.
      if (mainState.loggedInUserId) {
        try {
          if (await mergeLocalCollectionToAccount()) await loadCardStates();
        } catch (err) {
          console.error('Failed to merge the local collection:', err);
        }
        try {
          if (await mergeLocalWishlistToAccount()) await loadWishlistStates();
        } catch (err) {
          console.error('Failed to merge the local wishlist:', err);
        }
        try {
          await mergeLocalListsToAccount();
        } catch (err) {
          console.error('Failed to merge the local lists:', err);
        }
      }

      updateAllCardStates();
      updateAllBinderCounts();
      updateOwnedCounter();
      // Cross-device preferences: pull the account's copy (a no-op for guests).
      const applied = await pullSettings();
      if (applied) applySettingsFromStore();
    })
    .catch((err) => console.error('Failed to load card states:', err));

  return { results, tooltip, statesReady };
}
