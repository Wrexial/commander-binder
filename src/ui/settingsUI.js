import { getSetting, setSetting } from '../state/cardSettings.js';
import { updateCardStyles, applyDisplayMode } from './cards.js';

function createToggle(setting, labelText, onChange) {
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.setting = setting;
    checkbox.checked = getSetting(setting);
    
    checkbox.addEventListener('change', (e) => {
        const { checked } = e.target;
        setSetting(setting, checked);
        if (onChange) {
            onChange(checked);
        }
    });
    
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(labelText));
    return label;
}

function handlePersistentRevealChange(value) {
    document.body.classList.toggle('reveal-links', value);
    updateCardStyles();
}

function handleShowTooltipChange(value) {
    document.body.classList.toggle('reveal-links', value);
    updateCardStyles();
}

function handleDisplayModeChange(value) {
    document.body.classList.toggle('images-mode', value === 'images');
    applyDisplayMode();
}

/**
 * The display-mode control stores a string ('text' | 'images'), so it needs its
 * own checkbox rather than the boolean helper above.
 */
function createDisplayModeToggle() {
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.setting = 'displayMode';
    checkbox.checked = getSetting('displayMode') === 'images';

    checkbox.addEventListener('change', (e) => {
        const mode = e.target.checked ? 'images' : 'text';
        setSetting('displayMode', mode);
        handleDisplayModeChange(mode);
    });

    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(' Show card images'));
    return label;
}

export function initCardSettings() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    const settingsContainer = document.createElement('div');
    settingsContainer.className = 'sidebar-settings-container';

    const showTooltipToggle = createToggle('showTooltip', ' Show Tooltip', handleShowTooltipChange);
    const persistentRevealToggle = createToggle('persistentReveal', ' Reveal EDHREC links', handlePersistentRevealChange);
    const displayModeToggle = createDisplayModeToggle();
    
    settingsContainer.appendChild(showTooltipToggle);
    settingsContainer.appendChild(persistentRevealToggle);
    settingsContainer.appendChild(displayModeToggle);
    sidebar.appendChild(settingsContainer);

    // Initial state
    handlePersistentRevealChange(getSetting('persistentReveal'));
    handleShowTooltipChange(getSetting('showTooltip'));
    handleDisplayModeChange(getSetting('displayMode'));
}
