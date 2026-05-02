// Background Service Worker — proxies all API calls, manages tab state
import browser from '../shared/browser.js';

// ── Config ────────────────────────────────────────────────────────────────────
const API_BASE = typeof __API_BASE__ !== 'undefined' ? __API_BASE__ : 'http://localhost/v1';

// ── In-memory L1 tab state ────────────────────────────────────────────────────
const tabState = new Map();

// ── Message Router ────────────────────────────────────────────────────────────
browser.runtime.onMessage.addListener((message, sender) => {
    const { type, ...payload } = message;
    const tabId = sender.tab ? sender.tab.id : null;

    if (type === 'PAGE_LOADED') handlePageLoaded(tabId, payload);
    else if (type === 'PAGE_NAVIGATED') handlePageNavigated(tabId, payload);
    else if (type === 'STEP_COMPLETED') handleStepCompleted(tabId, payload);
    else if (type === 'CHAT_MESSAGE') handleChatMessage(tabId, payload);
    else console.warn('[WebGuide BG] Unknown message type:', type);
});

async function handlePageLoaded(tabId, { url, domain, snapshotHash, snapshot }) {
    // L1 cache — same snapshot hash means page hasn't changed
    const cached = tabState.get(tabId);
    if (cached && cached.snapshotHash === snapshotHash && cached.response) {
        sendToTab(tabId, { type: 'GUIDE_RESPONSE', response: cached.response });
        return;
    }

    // Step 1: Guide Registry (Redis → publisher guide → SII exact)
    let response = await fetchGuides({ domain, url, snapshotHash });

    // Step 2: Inference Pipeline — only called on total cache miss
    if (response.requiresInference && snapshot) {
        const inferred = await fetchInference({ snapshot, sessionId: String(tabId), snapshotHash });
        if (inferred) {
            response = {
                guides: [{
                    id: `inferred-${snapshotHash || Date.now()}`,
                    tier: 'ai_index',
                    title: inferred.guideTitle,
                    publisher: null,
                    language: 'en',
                    personaTags: [],
                    suggestedIntents: inferred.suggestedIntents || [],
                    steps: inferred.steps,
                    ttlSeconds: 300,
                }],
                indexEntry: null,
                cacheHit: inferred.cacheHit,
                requiresInference: false,
            };
        } else {
            // Fallback guide if AI is down or timeout
            response = {
                guides: [{
                    id: 'fallback-unavailable',
                    tier: 'ai_index',
                    title: 'Guidance Unavailable',
                    steps: [{
                        stepIndex: 0,
                        instruction: 'AI guidance is currently unavailable. Please check your network or try again later.',
                    }],
                }],
                requiresInference: false,
            };
        }
    }

    tabState.set(tabId, { snapshot, domain, url, snapshotHash, response, spaState: { completedSteps: [] } });
    sendToTab(tabId, { type: 'GUIDE_RESPONSE', response });
}

function handlePageNavigated(tabId, { url }) {
    const s = tabState.get(tabId);
    if (s) tabState.set(tabId, { ...s, url, spaState: { completedSteps: [] } });
}

function handleStepCompleted(tabId, { stepIndex }) {
    const s = tabState.get(tabId);
    if (s) tabState.set(tabId, { ...s, spaState: { completedSteps: [...(s.spaState?.completedSteps || []), stepIndex] } });
}

async function handleChatMessage(tabId, { text }) {
    const state = tabState.get(tabId);
    if (!state) return;

    // Add to local history
    const history = state.conversationHistory || [];
    history.push({ role: 'user', content: text });
    tabState.set(tabId, { ...state, conversationHistory: history });

    // Request fresh inference with history
    const response = await fetchInference({
        snapshot: state.snapshot,
        sessionId: String(tabId),
        conversationHistory: history
    });

    if (response) {
        const guideResponse = {
            guides: [{
                id: `chat-${Date.now()}`,
                tier: 'ai_index',
                title: response.guideTitle,
                suggestedIntents: response.suggestedIntents,
                steps: response.steps,
            }],
            requiresInference: false,
        };
        history.push({ role: 'assistant', content: `Updated guide: ${response.guideTitle}` });
        tabState.set(tabId, { ...state, conversationHistory: history, response: guideResponse });
        sendToTab(tabId, { type: 'GUIDE_RESPONSE', response: guideResponse });
    }
}

function sendToTab(tabId, message) {
    browser.tabs.sendMessage(tabId, message).catch(() => { });
}

// ── API Helpers ───────────────────────────────────────────────────────────────

async function fetchGuides({ domain, url, snapshotHash }) {
    try {
        const params = new URLSearchParams({ domain, path: url });
        if (snapshotHash) params.set('snapshotHash', snapshotHash);
        const res = await fetch(`${API_BASE}/guides?${params}`);
        if (!res.ok) throw new Error(res.status);
        return await res.json();
    } catch (err) {
        console.error('[WebGuide BG] Guide Registry failed:', err);
        return { guides: [], cacheHit: false, requiresInference: true };
    }
}

async function fetchInference({ snapshot, sessionId, conversationHistory = [] }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000); // 20s hard timeout

    try {
        const res = await fetch(`${API_BASE}/inference`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                snapshot,
                sessionId,
                lang: navigator.language?.slice(0, 2) || 'en',
                conversationHistory,
            }),
            signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Inference API ${res.status}`);
        return await res.json();
    } catch (err) {
        console.error('[WebGuide BG] Inference failed:', err);
        return null;
    } finally {
        clearTimeout(timeout);
    }
}

// ── Tab cleanup ───────────────────────────────────────────────────────────────
browser.tabs.onRemoved.addListener((tabId) => tabState.delete(tabId));

console.log('[WebGuide] Background service worker started.');
