// DOM Snapshot Engine v2
// Extracts a richer, privacy-safe structural snapshot for deeper AI intent analysis.
// Runs via requestIdleCallback to avoid blocking the main thread.

import { sha256 } from '../shared/hash.js';

/**
 * Extract a DOM snapshot and return it along with its SHA-256 hash.
 */
export async function extractSnapshot() {
    return new Promise((resolve) => {
        requestIdleCallback(async () => {
            const snapshot = {
                pageTitle: document.title,
                h1: document.querySelector('h1')?.innerText?.trim() ?? null,
                metaDesc: document.querySelector('meta[name=description]')?.content ?? null,
                openGraph: extractOpenGraph(),
                urlPath: location.pathname,
                domain: location.hostname,
                formFields: extractFormFields(),
                buttons: extractButtons(),
                headings: extractHeadings(),
                alerts: extractAlerts(),
                navContext: extractNavContext(),
                activeModalDetected: !!document.querySelector('[role="dialog"], [role="alertdialog"], [aria-modal="true"], .modal, .popup, .dialog'),
                // New v2 fields:
                categories: extractCategories(),
                topLinks: extractTopLinks(),
                searchContext: extractSearchContext(),
                structuredData: extractStructuredData(),
                pageMarkdown: extractStructuredMarkdown(document.body),
            };

            const json = JSON.stringify(snapshot);
            const hash = await sha256(json);
            resolve({ snapshot, hash });
        }, { timeout: 2000 });
    });
}


let idCounter = 0;

/**
 * Assigns a unique, temporary ID to a DOM element and returns it.
 */
function getTargetId(el) {
    if (!el.hasAttribute('data-wg-id')) {
        el.setAttribute('data-wg-id', `wg-${++idCounter}`);
    }
    return el.getAttribute('data-wg-id');
}

function getElementContext(el) {
    const parent = el.closest('header, nav, aside, main, footer, [role="banner"], [role="navigation"], [role="main"], [role="complementary"], [role="contentinfo"]');
    const modal = el.closest('[role="dialog"], [role="alertdialog"], [aria-modal="true"], .modal, .popup, .dialog, .overlay');

    let region = 'content';
    if (parent) {
        const tag = parent.tagName.toLowerCase();
        const role = parent.getAttribute('role');
        if (tag === 'header' || role === 'banner') region = 'header';
        else if (tag === 'nav' || role === 'navigation') region = 'nav';
        else if (tag === 'aside' || role === 'complementary') region = 'sidebar';
        else if (tag === 'main' || role === 'main') region = 'main';
        else if (tag === 'footer' || role === 'contentinfo') region = 'footer';
    }

    // Viewport check
    const rect = el.getBoundingClientRect();
    const visible = (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );

    return { region, visible, inModal: !!modal };
}

function extractFormFields() {
    return Array.from(document.querySelectorAll('input, select, textarea'))
        .filter((el) => !el.closest('[aria-hidden=true]') && el.type !== 'hidden')
        .slice(0, 50)
        .map((el) => {
            const ctx = getElementContext(el);
            return {
                wgId: getTargetId(el),
                label: getLabel(el),
                placeholder: el.placeholder || null,
                type: el.type || el.tagName.toLowerCase(),
                name: el.name || null,
                region: ctx.region,
                visible: ctx.visible,
                inModal: ctx.inModal,
            };
        });
}

function extractButtons() {
    return Array.from(document.querySelectorAll('button, a[href], [role="button"], [contenteditable="true"]'))
        .filter((el) => {
            const hasText = el.innerText?.trim();
            const hasAria = el.getAttribute('aria-label') || el.getAttribute('title') || el.placeholder;
            return (hasText || hasAria || el.isContentEditable) && !el.closest('[aria-hidden=true]');
        })
        .slice(0, 100)
        .map((el) => {
            const ctx = getElementContext(el);
            return {
                wgId: getTargetId(el),
                text: el.innerText.trim().slice(0, 80) || el.getAttribute('aria-label') || el.getAttribute('title'),
                region: ctx.region,
                visible: ctx.visible,
                inModal: ctx.inModal,
                href: el.href || null,
            };
        });
}

