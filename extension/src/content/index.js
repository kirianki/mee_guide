// Content Script — DOM Snapshot Engine + SPA Observer + Shadow DOM Sidebar Mount
import browser from '../shared/browser.js';
import { extractSnapshot } from './snapshot.js';
import { mountSidebar, updateSidebar } from './sidebar-mount.js';
import { showSpotlight, hideSpotlight } from './spotlight.js';

let lastUrl = location.href;
let sidebarMounted = false;
let autoProgressListeners = []; // Cleanup refs

// ── Bootstrap ─────────────────────────────────────────────────────────────────
(async () => {
    const { snapshot, hash } = await extractSnapshot();
    if (!sidebarMounted) {
        mountSidebar();
        sidebarMounted = true;
    }
    browser.runtime.sendMessage({
        type: 'PAGE_LOADED',
        url: location.pathname,
        domain: location.hostname,
        snapshotHash: hash,
        snapshot,
    });
})();

// ── SPA Navigation Detection ──────────────────────────────────────────────────
function debounce(fn, ms) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

const observer = new MutationObserver(debounce(async () => {
    if (location.href !== lastUrl) {
        lastUrl = location.href;
        hideSpotlight();
        clearAutoProgressListeners();

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

// ── Publisher Completion Signal ───────────────────────────────────────────────
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
        // Wire auto-progress for the first step of the first guide
        const guide = message.response?.guides?.[0];
        if (guide?.steps?.length) {
            setupAutoProgress(guide.steps);
        }
    }
    else if (message.type === 'GUIDE_ERROR') {
        updateSidebar({ error: message.error });
    }

    if (message.type === 'HIGHLIGHT_ELEMENT') {
        showSpotlight(message.selector, message.label);
    }
});

// ── Auto-Progress: attach click/input listeners to guide step elements ────────
function setupAutoProgress(steps) {
    clearAutoProgressListeners();
    steps.forEach((step, i) => {
        if (!step.completionSelector && !step.elementSelector) return;
        const sel = step.completionSelector || step.elementSelector;
        try {
            const el = document.querySelector(sel);
            if (!el) return;
            const handler = () => {
                browser.runtime.sendMessage({ type: 'STEP_COMPLETED', stepIndex: i });
                hideSpotlight();
            };
            el.addEventListener('click', handler, { once: true });
            autoProgressListeners.push({ el, handler });
        } catch (_) { }
    });
}

function clearAutoProgressListeners() {
    autoProgressListeners.forEach(({ el, handler }) => {
        try { el.removeEventListener('click', handler); } catch (_) { }
    });
    autoProgressListeners = [];
}

console.log('[WebGuide] Content script v2 loaded.');
