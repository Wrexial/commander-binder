/**
 * Register the service worker that makes the app installable and gives it an
 * offline app shell. Production only: in dev it would cache Vite's unbundled
 * modules and serve stale code.
 *
 * @param {{ enabled?: boolean }} [options] `enabled` defaults to the Vite PROD
 *   flag; tests can override it.
 * @returns {boolean} true when registration was attempted.
 */
export function registerServiceWorker({ enabled = import.meta.env.PROD } = {}) {
  if (!enabled) return false;
  if (!('serviceWorker' in navigator)) return false;

  const register = () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.error('Service worker registration failed:', err);
    });
  };

  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });

  return true;
}
