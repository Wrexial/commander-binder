import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initSidebar, addButtonToSidebar } from '../sidebar.js';

describe('sidebar', () => {
  beforeEach(() => {
    document.body.className = '';
    document.body.innerHTML = `
      <div id="sidebar"></div>
      <div id="sidebar-backdrop"></div>
      <button id="openbtn" aria-expanded="false"></button>
    `;
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('opens the sidebar and reports the state on the toggle button', () => {
    initSidebar();
    const toggle = document.getElementById('openbtn');

    toggle.click();

    expect(document.body.classList.contains('sidebar-open')).toBe(true);
    expect(toggle.classList.contains('is-active')).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('toggles the sidebar closed on a second click', () => {
    initSidebar();
    const toggle = document.getElementById('openbtn');

    toggle.click();
    toggle.click();

    expect(document.body.classList.contains('sidebar-open')).toBe(false);
    expect(toggle.classList.contains('is-active')).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes the sidebar when the backdrop is clicked', () => {
    initSidebar();
    const toggle = document.getElementById('openbtn');

    toggle.click();
    document.getElementById('sidebar-backdrop').click();

    expect(document.body.classList.contains('sidebar-open')).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('adds a sidebar button that runs the given handler', () => {
    const onClick = vi.fn();

    addButtonToSidebar('Show Statistics', onClick);

    const button = document.querySelector('#sidebar button');
    expect(button.textContent).toBe('Show Statistics');

    button.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('closes the menu when an action is chosen', () => {
    initSidebar();
    document.getElementById('openbtn').click();
    expect(document.body.classList.contains('sidebar-open')).toBe(true);

    addButtonToSidebar('Show Statistics', vi.fn());
    document.querySelector('#sidebar button').click();

    expect(document.body.classList.contains('sidebar-open')).toBe(false);
    expect(document.getElementById('openbtn').getAttribute('aria-expanded')).toBe('false');
  });

  it('does nothing when the sidebar is missing', () => {
    document.getElementById('sidebar').remove();

    expect(() => addButtonToSidebar('Nope', vi.fn())).not.toThrow();
  });

  it('groups buttons into labelled sections in a stable order', () => {
    // Added out of order on purpose.
    addButtonToSidebar('Stats', vi.fn(), 'browse');
    addButtonToSidebar('Share', vi.fn(), 'sharing');
    addButtonToSidebar('Import', vi.fn(), 'collection');

    const titles = [...document.querySelectorAll('#sidebar .sidebar-section-title')].map(
      (el) => el.textContent
    );
    expect(titles).toEqual(['Collection', 'Browse', 'Sharing']);

    const collectionButtons = [
      ...document.querySelectorAll('[data-section="collection"] button'),
    ].map((button) => button.textContent);
    expect(collectionButtons).toEqual(['Import']);
  });
});
