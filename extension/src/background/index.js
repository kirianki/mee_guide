// Background Service Worker — proxies all API calls, manages tab state
import browser from '../shared/browser.js';

// ── Config ────────────────────────────────────────────────────────────────────
const API_BASE = typeof __API_BASE__ !== 'undefined' ? __API_BASE__ : 'http://localhost/v1';

// ── In-memory L1 tab state ────────────────────────────────────────────────────
const tabState = new Map();

// ── Message Router ────────────────────────────────────────────────────────────
// ── Message Router ────────────────────────────────────────────────────────────
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const { type, ...payload } = message;
    const tabId = sender.tab ? sender.tab.id : null;

    if (type === 'PAGE_LOADED') handlePageLoaded(tabId, payload);
    else if (type === 'PAGE_NAVIGATED') handlePageNavigated(tabId, payload);
    else if (type === 'STEP_COMPLETED') handleStepCompleted(tabId, payload);
    else if (type === 'CHAT_MESSAGE') {
        handleChatMessage(tabId, { text: payload.text, history: payload.history, isSystem: false });
        sendResponse({ success: true });
    }
    else console.warn('[WebGuide BG] Unknown message type:', type);

    return true; // Keep channel open for async responses if needed
});

async function handlePageLoaded(tabId, { url, domain, snapshotHash, snapshot }) {
    // L1 cache — same snapshot hash means page hasn't changed
    const cached = tabState.get(tabId);
    if (cached && cached.snapshotHash === snapshotHash && cached.response) {
        sendToTab(tabId, { type: 'GUIDE_RESPONSE', response: { ...cached.response, pageChain: cached.pageChain } });
        return;
    }

    // Step 1: Guide Registry (Redis → publisher guide → SII exact)
    let response = await fetchGuides({ domain, url, snapshotHash });

    // Step 2: Inference Pipeline — only called on total cache miss
    if (response.requiresInference && snapshot) {
        const history = cached?.conversationHistory || [];
        const inferred = await fetchInference({ snapshot, sessionId: String(tabId), snapshotHash, conversationHistory: history });
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
                    provider: inferred.provider,
                    confidence: inferred.confidence,
                }],
                indexEntry: null,
                cacheHit: inferred.cacheHit,
                requiresInference: false,
            };

            // Auto-save high-confidence workflows
            if (inferred.confidence >= 0.75 && snapshotHash) {
                saveWorkflow({
                    guideTitle: inferred.guideTitle,
                    steps: inferred.steps,
                    snapshotHash,
                    domain,
                    urlPath: url,
                    confidence: inferred.confidence,
                });
            }
        } else {
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

    // Update page chain
    const prevState = tabState.get(tabId);
    const pageChain = prevState?.pageChain || [];
    const guide = response.guides?.[0];
    const lastEntry = pageChain[pageChain.length - 1];

    // Append to chain if this is a new page (different URL)
    if (!lastEntry || lastEntry.url !== url) {
        pageChain.push({
            url,
            title: guide?.title || document?.title || url,
            stepsCount: guide?.steps?.length || 0,
        });
    } else {
        // Update last entry with fresh data
        pageChain[pageChain.length - 1].stepsCount = guide?.steps?.length || 0;
        if (guide?.title) pageChain[pageChain.length - 1].title = guide.title;
    }

    tabState.set(tabId, {
        snapshot,
        domain,
        url,
        snapshotHash,
        response,
        pageChain: pageChain.slice(-10), // Keep last 10 pages
        spaState: { completedSteps: [] },
        conversationHistory: prevState?.conversationHistory || [],
    });

    sendToTab(tabId, { type: 'GUIDE_RESPONSE', response: { ...response, pageChain: pageChain.slice(-10) } });

    // PROACTIVE CHAT: If there is an active conversation, auto-trigger a context update
    if (prevState?.conversationHistory?.length > 0 && response.guides?.[0]?.tier !== 'verified') {
        console.log('[WebGuide BG] Proactive navigation update triggered.');
        handleChatMessage(tabId, {
            text: `(System: User navigated to ${url}. The new page is "${guide?.title || 'Unknown'}". Please provide the next step or options in the context of our goal.)`,
            isSystem: true
        });
    }
}

function handlePageNavigated(tabId, { url }) {
    const s = tabState.get(tabId);
    if (s) tabState.set(tabId, { ...s, url, spaState: { completedSteps: [] } });
}

function handleStepCompleted(tabId, { stepIndex }) {
    const s = tabState.get(tabId);
    if (s) tabState.set(tabId, { ...s, spaState: { completedSteps: [...(s.spaState?.completedSteps || []), stepIndex] } });
}

