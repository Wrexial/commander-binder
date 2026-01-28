import { getSetting, setSetting } from '../state/cardSettings.js';
import { updateCardStyles } from './cards.js';

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

export function initCardSettings() {
    const sidebar = document.getElementById('sidebar');
    const settingsContainer = document.createElement('div');
    settingsContainer.className = 'sidebar-settings-container';

    const showTooltipToggle = createToggle('showTooltip', ' Show Tooltip', handleShowTooltipChange);
    const persistentRevealToggle = createToggle('persistentReveal', ' Reveal EDHREC links', handlePersistentRevealChange);
    
    settingsContainer.appendChild(showTooltipToggle);
    settingsContainer.appendChild(persistentRevealToggle);
    sidebar.appendChild(settingsContainer);

    // Initial state
    handlePersistentRevealChange(getSetting('persistentReveal'));
    handleShowTooltipChange(getSetting('showTooltip'));
}

