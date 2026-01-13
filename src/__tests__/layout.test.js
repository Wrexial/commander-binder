// src/__tests__/layout.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { startNewBinder, startNewSection } from '../layout';
import { appState } from '../appState';

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
});
