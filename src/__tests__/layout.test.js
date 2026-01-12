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

    it('should create a new binder', () => {
        startNewBinder(results);
        const binder = results.querySelector('.binder');
        expect(binder).not.toBeNull();
        expect(binder.querySelector('.binder-header')).not.toBeNull();
    });

    it('should create a new section', () => {
        appState.binder = document.createElement('div');
        startNewSection();
        const section = appState.binder.querySelector('.section');
        expect(section).not.toBeNull();
        expect(section.querySelector('.page-header')).not.toBeNull();
        expect(section.querySelector('.grid')).not.toBeNull();
    });
});
