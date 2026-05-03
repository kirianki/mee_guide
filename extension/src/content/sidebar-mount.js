// Shadow DOM sidebar mount — renders the Preact App into an isolated Shadow DOM
import browser from '../shared/browser.js';
import { h, render } from 'preact';
import App from '../sidebar/App.jsx';
import { showSpotlight, hideSpotlight } from './spotlight.js';

let shadowRoot = null;
let appContainer = null;
let addAiMessageFn = null; // Injected by App on mount

/** Called once on page load */
export function mountSidebar() {
    const host = document.createElement('div');
    host.id = 'webguide-sidebar-host';
    host.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:2147483647;pointer-events:none;';
    document.body.appendChild(host);

    shadowRoot = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = `
        @keyframes wg-spin { to { transform: rotate(360deg); } }
        @keyframes wg-pulse {
            0%, 100% { box-shadow: 0 0 0 0px rgba(99, 102, 241, 0.4); opacity: 1; }
            50% { box-shadow: 0 0 0 10px rgba(99, 102, 241, 0); opacity: 0.7; }
        }
        @keyframes wg-fadeIn {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 4px; }
    `;
    shadowRoot.appendChild(style);

    appContainer = document.createElement('div');
    shadowRoot.appendChild(appContainer);

    renderApp({ guides: [], loading: true, pageChain: [] });
}

/** Called whenever the background sends new guide data */
export function updateSidebar(response) {
    if (!appContainer) return;

    const guides = response?.guides ?? [];
    const pageChain = response?.pageChain ?? [];

    // Build AI reply text from the first guide's steps
    const guide = guides[0];
    if (response?.error && addAiMessageFn) {
        addAiMessageFn(`⚠️ **Error**: ${response.error}`);
        return;
    }

    if (guide && addAiMessageFn) {
        const stepCount = guide.steps?.length ?? 0;
        const intentionsCount = guide.suggestedIntents?.length ?? 0;

        // Strictly prioritize the AI's narrative for a natural feel.
        // If missing, show only the title without technical counts.
        let aiText = guide.narrative || guide.title;

        // Pass the rich data (intents/steps) to the chat UI
        const finalSteps = (guide.steps || []).map(s => ({
            ...s,
            elementId: s.elementId || null
        }));

        addAiMessageFn(aiText, {
            suggestedIntents: guide.suggestedIntents || [],
            steps: finalSteps
        });

        // Auto-show spotlight for the first step if we have one and it's a chat response
        if (finalSteps.length > 0 && finalSteps[0].elementId) {
            const step = finalSteps[0];
            showSpotlight(step.elementId, step.tooltipText || step.instruction);
        }
    }

    renderApp({ guides, loading: false, pageChain });
}

function renderApp(props) {
    render(
        h(App, {
            ...props,
            onSendChat: sendChatMessage,
            onHighlight: (selector, label) => showSpotlight(selector, label),
            onRegisterAddMessage: (fn) => { addAiMessageFn = fn; },
        }),
        appContainer
    );
}

async function sendChatMessage(text) {
    return browser.runtime.sendMessage({ type: 'CHAT_MESSAGE', text });
}
