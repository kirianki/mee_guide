import browser from '../shared/browser.js';

// Popup script — minimal, just shows extension status
browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
    if (!tab) return;
    console.log('[WebGuide Popup] Active tab:', tab.url);
});
