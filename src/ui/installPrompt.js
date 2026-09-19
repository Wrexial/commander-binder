import { showToast } from './components/toast.js';

/**
 * `BeforeInstallPromptEvent` captured from Chromium so the in-app button can
 * trigger the native install sheet later. Not part of the DOM lib.
 * @type {any}
 */
let deferredPrompt = null;

/** The mounted install button (setupUI rebuilds #user-actions on each boot). */
let button = null;

/** True once the browser reports the app was installed. */
let installed = false;

/** True once `initInstallPrompt` has attached its window listeners. */
let wired = false;

/** Already running as an installed app (Android/desktop or iOS home screen). */
export function isStandaloneDisplay() {
  const iosStandalone = window.navigator.standalone === true;
  const mq = window.matchMedia?.('(display-mode: standalone)');
  return iosStandalone || Boolean(mq?.matches);
}

/**
 * iPhone/iPad. Includes iPadOS 13+, which reports itself as a Mac but reports
 * touch points.
 */
export function isIosDevice() {
  const ua = window.navigator.userAgent || '';
  const iPadOs = ua.includes('Mac') && window.navigator.maxTouchPoints > 1;
  return /iphone|ipad|ipod/i.test(ua) || iPadOs;
}

/**
 * On iOS only Safari can "Add to Home Screen"; other iOS browsers (Chrome,
 * Firefox, Edge, Opera) cannot, so we must not promise them the same flow.
 */
export function isIosSafari() {
  if (!isIosDevice()) return false;
  const ua = window.navigator.userAgent || '';
  return !/crios|fxios|edgios|opios/i.test(ua);
}

function canInstall() {
  if (installed || isStandaloneDisplay()) return false;
  return Boolean(deferredPrompt) || isIosSafari();
}

/** Show/hide the mounted button to match the current installability. */
function sync() {
  if (button) button.hidden = !canInstall();
}

async function handleClick() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      installed = true;
      deferredPrompt = null;
    }
    sync();
    return;
  }

  if (isIosSafari()) {
    showToast('Tap Share, then “Add to Home Screen”.', { duration: 6000 });
  }
}

/**
 * Create (once) and mount the header install button. Safe to call with no
 * mount; visibility is driven entirely by `sync`.
 * @param {HTMLElement|null} mount
 */
export function mountInstallButton(mount) {
  if (!mount) return;

  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.id = 'install-button';
    button.className = 'install-button';
    button.textContent = 'Install app';
    button.hidden = true;
    button.addEventListener('click', handleClick);
  }

  if (button.parentElement !== mount) mount.appendChild(button);
  sync();
}

/** Attach the browser install lifecycle listeners. Idempotent. */
export function initInstallPrompt() {
  if (wired) return;
  wired = true;

  window.addEventListener('beforeinstallprompt', (event) => {
    // Keep the event so our own button can trigger the native prompt later.
    event.preventDefault();
    deferredPrompt = event;
    sync();
  });

  window.addEventListener('appinstalled', () => {
    installed = true;
    deferredPrompt = null;
    sync();
  });
}
