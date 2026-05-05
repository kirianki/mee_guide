// DOM Snapshot Engine v3 (Merged)
// Key improvements:
//   - Per-call ID registry using WeakMap (no ghost IDs across re-renders)
//   - Unified, consistent visibility check
//   - Shadow DOM support in ALL extractors
//   - Smarter label resolution with proximity fallbacks
//   - Markdown extractor: deduplication, region prioritization
//   - Custom Role Support: combobox, listbox, searchbox

import { sha256 } from '../shared/hash.js';

// ─── Configuration ────────────────────────────────────────────────────────────

const OPTIONS = {
    maxFormFields: 50,
    maxButtons: 100,
    maxHeadings: 60,
    maxCategories: 40,
    maxTopLinks: 30,
    maxMarkdownChars: 40000,
    maxStructuredData: 3,
    idleTimeout: 2000,
};

// ─── Session-scoped ID registry ───────────────────────────────────────────────

function createIdRegistry() {
    const map = new WeakMap();
    let counter = 0;
    return {
        get(el) {
            if (!map.has(el)) {
                const id = `wg-${++counter}`;
                map.set(el, id);
                el.setAttribute('data-wg-id', id);
            }
            return map.get(el);
        },
    };
}

// ─── Visibility ───────────────────────────────────────────────────────────────

export function isVisible(el) {
    if (!el || !el.isConnected) return false;

    let node = el;
    while (node && node !== document.documentElement) {
        if (node.nodeType !== Node.ELEMENT_NODE) {
            node = node.parentElement;
            continue;
        }
        const style = window.getComputedStyle(node);
        if (
            style.display === 'none' ||
            style.visibility === 'hidden' ||
            style.opacity === '0' ||
            (style.overflow === 'hidden' && (node.scrollWidth === 0 || node.scrollHeight === 0))
        ) return false;
        node = node.assignedSlot ? node.assignedSlot : node.parentElement;
    }

    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;

    const vw = window.innerWidth || document.documentElement.clientWidth;
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const inViewport = rect.bottom > 0 && rect.right > 0 && rect.top < vh && rect.left < vw;

    return inViewport;
}

// ─── Region detection ─────────────────────────────────────────────────────────

const REGION_MAP = new Map([
    ['header', 'header'], ['nav', 'nav'],
    ['main', 'main'], ['aside', 'sidebar'],
    ['footer', 'footer'],
]);

const REGION_ROLE_MAP = new Map([
    ['banner', 'header'], ['navigation', 'nav'],
    ['main', 'main'], ['complementary', 'sidebar'],
    ['contentinfo', 'footer'],
]);

function getRegion(el) {
    const ancestor = el.closest('header, nav, main, aside, footer, [role]');
    if (!ancestor) return 'content';
    const tag = ancestor.tagName.toLowerCase();
    const role = ancestor.getAttribute('role') ?? '';
    return REGION_MAP.get(tag) ?? REGION_ROLE_MAP.get(role) ?? 'content';
}

function getModalAncestor(el) {
    return el.closest('[role="dialog"], [role="alertdialog"], [aria-modal="true"], .modal, .popup, .dialog, .overlay');
}

// ─── Shadow DOM aware querySelectorAll ───────────────────────────────────────

function deepQueryAll(root, selector) {
    const results = [];
    function walk(node) {
        node.querySelectorAll(selector).forEach((el) => results.push(el));
        node.querySelectorAll('*').forEach((el) => {
            if (el.shadowRoot) walk(el.shadowRoot);
        });
    }
    walk(root);
    return results;
}

// ─── Label resolution ─────────────────────────────────────────────────────────

