import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../components/toast.js', () => ({ showToast: vi.fn() }));

const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36';
const IOS_SAFARI_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';
const IOS_CHROME_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/120.0 Mobile/15E148 Safari/604.1';

function setUserAgent(ua) {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true });
}

function setStandaloneDisplay(matches) {
  window.matchMedia = vi.fn().mockReturnValue({ matches });
}

function makePromptEvent(outcome = 'accepted') {
  const event = new Event('beforeinstallprompt');
  event.prompt = vi.fn();
  event.userChoice = Promise.resolve({ outcome });
  return event;
}

describe('installPrompt', () => {
  let mod;
  let showToast;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    document.body.innerHTML = '';
    ({ showToast } = await import('../components/toast.js'));
    setUserAgent(ANDROID_UA);
    setStandaloneDisplay(false);
    Object.defineProperty(window.navigator, 'standalone', { value: false, configurable: true });
    mod = await import('../installPrompt.js');
    mod.initInstallPrompt();
  });

  afterEach(() => {
    delete window.navigator.standalone;
    delete window.navigator.maxTouchPoints;
  });

  function mount() {
    const host = document.createElement('div');
    document.body.appendChild(host);
    mod.mountInstallButton(host);
    return host.querySelector('#install-button');
  }

  it('keeps the button hidden until the browser reports installability', () => {
    expect(mount().hidden).toBe(true);
  });

  it('reveals the button on beforeinstallprompt and triggers the native prompt', async () => {
    const button = mount();
    const event = makePromptEvent('accepted');

    window.dispatchEvent(event);
    expect(button.hidden).toBe(false);

    button.click();
    await vi.waitFor(() => expect(event.prompt).toHaveBeenCalledTimes(1));
    // An accepted install switches the app to standalone; the CTA is done.
    await vi.waitFor(() => expect(button.hidden).toBe(true));
  });

  it('keeps the button when the user dismisses the native prompt', async () => {
    const button = mount();
    const event = makePromptEvent('dismissed');

    window.dispatchEvent(event);
    button.click();

    await vi.waitFor(() => expect(event.prompt).toHaveBeenCalledTimes(1));
    expect(button.hidden).toBe(false);
  });

  it('hides the button once the app is installed', () => {
    const button = mount();
    window.dispatchEvent(makePromptEvent());
    expect(button.hidden).toBe(false);

    window.dispatchEvent(new Event('appinstalled'));
    expect(button.hidden).toBe(true);
  });

  it('shows an Add to Home Screen hint on iOS Safari', () => {
    setUserAgent(IOS_SAFARI_UA);
    const button = mount();

    expect(button.hidden).toBe(false);
    button.click();

    expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining('Add to Home Screen'),
      expect.anything()
    );
  });

  it('stays hidden on iOS browsers that cannot install', () => {
    setUserAgent(IOS_CHROME_UA);
    expect(mount().hidden).toBe(true);
  });

  it('stays hidden when already running as an installed app', () => {
    setStandaloneDisplay(true);
    expect(mount().hidden).toBe(true);
  });

  it('detects iPhone and iPadOS but not Android', () => {
    setUserAgent(IOS_SAFARI_UA);
    expect(mod.isIosDevice()).toBe(true);

    setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15'
    );
    Object.defineProperty(window.navigator, 'maxTouchPoints', { value: 5, configurable: true });
    expect(mod.isIosDevice()).toBe(true);

    setUserAgent(ANDROID_UA);
    expect(mod.isIosDevice()).toBe(false);
  });
});
