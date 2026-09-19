import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initKeyboardShortcuts } from '../keyboardShortcuts.js';

function press(key, target = document.body, extra = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra });
  target.dispatchEvent(event);
  return event;
}

describe('initKeyboardShortcuts', () => {
  let teardown;

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="search-wrapper">
        <input id="search-input" />
        <button id="clear-search"></button>
        <button id="search-help" aria-expanded="false"></button>
        <div id="search-tooltip" style="display: none"></div>
      </div>
      <div id="results">
        <div class="binder">
          <div class="card"><button class="card-toggle"></button></div>
          <div class="card" style="display: none"><button class="card-toggle"></button></div>
          <div class="card">
            <button class="card-toggle"></button>
            <button class="card-versions"></button>
          </div>
        </div>
      </div>
    `;
    Element.prototype.scrollIntoView = vi.fn();
    teardown = initKeyboardShortcuts();
  });

  afterEach(() => {
    teardown?.();
    document.body.innerHTML = '';
  });

  const searchInput = () => document.getElementById('search-input');
  const visibleToggles = () =>
    [...document.querySelectorAll('#results .card')]
      .filter((card) => card.style.display !== 'none')
      .map((card) => card.querySelector('.card-toggle'));

  it('focuses the search box on /', () => {
    press('/');
    expect(document.activeElement).toBe(searchInput());
  });

  it('does not hijack / while typing in a field', () => {
    const input = searchInput();
    input.focus();

    const event = press('/', input);

    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(input);
  });

  it('opens the syntax help on ?', () => {
    const help = document.getElementById('search-help');
    const click = vi.spyOn(help, 'click');

    press('?');

    expect(click).toHaveBeenCalledTimes(1);
  });

  it('clears an active search on Escape', () => {
    const input = searchInput();
    input.value = 'dragon';
    const inputEvents = vi.fn();
    input.addEventListener('input', inputEvents);
    document.getElementById('clear-search').addEventListener('click', () => {
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    input.focus();

    press('Escape', input);

    expect(input.value).toBe('');
    expect(inputEvents).toHaveBeenCalled();
    expect(document.activeElement).toBe(input);
  });

  it('walks the visible cards with j and k, skipping filtered-out ones', () => {
    const [first, second] = visibleToggles();

    press('j');
    expect(document.activeElement).toBe(first);

    press('j');
    expect(document.activeElement).toBe(second);

    // Clamped at the end of the grid.
    press('j');
    expect(document.activeElement).toBe(second);

    press('k');
    expect(document.activeElement).toBe(first);
  });

  it('leaves arrow keys alone when no card is focused', () => {
    const event = press('ArrowDown');
    expect(event.defaultPrevented).toBe(false);
  });

  it('moves between cards with arrow keys once a card control is focused', () => {
    const [first, second] = visibleToggles();
    first.focus();

    const event = press('ArrowDown', first);

    expect(document.activeElement).toBe(second);
    expect(event.defaultPrevented).toBe(true);
  });

  it('ignores shortcuts while a modal is open', () => {
    const backdrop = document.createElement('div');
    backdrop.className = 'list-modal-backdrop';
    document.body.appendChild(backdrop);

    const event = press('/');

    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).not.toBe(searchInput());
  });

  it('ignores shortcuts while the card preview modal is open', () => {
    const preview = document.createElement('div');
    preview.className = 'tooltip modal';
    document.body.appendChild(preview);

    const event = press('/');

    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).not.toBe(searchInput());
  });

  it('ignores shortcuts pressed with a modifier', () => {
    const event = press('j', document.body, { ctrlKey: true });
    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).not.toBe(visibleToggles()[0]);
  });

  it('stops listening after teardown', () => {
    teardown();
    press('/');
    expect(document.activeElement).not.toBe(searchInput());
    teardown = null;
  });
});
