// src/__tests__/cardSettings.test.js
/* globals global */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock localStorage
const localStorageMock = (() => {
    let store = {};
    return {
        getItem: vi.fn((key) => store[key] || null),
        setItem: vi.fn((key, value) => {
            store[key] = value.toString();
        }),
        clear: vi.fn(() => {
            store = {};
        }),
    };
})();
Object.defineProperty(global, 'localStorage', { value: localStorageMock });


describe('cardSettings', () => {
    beforeEach(() => {
        localStorageMock.clear();
        vi.resetModules(); // Reset modules to reload cardSettings with fresh localStorage
    });

    it('should load default settings when localStorage is empty', async () => {
        const { cardSettings } = await import('../cardSettings');
        expect(cardSettings.showTooltip).toBe(true);
        expect(cardSettings.persistentReveal).toBe(false);
    });

    it('should load settings from localStorage if they exist', async () => {
        localStorageMock.setItem('cardSettings', JSON.stringify({
            showTooltip: false,
            persistentReveal: true,
        }));
        
        const { cardSettings } = await import('../cardSettings');
        expect(cardSettings.showTooltip).toBe(false);
        expect(cardSettings.persistentReveal).toBe(true);
    });

    it('should merge stored settings with defaults', async () => {
        localStorageMock.setItem('cardSettings', JSON.stringify({
            persistentReveal: true,
        }));
        const { cardSettings } = await import('../cardSettings');
        expect(cardSettings.showTooltip).toBe(true); // From default
        expect(cardSettings.persistentReveal).toBe(true); // From localStorage
    });

    it('saveSettings should store the current settings in localStorage', async () => {
        const { cardSettings, saveSettings } = await import('../cardSettings');
        
        // Modify settings
        cardSettings.showTooltip = false;
        
        saveSettings();
        
        expect(localStorageMock.setItem).toHaveBeenCalledWith(
            'cardSettings',
            JSON.stringify({ showTooltip: false, persistentReveal: false })
        );
    });
});
