// src/__tests__/layout.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { startNewBinder, startNewSection } from '../layout';
import { appState } from '../appState';
import * as modal from '../ui/modal.js';
import * as cardState from '../cardState.js';

vi.mock('../ui/modal.js');
vi.mock('../cardState.js');

vi.mock('../appState', () => ({
    appState: {
        count: 0,
        binder: null,
        section: null,
        grid: null,
    },
}));

// Mock getComputedStyle
global.getComputedStyle = vi.fn(() => ({
    getPropertyValue: () => '',
}));

describe('layout', () => {
    let results;

    beforeEach(() => {
        results = document.createElement('div');
        results.id = 'results';
        document.body.appendChild(results);
    });

    describe('startNewBinder', () => {
        it('should create a new binder', () => {
            startNewBinder(results);
            const binder = results.querySelector('.binder');
            expect(binder).not.toBeNull();
            expect(binder.querySelector('.binder-header')).not.toBeNull();
        });

        it('should set the binder color', () => {
            startNewBinder(results);
            const binder = results.querySelector('.binder');
            expect(binder.style.borderColor).not.toBe('');
        });

        it('should add a header to the binder', () => {
            startNewBinder(results);
            const header = results.querySelector('.binder-header');
            expect(header).not.toBeNull();
            expect(header.textContent).toContain('Binder 1');
        });

        it('should create an export button', () => {
            startNewBinder(results);
            const button = results.querySelector('.export-missing-button');
            expect(button).not.toBeNull();
            expect(button.textContent).toBe('Export Missing');
        });
    });

    describe('startNewSection', () => {
        beforeEach(() => {
            appState.binder = document.createElement('div');
            appState.binder.querySelectorAll = () => [];
        });

        it('should create a new section', () => {
            startNewSection();
            const section = appState.binder.querySelector('.section');
            expect(section).not.toBeNull();
            expect(section.querySelector('.page-header')).not.toBeNull();
            expect(section.querySelector('.grid')).not.toBeNull();
        });

        it('should add a header to the section', () => {
            startNewSection();
            const header = appState.binder.querySelector('.page-header');
            expect(header).not.toBeNull();
            expect(header.textContent).toContain('Page 1');
        });

        it('should add set codes to the header', () => {
            const pageSets = new Map([
                ['dom', { name: 'Dominaria' }],
                ['m21', { name: 'Core Set 2021' }],
            ]);
            document.body.innerHTML = '<div id="set-tooltip"></div>';
            startNewSection(pageSets);
            const header = appState.binder.querySelector('.page-header');
            expect(header.textContent).toContain('DOM, M21');
        });
    });

    describe('Export Missing Feature', () => {
        let binder;
        beforeEach(() => {
            startNewBinder(results);
            binder = results.querySelector('.binder');

            // Create some cards
            for (let i = 0; i < 5; i++) {
                const card = document.createElement('div');
                card.className = 'card';
                card.cardData = { id: `card-${i}`, name: `Card ${i}` };
                binder.appendChild(card);
            }
        });

        it('should show an alert if no cards are missing', () => {
            const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
            cardState.isCardMissing.mockReturnValue(false);
            
            binder.querySelector('.export-missing-button').click();
            
            expect(alertSpy).toHaveBeenCalledWith('No missing cards in this binder.');
            alertSpy.mockRestore();
        });

        it('should show a modal with a chunked list of missing cards', () => {
            const modalSpy = vi.spyOn(modal, 'showListModal');
            cardState.isCardMissing.mockImplementation(card => card.id !== 'card-2'); // All but one are missing
            
            binder.querySelector('.export-missing-button').click();
            
            const expectedList = [
                '--- Missing Cards (1-4) ---',
                'Card 0',
                'Card 1',
                'Card 3',
                'Card 4',
            ].join('\n');
            expect(modalSpy).toHaveBeenCalledWith('Missing Cards', expectedList.trim());
            modalSpy.mockRestore();
        });
    });
});
