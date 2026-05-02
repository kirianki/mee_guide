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

    // Recursive search through Shadow DOMs
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

    // Strategy 1: Standard CSS (Deep)
    try {
        const el = deepQuerySelector(document, selector);
        if (el && isVisible(el)) return el;
    } catch (e) { }

    // Strategy 2: AI-standard ":contains" or ":text" patterns
    const cleanText = selector.replace(/.*:contains\(['"](.*?)['"]\).*/, '$1').replace(/.*:text\(['"](.*?)['"]\).*/, '$1').trim();
    const isPseudo = selector.includes(':contains') || selector.includes(':text');
    const searchTerm = (isPseudo ? cleanText : selector).toLowerCase();

    // Strategy 3: Exhaustive Text & Attribute Search (Deep)
    const tags = 'button, a, input, select, textarea, [role="button"], span, div, p, h1, h2, h3, h4, li';
    const elements = deepGetAll(document, tags);
    let bestMatch = null;

    for (const el of elements) {
        if (!isVisible(el)) continue;

        const content = (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') ? (el.value || '') : (el.textContent || '');
        const text = content.trim().toLowerCase();
        const aria = el.getAttribute('aria-label')?.toLowerCase() || '';
        const title = el.getAttribute('title')?.toLowerCase() || '';
        const placeholder = el.getAttribute('placeholder')?.toLowerCase() || '';
        const name = el.getAttribute('name')?.toLowerCase() || '';

        if (text.includes(searchTerm) || aria.includes(searchTerm) || title.includes(searchTerm) || placeholder.includes(searchTerm) || name.includes(searchTerm)) {
            // Find parent interactive container
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
 * @param {string} selector - CSS selector for the target element
 * @param {string} label    - Tooltip text shown near the element
 */
export function showSpotlight(selector, label = 'Perform this action') {
    const target = findTarget(selector);
    if (!target) {
        console.warn('[WebGuide Spotlight] Target not found for:', selector);
        return;
    }

    hideSpotlight(); // Clear any existing spotlight

    // ── Root container ────────────────────────────────────────────────────────
    const root = document.createElement('div');
    root.id = SPOTLIGHT_ID;
    root.style.cssText = `
        position: fixed;
        inset: 0;
        z-index: 2147483646;
        pointer-events: none;
    `;

    // ── Dark overlay (dim = cutout around target) ─────────────────────────────
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.45);
        pointer-events: none;
        transition: opacity 0.3s ease;
    `;

    // ── Glow ring ─────────────────────────────────────────────────────────────
    const ring = document.createElement('div');
    ring.style.cssText = `
        position: fixed;
        border: 2px solid rgba(255,255,255,0.7);
        border-radius: 10px;
        box-shadow: 0 0 0 4px rgba(255,255,255,0.1), 0 0 24px 8px rgba(255,255,255,0.15);
        animation: wg-ring-pulse 1.5s ease-in-out infinite;
        pointer-events: none;
        transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    `;

    // ── Tooltip ───────────────────────────────────────────────────────────────
    const tooltip = document.createElement('div');
    tooltip.style.cssText = `
        position: fixed;
        background: rgba(15, 23, 42, 0.95);
        backdrop-filter: blur(16px);
        border: 1px solid rgba(99, 102, 241, 0.4);
        border-radius: 8px;
        padding: 8px 14px;
        color: #f8fafc;
        font-family: "Inter", system-ui, sans-serif;
        font-size: 13px;
        font-weight: 600;
        white-space: nowrap;
        pointer-events: none;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        gap: 8px;
        animation: wg-fadeIn 0.3s ease-out;
        z-index: 2147483647;
    `;
    tooltip.innerHTML = `<span style="font-size:16px">👆</span> ${label}`;

    // ── Keyframe injection ────────────────────────────────────────────────────
    if (!document.getElementById('wg-spotlight-styles')) {
        const style = document.createElement('style');
        style.id = 'wg-spotlight-styles';
        style.textContent = `
            @keyframes wg-ring-pulse {
                0%, 100% { box-shadow: 0 0 0 4px rgba(99,102,241,0.25), 0 0 24px 8px rgba(99,102,241,0.3); }
                50% { box-shadow: 0 0 0 8px rgba(99,102,241,0.15), 0 0 40px 16px rgba(99,102,241,0.2); }
            }
            @keyframes wg-fadeIn {
                from { opacity: 0; transform: translateY(6px); }
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

    // ── Position ring & tooltip (follows element on scroll/resize via rAF) ────
    function positionElements() {
        const rect = target.getBoundingClientRect();
        const PAD = 6;

        ring.style.left = `${rect.left - PAD}px`;
        ring.style.top = `${rect.top - PAD}px`;
        ring.style.width = `${rect.width + PAD * 2}px`;
        ring.style.height = `${rect.height + PAD * 2}px`;

        // Position tooltip above element, or below if not enough room
        const tooltipH = 40;
        const above = rect.top - PAD - tooltipH - 8;
        const tTop = above > 0 ? above : rect.bottom + PAD + 4;
        tooltip.style.left = `${Math.max(8, rect.left)}px`;
        tooltip.style.top = `${tTop}px`;

        rafHandle = requestAnimationFrame(positionElements);
    }

    positionElements();

    // ── Auto-dismiss after 10s ────────────────────────────────────────────────
    dismissTimer = setTimeout(() => hideSpotlight(), 10000);

    // ── Also dismiss on user click near element ───────────────────────────────
    target.addEventListener('click', () => hideSpotlight(), { once: true });

    // Scroll target into view smoothly
    target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
}

/** Remove the spotlight overlay */
export function hideSpotlight() {
    if (rafHandle) cancelAnimationFrame(rafHandle);
    if (dismissTimer) clearTimeout(dismissTimer);
    currentSpotlight?.root?.remove();
    currentSpotlight?.tooltip?.remove();
    currentSpotlight = null;
}