function resolveLabel(el) {
    if (el.id) {
        const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (label) return label.innerText.trim();
    }

    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
        const text = labelledBy
            .split(/\s+/)
            .map((id) => document.getElementById(id)?.innerText?.trim())
            .filter(Boolean)
            .join(' ');
        if (text) return text;
    }

    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel.trim();

    const wrappingLabel = el.closest('label');
    if (wrappingLabel) {
        const clone = wrappingLabel.cloneNode(true);
        clone.querySelectorAll('input, select, textarea').forEach((i) => i.remove());
        const text = clone.innerText.trim();
        if (text && text.length < 80) return text;
    }

    const prev = el.previousElementSibling;
    if (prev && ['label', 'span', 'p', 'div'].includes(prev.tagName.toLowerCase())) {
        const text = prev.innerText?.trim();
        if (text && text.length < 60) return text;
    }

    return el.placeholder || el.name || el.getAttribute('data-placeholder') || null;
}

// ─── Extractors ───────────────────────────────────────────────────────────────

function extractFormFields(ids) {
    return deepQueryAll(document, 'input, select, textarea, [role="combobox"], [role="listbox"], [role="searchbox"]')
        .filter((el) => el.type !== 'hidden' && !el.closest('[aria-hidden="true"]'))
        .slice(0, OPTIONS.maxFormFields)
        .map((el) => ({
            wgId: ids.get(el),
            label: resolveLabel(el),
            placeholder: el.placeholder || el.getAttribute('data-placeholder') || null,
            type: el.getAttribute('role') || el.type || el.tagName.toLowerCase(),
            name: el.name || null,
            value: el.type === 'password' ? null : (el.value?.trim().slice(0, 100) || null),
            required: el.required || el.getAttribute('aria-required') === 'true',
            region: getRegion(el),
            visible: isVisible(el),
            inModal: !!getModalAncestor(el),
        }));
}

function extractButtons(ids) {
    return deepQueryAll(document, 'button, a[href], [role="button"], [role="link"], [contenteditable="true"], [aria-haspopup="listbox"]')
        .filter((el) => {
            const text = el.innerText?.trim();
            const hasAria = el.getAttribute('aria-label') || el.getAttribute('title');
            return (text || hasAria || el.isContentEditable) && !el.closest('[aria-hidden="true"]');
        })
        .slice(0, OPTIONS.maxButtons)
        .map((el) => {
            const label = (el.innerText?.trim() || el.getAttribute('aria-label') || el.getAttribute('title') || '').slice(0, 80);
            return {
                wgId: ids.get(el),
                text: label,
                disabled: el.disabled || el.getAttribute('aria-disabled') === 'true',
                region: getRegion(el),
                visible: isVisible(el),
                inModal: !!getModalAncestor(el),
                href: el.href || null,
            };
        });
}

function extractHeadings(ids) {
    return deepQueryAll(document, 'h1, h2, h3, h4')
        .filter((el) => el.innerText?.trim())
        .slice(0, OPTIONS.maxHeadings)
        .map((el) => ({
            wgId: ids.get(el),
            level: parseInt(el.tagName[1]),
            text: el.innerText.trim().slice(0, 120),
            region: getRegion(el),
            visible: isVisible(el),
            inModal: !!getModalAncestor(el),
        }));
}

function extractAlerts(ids) {
    return deepQueryAll(document, '[role="alert"], [role="status"], [aria-live="assertive"]')
        .filter((el) => el.innerText?.trim())
        .map((el) => ({
            wgId: ids.get(el),
            text: el.innerText.trim().slice(0, 200),
        }));
}

function extractNavContext(ids) {
    const activeStep = document.querySelector('.step.active, [aria-current="step"], .wizard-step.current');
    return activeStep
        ? { wgId: ids.get(activeStep), activeStepText: activeStep.innerText.trim() }
        : null;
}

