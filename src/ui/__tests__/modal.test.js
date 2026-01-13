import { describe, it, expect, vi } from 'vitest';
import { showListModal } from '../../ui/modal';

vi.useFakeTimers();

describe('modal', () => {
    it('should show a modal with a title and list', () => {
        showListModal('Test Title', 'Test List');
        const modal = document.querySelector('.list-modal');
        expect(modal).not.toBeNull();
        expect(modal.querySelector('h2').textContent).toBe('Test Title');
        expect(modal.querySelector('textarea').value).toBe('Test List');
    });

    it('should close the modal when the close button is clicked', async () => {
        showListModal('Test Title', 'Test List');
        const closeButton = document.querySelectorAll('.list-modal button')[1];
        closeButton.click();
        await new Promise(resolve => setTimeout(resolve, 0));
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
        const copyButton = document.querySelectorAll('.list-modal button')[0];
        copyButton.click();
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Test List');
    });
});
