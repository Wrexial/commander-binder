// src/ui/__tests__/toast.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { showToast, showUndo } from '../toast';

describe('toast', () => {
    let toastContainer;

    beforeEach(() => {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast';
        document.body.appendChild(toastContainer);
        vi.useFakeTimers();
    });

    afterEach(() => {
        document.body.removeChild(toastContainer);
        vi.useRealTimers();
    });

    it('should show a toast with a message', () => {
        showToast('Hello, world!');
        expect(toastContainer.textContent).toContain('Hello, world!');
        expect(toastContainer.classList.contains('show')).toBe(true);
    });

    it('should hide the toast after the default duration', () => {
        showToast('Hello, world!');
        vi.runAllTimers();
        expect(toastContainer.classList.contains('show')).toBe(false);
    });

    it('should show a toast with an action button', () => {
        const action = vi.fn();
        showToast('Hello, world!', { actionText: 'Click me', action });
        const button = toastContainer.querySelector('.toast-action');
        expect(button.textContent).toBe('Click me');
        button.click();
        expect(action).toHaveBeenCalled();
    });

    it('should show an undo toast', () => {
        const undoAction = vi.fn();
        showUndo('Action completed', undoAction);
        const button = toastContainer.querySelector('.toast-action');
        expect(button.textContent).toBe('Undo');
        button.click();
        expect(undoAction).toHaveBeenCalled();
    });
});
