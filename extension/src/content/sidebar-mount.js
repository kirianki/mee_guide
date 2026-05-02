// Shadow DOM sidebar mount — renders the Preact App into an isolated Shadow DOM
import browser from '../shared/browser.js';
import { h, render } from 'preact';
import App from '../sidebar/App.jsx';

let shadowRoot = null;
let appContainer = null;

export function mountSidebar() {
    const host = document.createElement('div');
    host.id = 'webguide-sidebar-host';
    host.style.cssText = 'position:fixed;top:0;right:0;z-index:2147483647;';
    document.body.appendChild(host);

    shadowRoot = host.attachShadow({ mode: 'closed' });

    // Inject global animations and keyframes into Shadow DOM
    const style = document.createElement('style');
    style.textContent = `
        @keyframes wg-spin { to { transform: rotate(360deg); } }
        @keyframes wg-pulse {
            0% { box-shadow: 0 0 0 0px rgba(99, 102, 241, 0.4); }
            70% { box-shadow: 0 0 0 10px rgba(99, 102, 241, 0); }
            100% { box-shadow: 0 0 0 0px rgba(99, 102, 241, 0); }
        }
        @keyframes wg-fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
    `;
    shadowRoot.appendChild(style);

    appContainer = document.createElement('div');
    shadowRoot.appendChild(appContainer);

    render(
        h(App, {
            guides: [],
            loading: false,
            onSendChat: (text) => browser.runtime.sendMessage({ type: 'CHAT_MESSAGE', text })
        }),
        appContainer
    );
}

export function updateSidebar(response) {
    if (!appContainer) return;
    render(
        h(App, {
            guides: response?.guides ?? [],
            loading: false,
            onSendChat: (text) => browser.runtime.sendMessage({ type: 'CHAT_MESSAGE', text })
        }),
        appContainer
    );
}
