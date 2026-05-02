// Content Script — DOM Snapshot Engine + SPA Observer + Shadow DOM Sidebar Mount
import browser from '../shared/browser.js';
import { extractSnapshot } from './snapshot.js';
import { mountSidebar, updateSidebar } from './sidebar-mount.js';

let lastUrl = location.href;
let sidebarMounted = false;

// ── Bootstrap ─────────────────────────────────────────────────────────────────
(async () => {
    const { snapshot, hash } = await extractSnapshot();
    if (!sidebarMounted) {
        mountSidebar();
        sidebarMounted = true;
    }
    // Send full snapshot + hash — background needs snapshot for inference call
    browser.runtime.sendMessage({
        type: 'PAGE_LOADED',
        url: location.pathname,
        domain: location.hostname,
        snapshotHash: hash,
        snapshot,                // full snapshot for inference pipeline
    });
})();

// ── SPA Navigation Detection (Signal 2 — MutationObserver) ───────────────────
function debounce(fn, ms) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

const observer = new MutationObserver(debounce(async () => {
    if (location.href !== lastUrl) {
        lastUrl = location.href;
        const { snapshot, hash } = await extractSnapshot();
        browser.runtime.sendMessage({
            type: 'PAGE_LOADED',
            url: location.pathname,
            domain: location.hostname,
            snapshotHash: hash,
            snapshot,
        });
    }
}, 400));

observer.observe(document.body, { subtree: true, childList: true });

// ── Publisher Completion Signal (Signal 1) ─────────────────────────────────────
document.addEventListener('webguide:step-complete', (e) => {
    browser.runtime.sendMessage({
        type: 'STEP_COMPLETED',
        stepIndex: e.detail?.stepIndex ?? -1,
        stepId: e.detail?.stepId,
    });
});

// ── Receive Guide Response from Background ────────────────────────────────────
browser.runtime.onMessage.addListener((message) => {
    if (message.type === 'GUIDE_RESPONSE') {
        updateSidebar(message.response);
    }
});

console.log('[WebGuide] Content script loaded.');
