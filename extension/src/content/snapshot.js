// DOM Snapshot Engine
// Extracts a privacy-safe structural snapshot of the current page.
// Runs via requestIdleCallback to avoid blocking the main thread.

import { sha256 } from '../shared/hash.js';

/**
 * Extract a DOM snapshot and return it along with its SHA-256 hash.
 * The hash is used as the primary cache key (never the raw snapshot).
 */
export async function extractSnapshot() {
    return new Promise((resolve) => {
        requestIdleCallback(async () => {
            const snapshot = {
                pageTitle: document.title,
                h1: document.querySelector('h1')?.innerText?.trim() ?? null,
                metaDesc: document.querySelector('meta[name=description]')?.content ?? null,
                urlPath: location.pathname,
                domain: location.hostname,
                formFields: extractFormFields(),
                buttons: extractButtons(),
                headings: extractHeadings(),
                alerts: extractAlerts(),
                navContext: extractNavContext(),
            };

            const json = JSON.stringify(snapshot);
            const hash = await sha256(json);
            resolve({ snapshot, hash });
        }, { timeout: 2000 });
    });
}

function extractFormFields() {
    return Array.from(document.querySelectorAll('input, select, textarea'))
        .filter((el) => !el.closest('[aria-hidden=true]') && el.type !== 'hidden')
        .slice(0, 30) // Hard cap for snapshot size
        .map((el) => ({
            label: getLabel(el),
            type: el.type || el.tagName.toLowerCase(),
            name: el.name || null,
            required: el.required,
            disabled: el.disabled,
            autocomplete: el.autocomplete || null,
            // Never include el.value — privacy rule
        }));
}

function extractButtons() {
    return Array.from(document.querySelectorAll('button, a[href]'))
        .filter((el) => el.innerText?.trim() && !el.closest('nav') && !el.closest('[aria-hidden=true]'))
        .slice(0, 20)
        .map((el) => ({
            text: el.innerText.trim().slice(0, 60),
            ariaLabel: el.getAttribute('aria-label') || null,
            disabled: el.disabled || false,
            type: el.type || null,
        }));
}

function extractHeadings() {
    return Array.from(document.querySelectorAll('h1, h2, h3, h4'))
        .filter((el) => el.innerText?.trim())
        .map((el) => ({ level: parseInt(el.tagName[1]), text: el.innerText.trim().slice(0, 120) }));
}

function extractAlerts() {
    const selector = '[role=alert], [role=status], [aria-live=assertive]';
    return Array.from(document.querySelectorAll(selector))
        .filter((el) => el.innerText?.trim())
        .map((el) => ({ text: el.innerText.trim().slice(0, 200) }));
}

function extractNavContext() {
    const activeStep = document.querySelector(
        '.step.active, [aria-current=step], .wizard-step.current'
    );
    return activeStep ? { activeStepText: activeStep.innerText.trim() } : null;
}

function getLabel(el) {
    if (el.id) {
        const label = document.querySelector(`label[for="${el.id}"]`);
        if (label) return label.innerText.trim();
    }
    const ariaLabel = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby');
    if (ariaLabel) return ariaLabel;
    return el.placeholder || el.name || null;
}
