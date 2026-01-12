// config.js
export const VITE_CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
export const binderColors = ['#c84c4c', '#4c8cc8', '#4cc88c', '##c88cc8', '#c8b14c', '#8c4cc8'];
export const CARDS_PER_PAGE = 20;
export const PAGES_PER_BINDER = 64;

// Shared image cache for all modules
export const imageCache = new Map();