async function handleChatMessage(tabId, { text, history = [], isSystem = false }) {
    let state = tabState.get(tabId);
    if (!state) {
        try {
            const res = await browser.tabs.sendMessage(tabId, { type: 'REQUEST_SNAPSHOT' });
            if (res?.snapshot) {
                state = { snapshot: res.snapshot, lastSnapshot: res.snapshot, conversationHistory: [], chatHistory: [], pageChain: [] };
                tabState.set(tabId, state);
            } else return;
        } catch (e) { return; }
    }

    // Handle save workflow trigger from UI
    if (text === '__SAVE_WORKFLOW__') {
        const guide = state.response?.guides?.[0];
        if (guide && state.snapshotHash) {
            await saveWorkflow({
                guideTitle: guide.title,
                steps: guide.steps,
                snapshotHash: state.snapshotHash,
                domain: state.domain,
                urlPath: state.url,
                confidence: guide.confidence || 0.8,
            });
            sendToTab(tabId, {
                type: 'GUIDE_RESPONSE',
                response: {
                    ...state.response,
                    pageChain: state.pageChain,
                    _workflowSaved: true,
                },
            });
        }
        return;
    }

    const finalHistory = [...history];
    if (!isSystem) {
        finalHistory.push({ role: 'user', content: text });
    } else {
        finalHistory.push({ role: 'user', content: text, hidden: true });
    }

    // Request fresh inference with history
    const response = await fetchInference({
        snapshot: state.snapshot,
        sessionId: String(tabId),
        conversationHistory: finalHistory,
    });

    if (response) {
        const guideResponse = {
            guides: [{
                id: `chat-${Date.now()}`,
                tier: 'ai_index',
                title: response.guideTitle,
                narrative: response.narrative,
                suggestedIntents: response.suggestedIntents,
                steps: response.steps,
                provider: response.provider,
                confidence: response.confidence,
            }],
            requiresInference: false,
        };

        const assistantMsg = { role: 'assistant', content: response.narrative || response.guideTitle };
        const updatedHistory = [...finalHistory, assistantMsg];

        tabState.set(tabId, {
            ...state,
            conversationHistory: updatedHistory.slice(-12),
            response: guideResponse,
        });

        sendToTab(tabId, {
            type: 'GUIDE_RESPONSE',
            response: { ...guideResponse, pageChain: state.pageChain },
        });
    } else {
        // Inference failed
        sendToTab(tabId, {
            type: 'GUIDE_ERROR',
            error: 'AI is temporarily unavailable. Please try your request again.'
        });
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

async function fetchInference({ snapshot, sessionId, conversationHistory = [], snapshotHash }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000); // 120s extended timeout for full reasoning loop

    try {
        const res = await fetch(`${API_BASE}/inference`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                snapshot: { ...snapshot, snapshotHash },
                sessionId,
                lang: navigator.language?.slice(0, 2) || 'en',
                conversationHistory,
            }),
            signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Inference API ${res.status}`);

        // Use ReadableStream to pull streaming server-sent JSONL strings (SSE framework)
        const reader = res.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let inferenceResult = null;
        let buf = "";

        // Notify content tab that reasoning engine has initialized
        const tabId = Number(sessionId) || sessionId;
        sendToTab(tabId, { type: 'THOUGHT_START' });

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buf += decoder.decode(value, { stream: true });
            const lines = buf.split("\n");
            buf = lines.pop() || "";

            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const msg = JSON.parse(line);
                    if (msg.type === 'thought') {
                        sendToTab(tabId, { type: 'THOUGHT_CHUNK', text: msg.content });
                    } else if (msg.type === 'result') {
                        inferenceResult = msg.content;
                    }
                } catch (e) {
                    console.warn('[WebGuide BG] SSE Parse skipped:', line);
                }
            }
        }

        sendToTab(tabId, { type: 'THOUGHT_DONE' });
        return inferenceResult;
    } catch (err) {
        console.error('[WebGuide BG] Inference failed:', err);
        return null;
    } finally {
        clearTimeout(timeout);
    }
}

async function saveWorkflow({ guideTitle, steps, snapshotHash, domain, urlPath, confidence }) {
    try {
        await fetch(`${API_BASE}/inference/save-workflow`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ guideTitle, steps, snapshotHash, domain, urlPath, confidence }),
        });
        console.log('[WebGuide BG] Workflow saved:', guideTitle);
    } catch (err) {
        console.warn('[WebGuide BG] Workflow save failed (non-critical):', err);
    }
}

// ── Tab cleanup ───────────────────────────────────────────────────────────────
browser.tabs.onRemoved.addListener((tabId) => tabState.delete(tabId));

console.log('[WebGuide] Background service worker started.');
