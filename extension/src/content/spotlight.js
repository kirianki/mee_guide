/**
 * WebGuide — Element Spotlight Engine v2
 *
 * Improvements over v1:
 *  - ResizeObserver + IntersectionObserver replace the unbounded RAF loop
 *  - Tooltip and ring live inside a single root element — one remove() cleans everything
 *  - Tooltip viewport clamping on both left and right edges
 *  - findTarget text search is scored and ranked (visible + in-viewport preferred)
 *  - Retry uses exponential backoff via setTimeout, not rAF spam
 *  - isVisible imported from snapshot engine (single source of truth)
 *  - SPA navigation auto-dismiss via popstate + pushState/replaceState interception
 *  - Pulse animation runs on a separate ::after layer; ring geometry is written cleanly
 */

import { isVisible } from './snapshot.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const SPOTLIGHT_ROOT_ID = 'webguide-spotlight-root';
const STYLE_TAG_ID = 'webguide-spotlight-styles';
const AUTO_DISMISS_MS = 15000;
const MAX_RETRY_ATTEMPTS = 8;
const RETRY_BASE_MS = 120; // doubles each attempt: 120, 240, 480 … ~30s total

// ─── Module state ─────────────────────────────────────────────────────────────

/** @type {{ root: HTMLElement, ring: HTMLElement, tooltip: HTMLElement, target: Element, cleanup: () => void } | null} */
let currentSpotlight = null;

// ─── SPA Navigation Watcher ───────────────────────────────────────────────────

function patchHistoryMethod(method) {
    const original = history[method];
    history[method] = function (...args) {
        const result = original.apply(this, args);
        window.dispatchEvent(new Event('wg-navigation'));
        return result;
    };
}
patchHistoryMethod('pushState');
patchHistoryMethod('replaceState');
window.addEventListener('popstate', () => hideSpotlight());
window.addEventListener('wg-navigation', () => hideSpotlight());

// ─── Stylesheet injection (once) ─────────────────────────────────────────────

