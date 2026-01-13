import { describe, it, expect, vi, afterEach } from 'vitest';
import { showListModal } from '../../ui/modal';

vi.useFakeTimers();

describe('modal', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('should show a modal with a title and list', () => {
        showListModal('Test Title', 'Test List');
        const modal = document.querySelector('.list-modal');
        expect(modal).not.toBeNull();
        expect(modal.querySelector('h2').textContent).toBe('Test Title');
        expect(modal.querySelector('textarea').value).toBe('Test List');
    });

    it('should close the modal when the close button is clicked', async () => {
        showListModal('Test Title', 'Test List');
        const closeButton = document.querySelector('[data-testid="close-button"]');
        closeButton.click();

        // Wait for the modal to be removed from the DOM
        await vi.runAllTimersAsync();
        
        const modal = document.querySelector('.list-modal');
        expect(modal).toBeNull();
    });

    it('should copy the list to the clipboard when the copy button is clicked', () => {
        Object.defineProperty(navigator, 'clipboard', {
            value: {
                writeText: vi.fn().mockResolvedValue(undefined),
            },
            configurable: true,
        });

        showListModal('Test Title', 'Test List');
        const copyButton = document.querySelector('[data-testid="copy-button"]');
        copyButton.click();
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Test List');
    });
});