function extractHeadings() {
    return Array.from(document.querySelectorAll('h1, h2, h3, h4'))
        .filter((el) => el.innerText?.trim())
        .slice(0, 60)
        .map((el) => {
            const ctx = getElementContext(el);
            return {
                wgId: getTargetId(el),
                level: parseInt(el.tagName[1]),
                text: el.innerText.trim().slice(0, 120),
                region: ctx.region,
                visible: ctx.visible,
                inModal: ctx.inModal,
            };
        });
}

// ... (rest of the file remains as is, but using the new region logic for consistency if possible)

function extractAlerts() {
    const selector = '[role=alert], [role=status], [aria-live=assertive]';
    return Array.from(document.querySelectorAll(selector))
        .filter((el) => el.innerText?.trim())
        .map((el) => ({
            wgId: getTargetId(el),
            text: el.innerText.trim().slice(0, 200)
        }));
}

function extractNavContext() {
    const activeStep = document.querySelector(
        '.step.active, [aria-current=step], .wizard-step.current'
    );
    return activeStep ? { wgId: getTargetId(activeStep), activeStepText: activeStep.innerText.trim() } : null;
}

/** Extract navigational category items (sidebar menus, category lists) */
function extractCategories() {
    const candidates = Array.from(document.querySelectorAll(
        'nav a, aside a, [class*="categor"] a, [class*="menu"] a, [role="navigation"] a, ul.categories li, .sidebar a'
    ));
    const seen = new Set();
    return candidates
        .filter((el) => {
            const text = el.innerText?.trim();
            return text && text.length > 1 && text.length < 60 && !seen.has(text) && seen.add(text);
        })
        .slice(0, 40)
        .map((el) => ({
            wgId: getTargetId(el),
            text: el.innerText.trim(),
            href: el.href || null
        }));
}

/** Extract the most prominent non-nav links with meaningful text */
function extractTopLinks() {
    const seen = new Set();
    return Array.from(document.querySelectorAll('a[href]'))
        .filter((el) => {
            const text = el.innerText?.trim();
            return text && text.length > 2 && text.length < 80
                && !el.closest('nav') && !el.closest('header') && !el.closest('footer')
                && !seen.has(text) && seen.add(text);
        })
        .slice(0, 30)
        .map((el) => ({
            wgId: getTargetId(el),
            text: el.innerText.trim(),
            href: el.href || null
        }));
}

/** Extract the main search bar's placeholder / label as context */
function extractSearchContext() {
    const search = document.querySelector(
        'input[type=search], input[placeholder*="search" i], input[aria-label*="search" i], input[name*="search" i], input[role="searchbox"], [id*="search" i][tag="input"]'
    ) || document.querySelector('[role="search"] input, .search-container input, .search-box input');
    return search ? {
        wgId: getTargetId(search),
        placeholder: search.placeholder || null,
        label: getLabel(search),
    } : null;
}

/** Extract JSON-LD structured data (e.g., Product, BreadcrumbList) */
function extractStructuredData() {
    return Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
        .slice(0, 3)
        .map((el) => {
            try { return JSON.parse(el.innerText); }
            catch { return null; }
        })
        .filter(Boolean);
}

