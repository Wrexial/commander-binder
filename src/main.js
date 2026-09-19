// main.js
import { appState } from './state/appState.js';
import { initLazyCards } from './ui/lazyCardLoader.js';
import { applySort } from './ui/cardFeed.js';
import { initCardSettings, applySettingsFromStore } from './ui/settingsUI.js';
import { loadCardStates, mergeLocalCollectionToAccount } from './state/cardState.js';
import { loadWishlistStates, mergeLocalWishlistToAccount } from './state/wishlistState.js';
import { initSearch, refreshCardFilter } from './ui/search.js';
import { initFilterBar } from './ui/filterBar.js';
import { initClerk, getClerk } from './auth/clerk.js';
import { createSignInButton } from './ui/components/SignInButton.js';
import { createGuestModeText } from './ui/components/GuestModeText.js';
import { createGuestWelcome } from './ui/components/GuestWelcome.js';
import { isGuestWelcomeDismissed } from './state/onboarding.js';
import { initSettingsSync, pullSettings } from './state/settingsSync.js';
import { updateOwnedCounter } from './ui/components/ownedCounter.js';
import { initCardInteractions } from './ui/cardInteractions.js';
import { initKeyboardShortcuts } from './ui/keyboardShortcuts.js';
import { initBulkEdit, toggleSelectionMode } from './ui/bulkEdit.js';
import {
  createExportOwnedButton,
  createExportWishlistButton,
  createAddCardsButton,
  createAddWishlistButton,
  createBulkCheckButton,
  createCompareButton,
  createRecentActivityButton,
  createSurpriseButton,
  updateAllBinderCounts,
} from './ui/layout.js';
import { updateAllCardStates } from './ui/cards.js';
import { showToast } from './ui/components/toast.js';
import { getShareToken } from './api/share.js';
import { initSidebar, addButtonToSidebar } from './ui/components/sidebar.js';
import { initViewportMetrics } from './utils/viewport.js';
import { initScrollPosition } from './ui/scrollPosition.js';
import { initYearScrubber } from './ui/yearScrubber.js';
import { mainState } from './state/mainState.js';
import { registerServiceWorker } from './pwa.js';
import { initInstallPrompt, mountInstallButton } from './ui/installPrompt.js';

/**
 * The card add/check dialogs and the statistics dialog are the heaviest UI
 * modules (hundreds of lines each), so they are pulled in on demand rather than
 * shipping in the first bundle. Vite emits them as separate chunks.
 */
const loadAddCardsModal = async () =>
  (await import('./ui/components/addCardsModal.js')).createAddCardsModal();
const loadAddWishlistModal = async () =>
  (await import('./ui/components/addCardsModal.js')).createAddCardsModal({ kind: 'wishlist' });
const loadBulkCheckModal = async () =>
  (await import('./ui/components/bulkCardModal.js')).createBulkCheckModal();

async function showStatistics() {
  const { showStatisticsModal } = await import('./ui/statistics.js');
  await showStatisticsModal();
}

async function showModal(loadModal) {
  const modal = await loadModal();
  if (modal) {
    modal.show();
  }
}

/**
 * The collection/browse tools shared by signed-in and signed-out modes. Guests
 * can use every one of them against their device-local collection, so the same
 * list keeps the two sidebars in sync.
 */
function addCollectionTools() {
  addButtonToSidebar('📊 Show Statistics', showStatistics, 'browse', 30);
  addButtonToSidebar('☑️ Bulk Edit', () => toggleSelectionMode(), 'collection', 35);

  createAddCardsButton(() => showModal(loadAddCardsModal));
  createAddWishlistButton(() => showModal(loadAddWishlistModal));
  createSurpriseButton();
  createRecentActivityButton();
  createRecentActivityButton({ kind: 'wishlist', order: 25 });
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
    createSurpriseButton();
    createRecentActivityButton();
    createRecentActivityButton({ kind: 'wishlist', order: 25 });
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

document.addEventListener('DOMContentLoaded', async () => {
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
  initSettingsSync();
  initScrollPosition();

  // Load saved marks in parallel with the card grid so Clerk/Netlify/DB
  // latency does not delay the first cards. Marks are re-applied here once
  // the owned/wishlist state arrives (cards may already be rendered).
  Promise.all([loadCardStates(), loadWishlistStates()])
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
      }

      updateAllCardStates();
      updateAllBinderCounts();
      updateOwnedCounter();
      // The owned/missing filter depends on this state, so re-evaluate it now
      // that the saved marks have arrived.
      refreshCardFilter();
      // Cross-device preferences: pull the account's copy (a no-op for guests).
      pullSettings().then((applied) => {
        if (applied) applySettingsFromStore();
      });
    })
    .catch((err) => console.error('Failed to load card states:', err));

  initLazyCards(results, tooltip);
  initYearScrubber();
  updateAllBinderCounts();
  createBulkCheckButton(() => showModal(loadBulkCheckModal));
  createExportOwnedButton();
  createExportWishlistButton();

  initCardSettings();
  initViewportMetrics();
  initSearch();
  initFilterBar({ onChange: refreshCardFilter, onSortChange: applySort });
  initCardInteractions(results, tooltip);
  initBulkEdit();
  initKeyboardShortcuts();
});
