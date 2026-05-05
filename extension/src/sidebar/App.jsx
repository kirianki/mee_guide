import { h, Fragment } from 'preact';
import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { COLORS, GLASS, SHADOWS, ANIMATIONS, TYPOGRAPHY } from '../shared/design-system.js';

// ────────────────────────────────────────────────────────────────────────────
// App — Main Sidebar Component
// ────────────────────────────────────────────────────────────────────────────
export default function App({
    guides = [],
    loading = false,
    pageChain = [],
    onSendChat,
    onHighlight,
    onRegisterAddMessage,
}) {
    const [open, setOpen] = useState(true);
    const [chatText, setChatText] = useState('');
    const [isThinking, setIsThinking] = useState(false);
    const [thoughtText, setThoughtText] = useState('');
    const [messages, setMessages] = useState([]);
    const messagesEndRef = useRef(null);

    useEffect(() => {
        const handler = (e) => {
            if (e.data?.type === 'THOUGHT_START') {
                setThoughtText('');
            } else if (e.data?.type === 'THOUGHT_CHUNK') {
                setThoughtText((prev) => prev + e.data.text);
            } else if (e.data?.type === 'THOUGHT_DONE') {
                // Keep thought text visible but stop dots if needed? 
                // Actually setIsThinking(false) is handled by addAiMessage.
            }
        };
        window.addEventListener('message', handler);
        return () => window.removeEventListener('message', handler);
    }, []);

    // Draggable position state
    const [pos, setPos] = useState({ top: 12, right: 12 });
    const [dragging, setDragging] = useState(false);
    const dragStart = useRef({ x: 0, y: 0, initialTop: 0, initialRight: 0 });

    const handleDragStart = (e) => {
        setDragging(true);
        dragStart.current = {
            x: e.clientX,
            y: e.clientY,
            initialTop: pos.top,
            initialRight: pos.right,
        };
        // No e.preventDefault() here so child buttons still work normally if we had any, 
        // but 'grab' handle is usually empty space.
    };

    useEffect(() => {
        if (!dragging) return;

        const handleMouseMove = (e) => {
            const dx = e.clientX - dragStart.current.x;
            const dy = e.clientY - dragStart.current.y;
            setPos({
                top: Math.max(0, dragStart.current.initialTop + dy),
                right: Math.max(0, dragStart.current.initialRight - dx),
            });
        };

        const handleMouseUp = () => setDragging(false);

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [dragging]);

    // Fade-in on mount
    const [visible, setVisible] = useState(false);
    useEffect(() => { setVisible(true); }, []);

    // Auto-scroll to latest message
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Register addAiMessage fn with parent mount
    const addAiMessage = useCallback((text, richData = null) => {
        setIsThinking(false);
        setThoughtText('');
        setMessages((prev) => [...prev, {
            role: 'ai',
            text,
            ts: Date.now(),
            richData // { suggestedIntents: [], steps: [] }
        }]);
    }, []);

    useEffect(() => {
        if (onRegisterAddMessage) onRegisterAddMessage(addAiMessage);
    }, [addAiMessage, onRegisterAddMessage]);

    if (!open) {
        return (
            <button
                id="webguide-open-btn"
                onClick={() => setOpen(true)}
                style={openBtnStyle}
                aria-label="Open WebGuide"
            >
                <span style={logoText}>WG</span>
            </button>
        );
    }

    const handleChatSubmit = async (e) => {
        e.preventDefault();
        const text = chatText.trim();
        if (!text || isThinking) return;

        setMessages((prev) => [...prev, { role: 'user', text, ts: Date.now() }]);
        setChatText('');
        setIsThinking(true);
        const currentHistory = messages.map(m => ({
            role: m.role === 'ai' ? 'assistant' : (m.role === 'system' ? 'system' : 'user'),
            content: m.text + (m.role === 'ai' && m.richData?.steps?.length ? ` [Suggested Steps: ${m.richData.steps.map(s => s.instruction).join(', ')}]` : '')
        }));
        if (onSendChat) onSendChat(text, currentHistory).catch(() => setIsThinking(false));
    };

    const latestGuide = guides[0] || null;

    return (
        <div
            id="webguide-sidebar"
            style={{
                ...sidebarStyle,
                position: 'fixed',
                top: `${pos.top}px`,
                right: `${pos.right}px`,
                pointerEvents: 'auto', // Catch mice on the sidebar only
                opacity: visible ? 1 : 0,
                transform: visible ? 'translateX(0)' : 'translateX(20px)',
            }}
            role="complementary"
            aria-label="WebGuide"
        >
            {/* ── Header ── */}
            <header
                style={{ ...headerStyle, cursor: dragging ? 'grabbing' : 'grab' }}
                onMouseDown={handleDragStart}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={logoIcon}>WG</div>
                    <span style={TYPOGRAPHY.h2}>WebGuide</span>
                    {latestGuide && (
                        <div style={guideBadge}>
                            {latestGuide.tier === 'verified' ? '✓ verified' : '✦ ai'}
                        </div>
                    )}
                </div>
                <button onClick={() => setOpen(false)} aria-label="Close" style={closeBtn}>✕</button>
            </header>

            {/* ── Workflow Map Breadcrumbs (Pinned) ── */}
            {pageChain.length > 0 && (
                <div style={breadcrumbContainer}>
                    {pageChain.map((node, i) => (
                        <Fragment key={i}>
                            <div
                                style={{
                                    ...breadcrumbNode,
                                    color: i === pageChain.length - 1 ? COLORS.text : COLORS.textMuted,
                                    fontWeight: i === pageChain.length - 1 ? 600 : 400,
                                }}
                                title={node.url}
                            >
                                {node.title || 'Page'}
                            </div>
                            {i < pageChain.length - 1 && <span style={breadcrumbSeparator}>›</span>}
                        </Fragment>
                    ))}
                </div>
            )}

            {/* ── Main Chat Feed ── */}
            <div style={bodyStyle}>
                <div style={chatHistoryFull}>
                    {/* Welcome Message if empty */}
                    {messages.length === 0 && (
                        <div style={centerState}>
                            <div style={pulseCircle}></div>
                            <p style={TYPOGRAPHY.caption}>Welcome to WebGuide.</p>
                            <p style={{ ...TYPOGRAPHY.caption, marginTop: 4 }}>
                                {loading ? 'Analyzing page...' : 'Ask me anything to start a workflow.'}
                            </p>
                        </div>
                    )}

                    {messages.map((msg, i) => (
                        <div key={i} style={msg.role === 'user' ? userBubble : aiBubble}>
                            <div style={{ whiteSpace: 'pre-wrap', fontWeight: 500 }}>{msg.text}</div>

                            {/* Rich Content: Intents (Explorer Mode) */}
                            {msg.richData?.suggestedIntents?.length > 0 && (!msg.richData.steps || msg.richData.steps.length === 0) && (
                                <div style={inlineIntentsGrid}>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                        {msg.richData.suggestedIntents.map((intent) => (
                                            <button
                                                key={intent.id}
                                                style={inlineIntentBtn}
                                                onClick={() => {
                                                    const history = messages.map(m => ({
                                                        role: m.role === 'ai' ? 'assistant' : (m.role === 'system' ? 'system' : 'user'),
                                                        content: m.text
                                                    }));
                                                    setMessages((prev) => [...prev, { role: 'user', text: `Intent Selected: ${intent.title}`, ts: Date.now() }]);
                                                    setIsThinking(true);
                                                    if (onSendChat) onSendChat(intent.title, history).catch(() => setIsThinking(false));
                                                }}
                                            >
                                                {intent.title}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Rich Content: Steps (Action Mode) */}
                            {msg.richData?.steps?.length > 0 && (
                                <div style={inlineIntentsGrid}>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                        {msg.richData.steps.map((step, idx) => (
                                            <button
                                                key={`step-${idx}`}
                                                style={{ ...inlineIntentBtn, background: 'rgba(255,255,255,0.15)', borderColor: 'rgba(255,255,255,0.3)' }}
                                                onClick={() => {
                                                    setMessages((prev) => [...prev, { role: 'system', text: `(Visual highlight: ${step.instruction})`, ts: Date.now() }]);
                                                    onHighlight?.(step.elementId, step.elementSelector, step.tooltipText || step.instruction);
                                                }}
                                                title="Highlight this location on the page"
                                            >
                                                ✨ Show Me: {step.instruction || 'Action'}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}

                    {isThinking && (
                        <div style={{ ...aiBubble, minWidth: '120px', overflowX: 'hidden' }}>
                            {thoughtText ? (
                                <div style={{ fontSize: '0.75rem', opacity: 0.85, fontStyle: 'italic', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>
                                    {thoughtText}<span style={{ animation: 'wg-pulse 1.2s infinite' }}>_</span>
                                </div>
                            ) : (
                                <span style={thinkingDots}>
                                    <span>●</span><span>●</span><span>●</span>
                                </span>
                            )}
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>
            </div>

            {/* ── Chat Input ── */}
            <div style={chatContainer}>
                <form onSubmit={handleChatSubmit} style={chatForm}>
                    <input
                        id="webguide-chat-input"
                        type="text"
                        placeholder="What do you want to do?"
                        value={chatText}
                        onInput={(e) => setChatText(e.target.value)}
                        style={chatInput}
                        disabled={isThinking}
                    />
                    <button
                        id="webguide-chat-submit"
                        type="submit"
                        style={{ ...chatSubmit, opacity: isThinking || !chatText.trim() ? 0.5 : 1 }}
                        disabled={isThinking || !chatText.trim()}
                    >
                        {isThinking ? '⟳' : '→'}
                    </button>
                </form>
            </div>

            {/* ── Footer ── */}
            <footer style={footerStyle}>
                {latestGuide?.provider ? `✦ ${latestGuide.provider}` : 'WebGuide AI'}
            </footer>
        </div>
    );
}

// ── Additional Styles ────────────────────────────────────────────────────────

const breadcrumbContainer = {
    display: 'flex',
    padding: '10px 20px',
    background: 'rgba(255,255,255,0.03)',
    borderBottom: `1px solid ${COLORS.border}`,
    overflowX: 'auto',
    whiteSpace: 'nowrap',
    gap: '6px',
    alignItems: 'center',
    scrollbarWidth: 'none',
};

const breadcrumbNode = {
    fontSize: '0.72rem',
    maxWidth: '100px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
};

const breadcrumbSeparator = {
    color: COLORS.textMuted,
    fontSize: '0.8rem',
    opacity: 0.5,
};

const inlineIntentsGrid = {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginTop: '12px',
};

const inlineDivider = {
    fontSize: '9px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: COLORS.textMuted,
    marginBottom: '4px',
    opacity: 0.7,
};

const inlineIntentBtn = {
    background: 'rgba(255,255,255,0.08)',
    border: `1px solid ${COLORS.border}`,
    borderRadius: '16px',
    padding: '4px 12px',
    fontSize: '0.75rem',
    color: COLORS.text,
    cursor: 'pointer',
    transition: 'all 0.2s',
    fontWeight: 500,
};

const inlineStepsList = {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    marginTop: '12px',
};

const inlineStepItem = {
    display: 'flex',
    gap: '10px',
    alignItems: 'flex-start',
};

const inlineStepNum = {
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '10px',
    fontWeight: 700,
    color: COLORS.text,
    flexShrink: 0,
};

const inlineShowMeBtn = {
    marginTop: '6px',
    background: 'rgba(255,255,255,0.1)',
    border: `1px solid rgba(255,255,255,0.15)`,
    borderRadius: '6px',
    padding: '3px 8px',
    fontSize: '0.7rem',
    fontWeight: 600,
    color: '#fff',
    cursor: 'pointer',
};


// ── Styles ───────────────────────────────────────────────────────────────────

const sidebarStyle = {
    ...GLASS,
    width: '320px',
    height: 'calc(100vh - 24px)', // Floating height
    borderRadius: '16px',          // Rounded corners
    display: 'flex',
    flexDirection: 'column',
    boxShadow: SHADOWS.xl,
    transition: 'opacity 0.25s, transform 0.25s', // Don't transition top/right for drag smoothness
    fontFamily: TYPOGRAPHY.fontFamily,
    color: COLORS.text,
    overflow: 'hidden',           // Clip rounded glass
};

const headerStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: `1px solid ${COLORS.border}`,
    flexShrink: 0,
};

const tabBar = {
    display: 'flex',
    padding: '8px 12px',
    gap: '4px',
    borderBottom: `1px solid ${COLORS.border}`,
    flexShrink: 0,
};

const tabBtn = {
    flex: 1,
    background: 'transparent',
    border: '1px solid transparent',
    borderRadius: '7px',
    color: COLORS.textMuted,
    fontSize: '11px',
    fontWeight: 600,
    padding: '5px 6px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    whiteSpace: 'nowrap',
};

const tabBtnActive = {
    background: 'rgba(255,255,255,0.1)',
    border: `1px solid rgba(255,255,255,0.2)`,
    color: COLORS.text,
};

const bodyStyle = {
    padding: '16px 20px',
    overflowY: 'auto',
    flex: 1,
};

const footerStyle = {
    padding: '10px 20px',
    borderTop: `1px solid ${COLORS.border}`,
    ...TYPOGRAPHY.caption,
    textAlign: 'center',
    flexShrink: 0,
};

const logoIcon = {
    width: '26px',
    height: '26px',
    borderRadius: '6px',
    background: 'rgba(255,255,255,0.12)',
    border: '1px solid rgba(255,255,255,0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '10px',
    fontWeight: 800,
    color: '#fff',
    flexShrink: 0,
};

const logoText = {
    background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.secondary})`,
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    fontWeight: 800,
};

const closeBtn = {
    background: 'none',
    border: 'none',
    color: COLORS.textMuted,
    cursor: 'pointer',
    fontSize: '16px',
    padding: '4px',
    lineHeight: 1,
};

const openBtnStyle = {
    ...GLASS,
    position: 'fixed',
    right: 0,
    top: '50%',
    transform: 'translateY(-50%)',
    borderRadius: '12px 0 0 12px',
    padding: '16px 12px',
    cursor: 'pointer',
    transition: 'transform 0.2s',
};

const guideBadge = {
    padding: '2px 7px',
    borderRadius: '100px',
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.15)',
    fontSize: '9px',
    fontWeight: 700,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: '0.04em',
};

const sectionLabel = {
    fontSize: '10px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: COLORS.textMuted,
    display: 'block',
    marginBottom: '8px',
};

const intentsSection = {
    marginBottom: '20px',
    paddingBottom: '20px',
    borderBottom: `1px solid ${COLORS.border}`,
};

const intentsSectionHeader = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
};

const intentCount = {
    fontSize: '10px',
    fontWeight: 700,
    color: 'rgba(255,255,255,0.8)',
    background: 'rgba(255,255,255,0.12)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '100px',
    padding: '1px 6px',
};

const intentsGrid = {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
};

const intentCard = {
    background: 'rgba(255,255,255,0.04)',
    border: `1px solid ${COLORS.border}`,
    borderRadius: '10px',
    padding: '10px 12px',
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    color: COLORS.text,
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
};

const intentCardLeft = { flex: 1 };

const intentConfidence = (score) => ({
    fontSize: '10px',
    fontWeight: 700,
    color: score > 0.7 ? COLORS.success : score > 0.4 ? COLORS.secondary : COLORS.textMuted,
    flexShrink: 0,
});

const showMoreBtn = {
    background: 'none',
    border: 'none',
    color: COLORS.secondary,
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: 600,
    marginTop: '6px',
    padding: '4px 0',
};

const stepsList = {
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
    marginTop: '8px',
};

const stepItem = {
    padding: '12px',
    borderRadius: '10px',
    transition: ANIMATIONS.transition,
};

const stepNumber = {
    width: '22px',
    height: '22px',
    borderRadius: '50%',
    border: '1.5px solid',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '10px',
    fontWeight: 700,
    flexShrink: 0,
    transition: ANIMATIONS.transition,
};

const highlightBtn = {
    background: 'rgba(255,255,255,0.08)',
    border: `1px solid rgba(255,255,255,0.2)`,
    borderRadius: '6px',
    padding: '5px 10px',
    fontSize: '12px',
    fontWeight: 600,
    color: COLORS.text,
    cursor: 'pointer',
};

const actionBtn = {
    background: 'rgba(255,255,255,0.12)',
    color: '#fff',
    border: `1px solid rgba(255,255,255,0.2)`,
    borderRadius: '7px',
    padding: '6px 14px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
};

const progressBar = {
    height: '3px',
    background: 'rgba(255,255,255,0.08)',
    borderRadius: '100px',
    margin: '12px 0 0',
    overflow: 'hidden',
};

const progressFill = {
    height: '100%',
    background: 'rgba(255,255,255,0.5)',
    borderRadius: '100px',
    transition: 'width 0.4s ease',
};

// ── Workflow Map ──────────────────────────────────────────────────────────────

const mapChain = {
    display: 'flex',
    flexDirection: 'column',
    gap: '0',
};

const mapNode = {
    background: 'rgba(255,255,255,0.04)',
    border: `1px solid ${COLORS.border}`,
    borderRadius: '10px',
    padding: '10px 14px',
};

const mapNodeActive = {
    background: 'rgba(255,255,255,0.08)',
    border: `1px solid rgba(255,255,255,0.3)`,
    boxShadow: '0 0 0 1px rgba(255,255,255,0.1)',
};

const mapNodeTitle = {
    fontSize: '0.82rem',
    fontWeight: 600,
    color: COLORS.text,
};

const mapNodeUrl = {
    fontSize: '0.7rem',
    color: COLORS.textMuted,
    marginTop: '2px',
    fontFamily: 'monospace',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
};

const mapNodeSteps = {
    fontSize: '0.7rem',
    color: COLORS.secondary,
    marginTop: '4px',
};

const mapArrow = {
    fontSize: '16px',
    color: COLORS.textMuted,
    textAlign: 'center',
    padding: '3px 0',
};

// ── Chat ─────────────────────────────────────────────────────────────────────

const chatHistoryFull = {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    overflowY: 'auto',
    flex: 1,
    paddingBottom: '8px',
};

const baseBubble = {
    padding: '10px 14px',
    borderRadius: '12px',
    fontSize: '0.8rem',
    lineHeight: '1.5',
    maxWidth: '90%',
    wordBreak: 'break-word',
};

const userBubble = {
    ...baseBubble,
    background: 'rgba(255,255,255,0.12)',
    backdropFilter: 'blur(8px)',
    border: `1px solid rgba(255,255,255,0.15)`,
    color: '#fff',
    alignSelf: 'flex-end',
    borderBottomRightRadius: '4px',
};

const aiBubble = {
    ...baseBubble,
    background: 'rgba(255,255,255,0.04)',
    backdropFilter: 'blur(8px)',
    border: `1px solid rgba(255,255,255,0.08)`,
    color: COLORS.text,
    alignSelf: 'flex-start',
    borderBottomLeftRadius: '4px',
};

const aiBubbleLabel = { display: 'none' };

const thinkingDots = {
    display: 'inline-flex',
    gap: '3px',
    fontSize: '10px',
    opacity: 0.7,
    animation: 'wg-pulse 1.2s infinite',
};

const chatContainer = {
    padding: '12px 20px',
    borderTop: `1px solid ${COLORS.border}`,
    background: 'rgba(0,0,0,0.15)',
    flexShrink: 0,
};

const chatForm = {
    display: 'flex',
    gap: '8px',
};

const chatInput = {
    flex: 1,
    background: 'rgba(255,255,255,0.05)',
    border: `1px solid ${COLORS.border}`,
    borderRadius: '20px',
    padding: '8px 14px',
    color: COLORS.text,
    fontSize: '0.82rem',
    outline: 'none',
    transition: 'border-color 0.2s',
};

const chatSubmit = {
    width: '32px',
    height: '32px',
    minWidth: '32px',
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.15)',
    color: '#fff',
    border: `1px solid rgba(255,255,255,0.25)`,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: '16px',
    transition: 'all 0.2s',
};

const centerState = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '60%',
    gap: '12px',
    textAlign: 'center',
};

const spinnerStyle = {
    width: '36px',
    height: '36px',
    border: `3px solid rgba(255,255,255,0.1)`,
    borderTop: `3px solid rgba(255,255,255,0.7)`,
    borderRadius: '50%',
    animation: 'wg-spin 1s linear infinite',
};

const pulseCircle = {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.15)',
    border: `1px solid rgba(255,255,255,0.3)`,
    animation: 'wg-pulse 2s infinite',
};

const fadeIn = {
    animation: 'wg-fadeIn 0.4s ease-out',
};