/** Extract DOM as structured Markdown focusing on visibility, interactions and region context */
function extractStructuredMarkdown(rootNode) {
    if (!rootNode) return '';
    let markdown = '';
    let charCount = 0;
    const MAX_CHARS = 40000;

    function walk(node) {
        if (charCount > MAX_CHARS) return;

        // Ensure we only process Element or Text nodes
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent.replace(/\s+/g, ' ');
            if (text.trim()) {
                markdown += text;
                charCount += text.length;
            }
            return;
        }

        if (node.nodeType !== Node.ELEMENT_NODE) return;

        // Skip ignored tags
        const tag = node.tagName.toLowerCase();
        if (['script', 'style', 'noscript', 'svg', 'canvas', 'video', 'audio', 'iframe'].includes(tag)) return;
        if (node.hasAttribute('aria-hidden') && node.getAttribute('aria-hidden') === 'true') return;

        // Visibility check (only run if element is attached)
        if (node.isConnected && node.nodeType === Node.ELEMENT_NODE) {
            const style = window.getComputedStyle(node);
            const isInteractive = ['a', 'button', 'input', 'select', 'textarea'].includes(tag) || node.getAttribute('role') === 'button' || node.isContentEditable;

            // If it's display: none, it's definitely hidden.
            if (style.display === 'none' || style.visibility === 'hidden') return;

            // For non-interactive things, opacity: 0 also marks it as hidden.
            if (!isInteractive && style.opacity === '0') return;
        }

        let prefix = '';
        let suffix = '';
        let isBlock = false;

        if (['header', 'nav', 'main', 'footer', 'aside'].includes(tag)) {
            prefix = `\n\n--- [Region: ${tag}] ---\n`;
            suffix = '\n\n';
            isBlock = true;
        } else if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
            const level = parseInt(tag[1]);
            prefix = '\n\n' + '#'.repeat(level) + ' ';
            suffix = '\n\n';
            isBlock = true;
        } else if (tag === 'p' || tag === 'div') {
            prefix = '\n';
            suffix = '\n';
            isBlock = true;
            // For div, only add newlines if it's acting as a block container, which it is by default. But too many empty divs can cause gaps.
            // The newline normalization at the end handles most of it.
        } else if (tag === 'ul' || tag === 'ol') {
            prefix = '\n';
            suffix = '\n';
            isBlock = true;
        } else if (tag === 'li') {
            prefix = '\n- ';
            suffix = '';
            isBlock = true;
        } else if (tag === 'br') {
            markdown += '\n';
            return;
        } else if (tag === 'a' || tag === 'button' || node.getAttribute('role') === 'button' || node.getAttribute('role') === 'link' || node.getAttribute('aria-haspopup')) {
            const role = node.getAttribute('role') || (tag === 'a' ? 'Link' : 'Button');
            const label = node.getAttribute('aria-label') || node.getAttribute('title') || node.innerText?.trim()?.slice(0, 50) || '';
            const rect = node.getBoundingClientRect();
            const isOffScreen = rect.top < 0 || rect.bottom > window.innerHeight;
            prefix = ` [${isOffScreen ? 'OFF-SCREEN ' : ''}${role}${label ? ': ' + label : ''}: `;
            const wgId = getTargetId(node);
            suffix = `](${wgId}) `;
        } else if (tag === 'input' || tag === 'select' || tag === 'textarea' || node.isContentEditable || ['combobox', 'listbox', 'searchbox'].includes(node.getAttribute('role'))) {
            const wgId = getTargetId(node);
            const type = node.getAttribute('type') || node.getAttribute('role') || tag;
            const label = getLabel(node);
            const placeholder = node.placeholder || node.getAttribute('data-placeholder');
            const context = [label, placeholder, node.name, type].filter(Boolean).join(' / ');
            const role = node.isContentEditable ? 'RichText' : (tag === 'textarea' ? 'Textarea' : (['combobox', 'listbox'].includes(node.getAttribute('role')) || tag === 'select' ? 'Select' : 'Input'));
            markdown += ` [${role}: ${context}](${wgId}) `;
            charCount += context.length + 20;
            return;
        }

        if (prefix) {
            markdown += prefix;
            charCount += prefix.length;
        }

        // Shadow DOM traversal
        if (node.shadowRoot) {
            walk(node.shadowRoot);
        }

        // Child traversal
        for (const child of node.childNodes) {
            walk(child);
        }

        if (suffix) {
            markdown += suffix;
            charCount += suffix.length;
        }
    }

    walk(rootNode);
    return markdown.trim().replace(/\n{3,}/g, '\n\n').slice(0, MAX_CHARS);
}

/** Extract Open Graph meta tags */
function extractOpenGraph() {
    const og = {};
    document.querySelectorAll('meta[property^="og:"]').forEach((m) => {
        const key = m.getAttribute('property').replace('og:', '');
        og[key] = m.content;
    });
    return Object.keys(og).length ? og : null;
}

function getLabel(el) {
    if (el.id) {
        const label = document.querySelector(`label[for="${el.id}"]`);
        if (label) return label.innerText.trim();
    }
    const ariaLabel = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby');
    if (ariaLabel) return ariaLabel;

    // Proximity search for labels (common in custom SPAs)
    const container = el.parentElement;
    if (container) {
        const text = container.innerText.replace(el.innerText, '').trim();
        if (text && text.length < 50) return text;
    }

    return el.placeholder || el.name || el.getAttribute('data-placeholder') || null;
}
