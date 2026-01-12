// src/components/SignInButton.js
export function createSignInButton(clerk) {
  const signInButton = document.createElement('button');
  signInButton.textContent = 'Sign In';
  signInButton.className = 'sign-in-button';
  signInButton.addEventListener('click', () => clerk.openSignIn());
  return signInButton;
}
