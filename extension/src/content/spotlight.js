/**
 * WebGuide — Element Spotlight Engine
 *
 * Injects a visual "spotlight" ring + floating tooltip around the
 * target DOM element a user needs to interact with.
 * Uses position:fixed overlays so it works even with overflow:hidden containers.
 */

const SPOTLIGHT_ID = 'webguide-spotlight-root';

let currentSpotlight = null;
let dismissTimer = null;
let rafHandle = null;

/**
 * Finds the best matching element for a given selector or text.
 * Universal Deep-Search: Penetrates Shadow DOMs and handles non-standard UI.
 */
function findTarget(selector) {
    if (!selector) return null;

    const isVisible = (el) => {
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        const rects = el.getClientRects();
        return rects.length > 0;
    };

    // Strategy 0: Primary Stable ID (Injected data-wg-id)
    if (selector.startsWith('wg-') || selector.includes('[data-wg-id')) {
        const id = selector.startsWith('wg-') ? selector : selector.match(/data-wg-id=["'](.*?)["']/)?.[1] || selector;
        const idSelector = `[data-wg-id="${id}"]`;

        const deepFindId = (root) => {
            let el = root.querySelector(idSelector);
            if (el) return el;
            const hosts = root.querySelectorAll('*');
            for (const h of hosts) {
                if (h.shadowRoot) {
                    el = deepFindId(h.shadowRoot);
                    if (el) return el;
                }
            }
            return null;
        };

        const target = deepFindId(document);
        if (target && isVisible(target)) return target;
    }

    // Strategy 1: Shadow-DOM Aware Query Selector
    const deepQuerySelector = (root, sel) => {
        let match = root.querySelector(sel);
        if (match) return match;
        const hosts = root.querySelectorAll('*');
        for (const host of hosts) {
            if (host.shadowRoot) {
                match = deepQuerySelector(host.shadowRoot, sel);
                if (match) return match;
            }
        }
        return null;
    };

    try {
        const el = deepQuerySelector(document, selector);
        if (el && isVisible(el)) return el;
    } catch (e) { }

    // Strategy 2: Text Search Fallback
    const deepGetAll = (root, tags, results = []) => {
        const found = root.querySelectorAll(tags);
        results.push(...Array.from(found));
        const hosts = root.querySelectorAll('*');
        for (const host of hosts) {
            if (host.shadowRoot) {
                deepGetAll(host.shadowRoot, tags, results);
            }
        }
        return results;
    };

    const cleanText = selector.replace(/.*:contains\(['"]?(.*?)['"]?\).*/, '$1').replace(/.*:text\(['"]?(.*?)['"]?\).*/, '$1').trim();
    const isPseudo = selector.includes(':contains') || selector.includes(':text');
    const searchTerm = (isPseudo ? cleanText : selector).toLowerCase();

    const tags = 'button, a, input, select, textarea, [role="button"], span, div, p, h1, h2, h3, h4, li';
    const elements = deepGetAll(document, tags);
    let bestMatch = null;

    for (const el of elements) {
        if (!isVisible(el)) continue;
        const content = (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') ? (el.value || '') : (el.textContent || '');
        const text = content.trim().toLowerCase();
        if (text.includes(searchTerm)) {
            const interactiveParent = el.closest('button, a, input, select, textarea, [role="button"]');
            if (interactiveParent) return interactiveParent;
            if (['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) || el.getAttribute('role') === 'button') {
                return el;
            }
            if (!bestMatch) bestMatch = el;
        }
    }

    return bestMatch;
}

/**
 * Show a glowing spotlight ring around the element matched by `selector`.
 */
export function showSpotlight(selector, label = 'Perform this action', _attempt = 0) {
    const target = findTarget(selector);

    if (!target) {
        if (_attempt < 15) {
            requestAnimationFrame(() => showSpotlight(selector, label, _attempt + 1));
        } else {
            console.warn('[WebGuide Spotlight] Target not found:', selector);
        }
        return;
    }

    hideSpotlight();

    const root = document.createElement('div');
    root.id = SPOTLIGHT_ID;
    root.style.cssText = `
        position: fixed; inset: 0; z-index: 2147483645; pointer-events: none;
    `;

    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: absolute; inset: 0; background: rgba(0, 0, 0, 0.4); pointer-events: none;
        transition: opacity 0.3s ease;
    `;

    const ring = document.createElement('div');
    ring.style.cssText = `
        position: fixed; border: 3px solid #6366f1; border-radius: 12px;
        box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.2), 0 0 30px 10px rgba(99, 102, 241, 0.3);
        animation: wg-ring-pulse 2s infinite; pointer-events: none;
        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    `;

    const tooltip = document.createElement('div');
    tooltip.style.cssText = `
        position: fixed; background: #0f172a; border: 1px solid rgba(99, 102, 241, 0.4);
        border-radius: 10px; padding: 10px 16px; color: #fff; font-family: sans-serif;
        font-size: 14px; font-weight: 600; white-space: nowrap; pointer-events: none;
        box-shadow: 0 10px 25px rgba(0,0,0,0.4); animation: wg-fadeIn 0.4s ease-out;
        z-index: 2147483647;
    `;
    tooltip.innerHTML = `<span style="margin-right:8px">🎯</span> ${label}`;

    if (!document.getElementById('wg-spotlight-styles')) {
        const style = document.createElement('style');
        style.id = 'wg-spotlight-styles';
        style.textContent = `
            @keyframes wg-ring-pulse {
                0%, 100% { transform: scale(1); opacity: 1; }
                50% { transform: scale(1.04); opacity: 0.8; }
            }
            @keyframes wg-fadeIn {
                from { opacity: 0; transform: translateY(10px); }
                to { opacity: 1; transform: translateY(0); }
            }
        `;
        document.head.appendChild(style);
    }

    root.appendChild(overlay);
    root.appendChild(ring);
    document.body.appendChild(root);
    document.body.appendChild(tooltip);

    currentSpotlight = { root, ring, tooltip, target };

    function positionElements() {
        if (!currentSpotlight) return;
        const rect = target.getBoundingClientRect();
        const PAD = 8;

        ring.style.left = `${rect.left - PAD}px`;
        ring.style.top = `${rect.top - PAD}px`;
        ring.style.width = `${rect.width + PAD * 2}px`;
        ring.style.height = `${rect.height + PAD * 2}px`;

        const tooltipH = 44;
        const above = rect.top - PAD - tooltipH - 12;
        const tTop = above > 20 ? above : rect.bottom + PAD + 12;
        tooltip.style.left = `${Math.max(12, rect.left)}px`;
        tooltip.style.top = `${tTop}px`;

        rafHandle = requestAnimationFrame(positionElements);
    }

    positionElements();
    dismissTimer = setTimeout(() => hideSpotlight(), 15000);
    target.addEventListener('click', () => hideSpotlight(), { once: true });
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

export function hideSpotlight() {
    if (rafHandle) cancelAnimationFrame(rafHandle);
    if (dismissTimer) clearTimeout(dismissTimer);
    currentSpotlight?.root?.remove();
    currentSpotlight?.tooltip?.remove();
    currentSpotlight = null;
}