function ensureStyles() {
    if (document.getElementById(STYLE_TAG_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_TAG_ID;
    style.textContent = `
        #${SPOTLIGHT_ROOT_ID} {
            position: fixed; inset: 0; z-index: 2147483645; pointer-events: none;
        }
        #${SPOTLIGHT_ROOT_ID} .wg-overlay {
            position: absolute; inset: 0;
            background: rgba(0,0,0,0.42);
            transition: opacity 0.3s ease;
        }
        #${SPOTLIGHT_ROOT_ID} .wg-ring {
            position: fixed;
            border: 2.5px solid #8b5cf6;
            border-radius: 12px;
            box-shadow: 0 0 0 4px rgba(139,92,246,0.18), 0 0 28px 8px rgba(139,92,246,0.18);
            pointer-events: none;
            transition: left 0.15s ease, top 0.15s ease, width 0.15s ease, height 0.15s ease;
        }
        #${SPOTLIGHT_ROOT_ID} .wg-ring::after {
            content: '';
            position: absolute; inset: -4px;
            border-radius: 14px;
            border: 2px solid rgba(139,92,246,0.45);
            animation: wg-pulse 2s ease-in-out infinite;
        }
        #${SPOTLIGHT_ROOT_ID} .wg-tooltip {
            position: fixed;
            background: #212121;
            border: 1px solid #424242;
            border-radius: 12px;
            padding: 10px 18px;
            color: #ececec;
            font-family: -apple-system, system-ui, sans-serif;
            font-size: 14px;
            font-weight: 500;
            white-space: nowrap;
            pointer-events: none;
            box-shadow: 0 10px 40px rgba(0,0,0,0.5);
            animation: wg-fadeIn 0.25s ease-out forwards;
            display: flex;
            align-items: center;
            gap: 8px;
            max-width: calc(100vw - 24px);
        }
        @keyframes wg-pulse {
            0%, 100% { transform: scale(1);    opacity: 1;   }
            50%       { transform: scale(1.06); opacity: 0.5; }
        }
        @keyframes wg-fadeIn {
            from { opacity: 0; transform: translateY(8px); }
            to   { opacity: 1; transform: translateY(0);   }
        }
    `;
    document.head.appendChild(style);
}

// ─── Positioning ──────────────────────────────────────────────────────────────

const PAD = 8;

function positionSpotlight(ring, tooltip, target) {
    const rect = target.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    ring.style.left = `${rect.left - PAD}px`;
    ring.style.top = `${rect.top - PAD}px`;
    ring.style.width = `${rect.width + PAD * 2}px`;
    ring.style.height = `${rect.height + PAD * 2}px`;

    const tooltipH = tooltip.offsetHeight || 44;
    const tooltipW = tooltip.offsetWidth || 200;
    const above = rect.top - PAD - tooltipH - 10;
    const tTop = above > 20 ? above : rect.bottom + PAD + 10;

    const rawLeft = rect.left;
    const tLeft = Math.min(Math.max(rawLeft, 12), vw - tooltipW - 12);

    tooltip.style.left = `${tLeft}px`;
    tooltip.style.top = `${Math.min(tTop, vh - tooltipH - 12)}px`;
}

// ─── findTarget ───────────────────────────────────────────────────────────────

function deepQuerySelector(root, selector) {
    const match = root.querySelector(selector);
    if (match) return match;
    for (const host of root.querySelectorAll('*')) {
        if (host.shadowRoot) {
            const inner = deepQuerySelector(host.shadowRoot, selector);
            if (inner) return inner;
        }
    }
    return null;
}

function deepQueryAll(root, selector, results = []) {
    root.querySelectorAll(selector).forEach((el) => results.push(el));
    for (const host of root.querySelectorAll('*')) {
        if (host.shadowRoot) deepQueryAll(host.shadowRoot, selector, results);
    }
    return results;
}

function scoreTextMatch(el, searchTerm) {
    let score = 0;
    const INTERACTIVE_TAGS = new Set(['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA']);
    const role = el.getAttribute('role');
    const isInteractive = INTERACTIVE_TAGS.has(el.tagName) || role === 'button' || el.isContentEditable;
    if (isInteractive) score += 4;
    if (isVisible(el)) score += 2;
    const rect = el.getBoundingClientRect();
    const inViewport = rect.top >= 0 && rect.bottom <= window.innerHeight && rect.left >= 0 && rect.right <= window.innerWidth;
    if (inViewport) score += 2;
    const text = getElementText(el).toLowerCase();
    if (text === searchTerm) score += 3;
    else if (text.startsWith(searchTerm)) score += 1;
    if (rect.width * rect.height > 100000) score -= 3;
    return score;
}

function getElementText(el) {
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        return el.value || el.placeholder || el.getAttribute('aria-label') || el.name || '';
    }
    return el.textContent?.trim() ?? '';
}

function findTarget(selector, fallbackSelector) {
    if (!selector && !fallbackSelector) return null;
    const isWgId = selector?.startsWith('wg-') || selector?.includes('[data-wg-id');
    if (isWgId) {
        const id = selector.startsWith('wg-') ? selector : selector.match(/data-wg-id=["'](.*?)["']/)?.[1];
        const idSel = `[data-wg-id="${id}"]`;
        const byId = deepQuerySelector(document, idSel);
        if (byId && isVisible(byId)) return byId;
    }
    const cssSel = fallbackSelector || (!isWgId ? selector : null);
    if (cssSel) {
        try {
            const el = deepQuerySelector(document, cssSel);
            if (el && isVisible(el)) return el;
        } catch (_) { }
    }
    const raw = selector || fallbackSelector || '';
    const pseudoMatch = raw.match(/(?::contains|:text)\(['"]?(.*?)['"]?\)/);
    const searchTerm = (pseudoMatch ? pseudoMatch[1] : raw).toLowerCase().trim();
    if (!searchTerm) return null;
    const SEARCH_TAGS = 'button, a, input, select, textarea, [role="button"], [contenteditable="true"], label, h1, h2, h3, h4, h5, h6';
    const candidates = deepQueryAll(document, SEARCH_TAGS);
    let best = null;
    let bestScore = -Infinity;
    for (const el of candidates) {
        const text = getElementText(el).toLowerCase();
        if (!text.includes(searchTerm)) continue;
        const s = scoreTextMatch(el, searchTerm);
        if (s > bestScore) {
            bestScore = s;
            best = el;
        }
    }
    if (best) {
        const interactive = best.closest('button, a, [role="button"]');
        if (interactive && isVisible(interactive)) return interactive;
    }
    return best;
}

// ─── Core spotlight lifecycle ─────────────────────────────────────────────────

export function hideSpotlight() {
    if (!currentSpotlight) return;
    currentSpotlight.cleanup();
    currentSpotlight.root.remove();
    currentSpotlight = null;
}

export function showSpotlight(selector, fallbackSelector, label = 'Perform this action', _attempt = 0) {
    const target = findTarget(selector, fallbackSelector);
    if (!target) {
        if (_attempt < MAX_RETRY_ATTEMPTS) {
            const delay = RETRY_BASE_MS * Math.pow(2, _attempt);
            setTimeout(() => showSpotlight(selector, fallbackSelector, label, _attempt + 1), delay);
        } else {
            console.warn('[WebGuide] Target not found after retries:', selector);
        }
        return;
    }
    hideSpotlight();
    ensureStyles();
    const root = document.createElement('div');
    root.id = SPOTLIGHT_ROOT_ID;
    const overlay = document.createElement('div');
    overlay.className = 'wg-overlay';
    const ring = document.createElement('div');
    ring.className = 'wg-ring';
    const tooltip = document.createElement('div');
    tooltip.className = 'wg-tooltip';
    tooltip.innerHTML = `<span aria-hidden="true">✨</span><span>${label}</span>`;
    root.appendChild(overlay);
    root.appendChild(ring);
    root.appendChild(tooltip);
    document.body.appendChild(root);
    requestAnimationFrame(() => positionSpotlight(ring, tooltip, target));
    const ro = new ResizeObserver(() => positionSpotlight(ring, tooltip, target));
    ro.observe(target);
    ro.observe(document.documentElement);
    const io = new IntersectionObserver(([entry]) => { root.style.opacity = entry.isIntersecting ? '1' : '0'; }, { threshold: 0 });
    io.observe(target);
    const onScroll = () => positionSpotlight(ring, tooltip, target);
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    const dismissTimer = setTimeout(() => hideSpotlight(), AUTO_DISMISS_MS);
    const onTargetClick = () => hideSpotlight();
    target.addEventListener('click', onTargetClick, { once: true });
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    currentSpotlight = {
        root, ring, tooltip, target,
        cleanup() {
            ro.disconnect();
            io.disconnect();
            clearTimeout(dismissTimer);
            target.removeEventListener('click', onTargetClick);
            window.removeEventListener('scroll', onScroll, { capture: true });
        },
    };
}