function extractCategories(ids) {
    const STRONG_SELECTORS = ['nav a', '[role="navigation"] a', '[aria-label*="categor" i] a', '[aria-label*="menu" i] a', 'aside a'];
    const WEAK_SELECTORS = ['[class*="categor"] a', '[class*="sidebar"] a', '[class*="menu"] a', 'ul.categories li a'];

    function score(el) {
        let s = 0;
        if (el.closest('nav') || el.closest('[role="navigation"]')) s += 3;
        if (el.closest('aside')) s += 2;
        if (el.href && !el.href.startsWith('javascript:')) s += 1;
        const text = el.innerText?.trim() ?? '';
        if (text.length > 2 && text.length < 50) s += 1;
        if (isVisible(el)) s += 1;
        return s;
    }

    const all = [...deepQueryAll(document, STRONG_SELECTORS.join(', ')), ...deepQueryAll(document, WEAK_SELECTORS.join(', '))];
    const seen = new Set();

    return all
        .map((el) => ({ el, score: score(el) }))
        .filter(({ el, score: s }) => {
            const text = el.innerText?.trim();
            if (!text || s < 3 || seen.has(text)) return false;
            seen.add(text);
            return true;
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, OPTIONS.maxCategories)
        .map(({ el }) => ({
            wgId: ids.get(el),
            text: el.innerText.trim(),
            href: el.href || null,
        }));
}

function extractTopLinks(ids) {
    const seen = new Set();
    return deepQueryAll(document, 'a[href]')
        .filter((el) => {
            const text = el.innerText?.trim();
            return (
                text && text.length > 2 && text.length < 80 &&
                !el.closest('nav') && !el.closest('header') && !el.closest('footer') &&
                !seen.has(text) && seen.add(text)
            );
        })
        .slice(0, OPTIONS.maxTopLinks)
        .map((el) => ({
            wgId: ids.get(el),
            text: el.innerText.trim(),
            href: el.href || null,
        }));
}

function extractSearchContext(ids) {
    const search =
        deepQueryAll(document, 'input[type="search"]')[0] ||
        deepQueryAll(document, ['input[placeholder*="search" i]', 'input[aria-label*="search" i]', 'input[name*="search" i]', '[role="searchbox"]'].join(', '))[0] ||
        deepQueryAll(document, '[role="search"] input, .search-container input')[0];

    return search
        ? { wgId: ids.get(search), placeholder: search.placeholder || null, label: resolveLabel(search) }
        : null;
}

function extractStructuredData() {
    return Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
        .slice(0, OPTIONS.maxStructuredData)
        .map((el) => { try { return JSON.parse(el.textContent); } catch { return null; } })
        .filter(Boolean);
}

function extractOpenGraph() {
    const og = {};
    document.querySelectorAll('meta[property^="og:"]').forEach((m) => {
        og[m.getAttribute('property').replace('og:', '')] = m.content;
    });
    return Object.keys(og).length ? og : null;
}

// ─── Structured Markdown v3 ───────────────────────────────────────────────────

function extractStructuredMarkdown(ids) {
    const MAX = OPTIONS.maxMarkdownChars;
    const seen = new Set();
    let out = '';

    const SKIP_TAGS = new Set(['script', 'style', 'noscript', 'svg', 'canvas', 'video', 'audio', 'iframe']);
    const INTERACTIVE = new Set(['a', 'button', 'input', 'select', 'textarea']);

    const regionRoots = [
        document.querySelector('main, [role="main"]'),
        document.querySelector('article'),
        document.querySelector('[role="dialog"], [aria-modal="true"]'),
        document.querySelector('aside, [role="complementary"]'),
        document.querySelector('header, [role="banner"]'),
        document.querySelector('nav, [role="navigation"]'),
        document.querySelector('footer, [role="contentinfo"]'),
        document.body,
    ].filter(Boolean);

    const walkedRoots = new Set();
    function emit(text) { if (out.length < MAX) out += text; }

    function walk(node) {
        if (out.length >= MAX || !node) return;
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent.replace(/\s+/g, ' ').trim();
            if (text) emit(text + ' ');
            return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;

        const tag = node.tagName.toLowerCase();
        const role = node.getAttribute('role') || '';
        if (SKIP_TAGS.has(tag)) return;
        if (node.getAttribute('aria-hidden') === 'true') return;

        const interactive = INTERACTIVE.has(tag) || role === 'button' || role === 'link' || node.isContentEditable || ['combobox', 'listbox', 'searchbox'].includes(role) || node.getAttribute('aria-haspopup');
        if (!interactive && !isVisible(node)) return;

        if (!interactive) {
            const text = node.innerText?.trim().slice(0, 60);
            if (text && seen.has(text)) return;
            if (text && text.length > 10) seen.add(text);
        }

        if (['header', 'nav', 'main', 'footer', 'aside', 'section', 'article'].includes(tag)) emit(`\n\n--- [${tag}] ---\n`);
        else if (/^h[1-6]$/.test(tag)) emit('\n\n' + '#'.repeat(parseInt(tag[1])) + ' ');
        else if (tag === 'p') emit('\n\n');
        else if (tag === 'li') emit('\n- ');
        else if (tag === 'br') { emit('\n'); return; }

        if (tag === 'a' || tag === 'button' || role === 'button' || role === 'link' || node.getAttribute('aria-haspopup')) {
            const label = (node.innerText?.trim() || node.getAttribute('aria-label') || node.getAttribute('title') || '').slice(0, 60);
            const wgId = ids.get(node);
            const type = tag === 'a' || role === 'link' ? 'Link' : 'Button';
            const vis = isVisible(node) ? '' : 'OFF-SCREEN:';
            emit(` [${vis}${type}:${label}](${wgId}) `);
            return;
        }

        if (['input', 'select', 'textarea'].includes(tag) || node.isContentEditable || ['combobox', 'listbox', 'searchbox'].includes(role)) {
            const wgId = ids.get(node);
            const rType = role || node.getAttribute('type') || tag;
            const label = resolveLabel(node) || '';
            const ph = node.placeholder || node.getAttribute('data-placeholder') || '';
            const kind = node.isContentEditable ? 'RichText' : (tag === 'select' || role === 'combobox' || role === 'listbox' ? 'Select' : 'Input');
            const vis = isVisible(node) ? '' : 'OFF-SCREEN:';
            emit(` [${vis}${kind}:${[label, ph, rType].filter(Boolean).join('/')}](${wgId}) `);
            return;
        }

        if (node.shadowRoot) walk(node.shadowRoot);
        for (const child of node.childNodes) walk(child);
        if (['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'section', 'article', 'header', 'nav', 'main', 'footer', 'aside'].includes(tag)) emit('\n');
    }

    for (const root of regionRoots) {
        if (walkedRoots.has(root)) continue;
        walkedRoots.add(root);
        walk(root);
        root.querySelectorAll('*').forEach((el) => walkedRoots.add(el));
    }
    return out.trim().replace(/\n{3,}/g, '\n\n').slice(0, MAX);
}

// ─── Main export ──────────────────────────────────────────────────────────────

let _lastHash = null;

export async function extractSnapshot({ diff = true, markdown = true } = {}) {
    return new Promise((resolve) => {
        requestIdleCallback(async () => {
            const ids = createIdRegistry();
            const snapshot = {
                pageTitle: document.title,
                h1: document.querySelector('h1')?.innerText?.trim() ?? null,
                metaDesc: document.querySelector('meta[name="description"]')?.content ?? null,
                openGraph: extractOpenGraph(),
                urlPath: location.pathname,
                domain: location.hostname,
                formFields: extractFormFields(ids),
                buttons: extractButtons(ids),
                headings: extractHeadings(ids),
                alerts: extractAlerts(ids),
                navContext: extractNavContext(ids),
                categories: extractCategories(ids),
                topLinks: extractTopLinks(ids),
                searchContext: extractSearchContext(ids),
                structuredData: extractStructuredData(),
                activeModalDetected: !!deepQueryAll(document, '[role="dialog"], [role="alertdialog"], [aria-modal="true"]')[0],
                pageMarkdown: markdown ? extractStructuredMarkdown(ids) : null,
            };

            const json = JSON.stringify(snapshot);
            const hash = await sha256(json);
            if (diff && hash === _lastHash) {
                resolve(null);
                return;
            }
            _lastHash = hash;
            resolve({ snapshot, hash });
        }, { timeout: OPTIONS.idleTimeout });
    });
}

export async function pollSnapshot() {
    return extractSnapshot({ diff: true, markdown: false });
}
