import { describe, it, expect, vi, afterEach } from 'vitest';
import { showListModal } from '../../ui/modal';

vi.useFakeTimers();

describe('modal', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('should show a modal with a title and list', () => {
        showListModal('Test Title', ['Test Item 1', 'Test Item 2']);
        const modal = document.querySelector('.list-modal');
        expect(modal).not.toBeNull();
        expect(modal.querySelector('h2').textContent).toBe('Test Title');
        expect(modal.querySelector('.modal-content-area').textContent).toBe('Test Item 1\nTest Item 2');
    });

    it('should close the modal when the close button is clicked', async () => {
        showListModal('Test Title', ['Test Item 1', 'Test Item 2']);
        const closeButton = document.querySelector('[data-testid="close-button"]');
        closeButton.click();
        
        const modal = document.querySelector('.list-modal-backdrop');
        expect(modal).toBeNull();
    });

    it('should copy the list to the clipboard when the copy button is clicked', () => {
        Object.defineProperty(navigator, 'clipboard', {
            value: {
                writeText: vi.fn().mockResolvedValue(undefined),
            },
            configurable: true,
        });

        showListModal('Test Title', ['Test Item 1', 'Test Item 2']);
        const copyButton = document.querySelector('[data-testid="copy-button"]');
        copyButton.click();
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Test Item 1\nTest Item 2');
    });
});
