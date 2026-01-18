// src/data.js
import { showToast } from './ui/toast.js';

let allCardsData = null;

export async function fetchJsonData() {
    if (allCardsData) {
        return allCardsData;
    }
    try {
        const response = await fetch('/all-pages.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        allCardsData = await response.json();
        return allCardsData;
    } catch (error)
    {
        showToast("Failed to load card data. Some features may not work.", "error");
        return null;
    }
}
