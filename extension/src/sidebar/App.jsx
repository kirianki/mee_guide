import { h } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import { COLORS, GLASS, SHADOWS, ANIMATIONS, TYPOGRAPHY } from '../shared/design-system.js';

// ────────────────────────────────────────────────────────────────────────────
// App — Main Sidebar Component
// ────────────────────────────────────────────────────────────────────────────
export default function App({ guides = [], loading = false, onSendChat, onHighlight }) {
    const [open, setOpen] = useState(true);
    const [activeStep, setActiveStep] = useState(0);
    const [chatText, setChatText] = useState('');
    const [isThinking, setIsThinking] = useState(false);
    const [messages, setMessages] = useState([]); // Chat history
    const [showAllIntents, setShowAllIntents] = useState(false);
    const messagesEndRef = useRef(null);

    // Fade-in on mount
    const [visible, setVisible] = useState(false);
    useEffect(() => { setVisible(true); }, []);

    // Reset step counter when guide changes
    useEffect(() => { setActiveStep(0); }, [guides]);

    // Auto-scroll to latest message
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Auto-highlight active step's element
    useEffect(() => {
        const guide = guides[0];
        if (!guide || !guide.steps) return;
        const step = guide.steps[activeStep];
        if (step?.elementSelector && onHighlight) {
            onHighlight(step.elementSelector, step.tooltipText || step.instruction);
        }
    }, [activeStep, guides]);

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

    const guide = guides[0] ?? null;

    const handleChatSubmit = async (e) => {
        e.preventDefault();
        const text = chatText.trim();
        if (!text || isThinking) return;

        const userMsg = { role: 'user', text, ts: Date.now() };
        setMessages((prev) => [...prev, userMsg]);
        setChatText('');
        setIsThinking(true);

        if (onSendChat) await onSendChat(text);

        // setIsThinking will be reset by the incoming message or a timeout
        // But we set it to false here as a safety in case the browser port resolves immediately
        setIsThinking(false);
    };

    // When guide updates and there are messages, add an AI bubble
    const prevGuideTitleRef = useRef(null);
    useEffect(() => {
        if (!guide) return;

        // Any guide update clears the thinking state
        setIsThinking(false);

        if (prevGuideTitleRef.current && prevGuideTitleRef.current !== guide.title) {
            setMessages((prev) => [...prev, {
                role: 'ai',
                text: `Updated guide: **${guide.title}**`,
                ts: Date.now(),
            }]);
        }
        prevGuideTitleRef.current = guide.title;
    }, [guide]);

    // Intents displayed (sorted by confidence, collapse > 4)
    const allIntents = guide?.suggestedIntents ?? [];
    const sortedIntents = [...allIntents].sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
    const visibleIntents = showAllIntents ? sortedIntents : sortedIntents.slice(0, 4);

    return (
        <div
            id="webguide-sidebar"
            style={{
                ...sidebarStyle,
                opacity: visible ? 1 : 0,
                transform: visible ? 'translateX(0)' : 'translateX(20px)',
            }}
            role="complementary"
            aria-label="WebGuide"
        >
            {/* ── Header ── */}
            <header style={headerStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={logoIcon}>WG</div>
                    <span style={TYPOGRAPHY.h2}>WebGuide</span>
                    {guide && (
                        <div style={guideBadge}>
                            {guide.tier === 'verified' ? '✓ verified' : '✦ ai'}
                        </div>
                    )}
                </div>
                <button onClick={() => setOpen(false)} aria-label="Close" style={closeBtn}>✕</button>
            </header>

            {/* ── Body ── */}
            <div style={bodyStyle}>
                {/* Loading state */}
                {loading && (
                    <div style={centerState}>
                        <div style={spinnerStyle}></div>
                        <p style={TYPOGRAPHY.caption}>Detecting navigation options...</p>
                    </div>
                )}

                {/* Empty state */}
                {!loading && !guide && messages.length === 0 && (
                    <div style={centerState}>
                        <div style={pulseCircle}></div>
                        <p style={TYPOGRAPHY.caption}>Analysing page...</p>
                        <p style={{ ...TYPOGRAPHY.caption, marginTop: 0 }}>
                            Ask me anything below
                        </p>
                    </div>
                )}

                {/* Guide + intent panel */}
                {!loading && guide && (
                    <div style={fadeIn}>
                        {/* Guide title */}
                        <h2 style={{ ...TYPOGRAPHY.h1, margin: '0 0 12px' }}>
                            {guide.title}
                        </h2>

                        {/* Intent accordion */}
                        {visibleIntents.length > 0 && (
                            <div style={intentsSection}>
                                <div style={intentsSectionHeader}>
                                    <span style={sectionLabel}>Quick Actions</span>
                                    <span style={intentCount}>{allIntents.length}</span>
                                </div>
                                <div style={intentsGrid}>
                                    {visibleIntents.map((intent) => (
                                        <button
                                            key={intent.id}
                                            style={intentCard}
                                            onClick={() => {
                                                if (onSendChat) {
                                                    setMessages((prev) => [...prev, { role: 'user', text: intent.title, ts: Date.now() }]);
                                                    setIsThinking(true);
                                                    onSendChat(intent.title).then(() => setIsThinking(false));
                                                }
                                            }}
                                        >
                                            <div style={intentCardLeft}>
                                                <div style={{ fontWeight: 600, fontSize: '0.8rem', color: COLORS.text }}>{intent.title}</div>
                                                <div style={{ fontSize: '0.72rem', color: COLORS.textMuted, marginTop: 2 }}>{intent.description}</div>
                                            </div>
                                            {intent.confidence > 0 && (
                                                <div style={intentConfidence(intent.confidence)}>
                                                    {Math.round(intent.confidence * 100)}%
                                                </div>
                                            )}
                                        </button>
                                    ))}
                                </div>
                                {allIntents.length > 4 && (
                                    <button
                                        style={showMoreBtn}
                                        onClick={() => setShowAllIntents((s) => !s)}
                                    >
                                        {showAllIntents ? '▲ Show less' : `▼ See ${allIntents.length - 4} more options`}
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Step-by-step guide */}
                        {guide.steps?.length > 0 && (
                            <div>
                                <div style={sectionLabel}>Navigation Options</div>
                                <div style={stepsList}>
                                    {guide.steps.map((step, i) => {
                                        const isActive = i === activeStep;
                                        const isDone = i < activeStep;
                                        return (
                                            <div
                                                key={step.stepIndex}
                                                onClick={() => setActiveStep(i)}
                                                style={{
                                                    ...stepItem,
                                                    borderLeft: isActive ? `3px solid rgba(255,255,255,0.7)` : '3px solid transparent',
                                                    background: isActive ? 'rgba(255,255,255,0.06)' : 'transparent',
                                                    opacity: isDone ? 0.45 : 1,
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                <div style={{ display: 'flex', gap: '12px' }}>
                                                    <div style={{
                                                        ...stepNumber,
                                                        borderColor: isActive ? '#fff' : (isDone ? COLORS.success : COLORS.textMuted),
                                                        backgroundColor: isDone ? COLORS.success : 'transparent',
                                                        color: isDone ? '#fff' : (isActive ? '#fff' : COLORS.textMuted),
                                                    }}>
                                                        ○
                                                    </div>
                                                    <div style={{ flex: 1 }}>
                                                        <p style={{
                                                            ...TYPOGRAPHY.body,
                                                            margin: 0,
                                                            fontWeight: isActive ? 600 : 400,
                                                            color: isActive ? COLORS.text : COLORS.textMuted,
                                                        }}>
                                                            {step.instruction}
                                                        </p>
                                                        {isActive && (
                                                            <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                                                                {step.elementSelector && (
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            if (onHighlight) onHighlight(step.elementSelector, step.tooltipText || step.instruction);
                                                                        }}
                                                                        style={highlightBtn}
                                                                    >
                                                                        ✨ Show me
                                                                    </button>
                                                                )}
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setActiveStep((s) => Math.min(s + 1, guide.steps.length - 1));
                                                                    }}
                                                                    style={actionBtn}
                                                                >
                                                                    Select Option →
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Progress bar */}
                {guide?.steps?.length > 0 && (
                    <div style={progressBar}>
                        <div style={{
                            ...progressFill,
                            width: `${Math.round((activeStep / guide.steps.length) * 100)}%`,
                        }}></div>
                    </div>
                )}
            </div>

            {/* ── Chat Thread ── */}
            {messages.length > 0 && (
                <div style={chatHistory}>
                    {messages.map((msg, i) => (
                        <div key={i} style={msg.role === 'user' ? userBubble : aiBubble}>
                            {msg.text}
                        </div>
                    ))}
                    {isThinking && (
                        <div style={aiBubble}>
                            <span style={thinkingDots}>
                                <span>●</span><span>●</span><span>●</span>
                            </span>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>
            )}

            {/* ── Chat Input ── */}
            <div style={chatContainer}>
                <form onSubmit={handleChatSubmit} style={chatForm}>
                    <input
                        type="text"
                        placeholder={guide ? 'Refine your goal...' : 'What do you want to do?'}
                        value={chatText}
                        onInput={(e) => setChatText(e.target.value)}
                        style={chatInput}
                        disabled={isThinking}
                    />
                    <button
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
                {guide?.provider ? `✦ ${guide.provider}` : 'WebGuide AI'}
            </footer>
        </div>
    );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const sidebarStyle = {
    ...GLASS,
    width: '320px',
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: SHADOWS.xl,
    transition: ANIMATIONS.transition,
    fontFamily: TYPOGRAPHY.fontFamily,
    color: COLORS.text,
};

const headerStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: `1px solid ${COLORS.border}`,
    flexShrink: 0,
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

const intentCardLeft = {
    flex: 1,
};

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

// Chat
const chatHistory = {
    padding: '12px 20px',
    borderTop: `1px solid ${COLORS.border}`,
    maxHeight: '200px',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    flexShrink: 0,
};

const baseBubble = {
    padding: '8px 12px',
    borderRadius: '12px',
    fontSize: '0.8rem',
    lineHeight: '1.4',
    maxWidth: '85%',
    wordBreak: 'break-word',
};

const userBubble = {
    ...baseBubble,
    background: 'rgba(255,255,255,0.15)',
    border: `1px solid rgba(255,255,255,0.2)`,
    color: '#fff',
    alignSelf: 'flex-end',
    borderBottomRightRadius: '4px',
};

const aiBubble = {
    ...baseBubble,
    background: 'rgba(255,255,255,0.07)',
    border: `1px solid ${COLORS.border}`,
    color: COLORS.textMuted,
    alignSelf: 'flex-start',
    borderBottomLeftRadius: '4px',
};

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
