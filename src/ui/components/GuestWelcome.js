// src/ui/components/GuestWelcome.js
import { dismissGuestWelcome } from '../../state/onboarding.js';

/**
 * First-run welcome for signed-out visitors. The grid alone gives no hint that
 * tracking your collection needs an account, so this explains the trade-off and
 * offers a sign-in shortcut. Dismissal is remembered (see `onboarding.js`).
 *
 * @param {{ onSignIn?: () => void, onDismiss?: () => void }} [handlers]
 * @returns {HTMLElement}
 */
export function createGuestWelcome({ onSignIn, onDismiss } = {}) {
  const panel = document.createElement('section');
  panel.className = 'guest-welcome';
  panel.setAttribute('aria-labelledby', 'guest-welcome-title');

  const text = document.createElement('div');
  text.className = 'guest-welcome-text';

  const title = document.createElement('h2');
  title.id = 'guest-welcome-title';
  title.textContent = 'Track your collection';

  const body = document.createElement('p');
  body.textContent =
    'Sign in to mark the cards you own and follow your completion. You can keep browsing as a guest.';

  text.append(title, body);

  const actions = document.createElement('div');
  actions.className = 'guest-welcome-actions';

  const signIn = document.createElement('button');
  signIn.type = 'button';
  signIn.className = 'sign-in-button';
  signIn.textContent = 'Sign In';
  signIn.addEventListener('click', () => onSignIn?.());

  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'guest-welcome-dismiss';
  dismiss.setAttribute('aria-label', 'Dismiss welcome message');
  dismiss.title = 'Dismiss';
  dismiss.innerHTML = '&times;';
  dismiss.addEventListener('click', () => {
    dismissGuestWelcome();
    onDismiss?.();
  });

  actions.append(signIn, dismiss);
  panel.append(text, actions);
  return panel;
}
