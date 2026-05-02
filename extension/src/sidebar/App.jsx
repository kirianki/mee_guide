import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { COLORS, GLASS, SHADOWS, ANIMATIONS, TYPOGRAPHY } from '../shared/design-system.js';

export default function App({ guides = [], loading = false, onSendChat }) {
    const [open, setOpen] = useState(true);
    const [activeStep, setActiveStep] = useState(0);
    const [chatText, setChatText] = useState('');
    const [isSubmittingChat, setIsSubmittingChat] = useState(false);

    // Fade-in entry animation style
    const [visible, setVisible] = useState(false);
    useEffect(() => { setVisible(true); }, []);

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
        if (!chatText.trim() || isSubmittingChat) return;

        setIsSubmittingChat(true);
        if (onSendChat) await onSendChat(chatText);
        setChatText('');
        setIsSubmittingChat(false);
    };

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
            <header style={headerStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={logoIcon}>WG</div>
                    <span style={TYPOGRAPHY.h2}>WebGuide</span>
                </div>
                <button onClick={() => setOpen(false)} aria-label="Close" style={closeBtn}>✕</button>
            </header>

            <div style={bodyStyle}>
                {loading && (
                    <div style={centerState}>
                        <div style={spinnerStyle}></div>
                        <p style={TYPOGRAPHY.caption}>Synthesizing logic...</p>
                    </div>
                )}

                {!loading && !guide && (
                    <div style={centerState}>
                        <div style={pulseCircle}></div>
                        <p style={TYPOGRAPHY.caption}>Analysing workflows...</p>
                    </div>
                )}

                {!loading && guide && (
                    <div style={fadeIn}>
                        <div style={guideHeader}>
                            <div style={guideBadge}>{guide.tier === 'verified' ? 'verified' : 'ai generated'}</div>
                            <h2 style={{ ...TYPOGRAPHY.h1, margin: '8px 0 12px' }}>
                                {guide.title}
                            </h2>
                        </div>

                        {/* Suggested Intents Section */}
                        {guide.suggestedIntents && guide.suggestedIntents.length > 0 && (
                            <div style={intentsSection}>
                                <p style={{ ...TYPOGRAPHY.caption, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Popular Intents
                                </p>
                                <div style={intentsGrid}>
                                    {guide.suggestedIntents.map((intent) => (
                                        <button
                                            key={intent.id}
                                            style={intentCard}
                                            onClick={() => onSendChat && onSendChat(intent.title)}
                                        >
                                            <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>{intent.title}</div>
                                            <div style={{ fontSize: '0.7rem', color: COLORS.textMuted }}>{intent.description}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div style={stepsList}>
                            {guide.steps.map((step, i) => {
                                const isActive = i === activeStep;
                                const isDone = i < activeStep;

                                return (
                                    <div
                                        key={step.stepIndex}
                                        style={{
                                            ...stepItem,
                                            borderLeft: isActive ? `3px solid ${COLORS.primary}` : '3px solid transparent',
                                            background: isActive ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                                            opacity: isDone ? 0.5 : 1,
                                        }}
                                    >
                                        <div style={{ display: 'flex', gap: '12px' }}>
                                            <div style={{
                                                ...stepNumber,
                                                borderColor: isActive ? COLORS.primary : (isDone ? COLORS.success : COLORS.textMuted),
                                                backgroundColor: isDone ? COLORS.success : 'transparent',
                                            }}>
                                                {isDone ? '✓' : i + 1}
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <p style={{
                                                    ...TYPOGRAPHY.body,
                                                    fontWeight: isActive ? 600 : 400,
                                                    color: isActive ? COLORS.text : COLORS.textMuted
                                                }}>
                                                    {step.instruction}
                                                </p>
                                                {isActive && (
                                                    <button
                                                        onClick={() => setActiveStep((s) => s + 1)}
                                                        style={actionBtn}
                                                    >
                                                        Next Step
                                                    </button>
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

            <div style={chatContainer}>
                {isSubmittingChat && (
                    <div style={typingIndicator}>
                        <div style={typingDot}></div>
                        <div style={{ ...typingDot, animationDelay: '0.2s' }}></div>
                        <div style={{ ...typingDot, animationDelay: '0.4s' }}></div>
                    </div>
                )}
                <form onSubmit={handleChatSubmit} style={chatForm}>
                    <input
                        type="text"
                        placeholder="Ask WebGuide anything..."
                        value={chatText}
                        onInput={(e) => setChatText(e.target.value)}
                        style={chatInput}
                        disabled={isSubmittingChat}
                    />
                    <button type="submit" style={chatSubmit} disabled={isSubmittingChat || !chatText.trim()}>
                        {isSubmittingChat ? '...' : '→'}
                    </button>
                </form>
            </div>

            <footer style={footerStyle}>
                Running on {guide?.provider || 'Inference Engine'}
            </footer>
        </div>
    );
}

const guideHeader = {
    marginBottom: '20px',
};

const intentsSection = {
    marginBottom: '24px',
};

const intentsGrid = {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
};

const intentCard = {
    background: 'rgba(255, 255, 255, 0.05)',
    border: `1px solid ${COLORS.border}`,
    borderRadius: '10px',
    padding: '10px 14px',
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    color: COLORS.text,
    width: '100%',
    ':hover': {
        background: 'rgba(255, 255, 255, 0.1)',
        borderColor: COLORS.primary,
    }
};

const chatContainer = {
    padding: '16px 24px',
    borderTop: `1px solid ${COLORS.border}`,
    background: 'rgba(0, 0, 0, 0.2)',
};

const chatForm = {
    display: 'flex',
    gap: '8px',
};

const chatInput = {
    flex: 1,
    background: 'rgba(255, 255, 255, 0.05)',
    border: `1px solid ${COLORS.border}`,
    borderRadius: '20px',
    padding: '8px 16px',
    color: COLORS.text,
    fontSize: '0.85rem',
    outline: 'none',
    transition: 'border-color 0.2s',
};

const chatSubmit = {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    background: COLORS.primary,
    color: '#fff',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    transition: 'transform 0.2s',
};

const typingIndicator = {
    display: 'flex',
    gap: '4px',
    marginBottom: '8px',
    paddingLeft: '12px',
};

const typingDot = {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: COLORS.primary,
    opacity: 0.6,
    animation: 'wg-pulse 1s infinite ease-in-out',
};

// ── Styles ────────────────────────────────────────────────────────────────────

const sidebarStyle = {
    ...GLASS,
    width: '320px',
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: SHADOWS.xl,
    transition: ANIMATIONS.transition,
    fontFamily: TYPOGRAPHY.fontFamily,
};

const headerStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 24px',
    borderBottom: `1px solid ${COLORS.border}`,
};

const bodyStyle = {
    padding: '24px',
    overflowY: 'auto',
    flex: 1,
};

const footerStyle = {
    padding: '12px 24px',
    borderTop: `1px solid ${COLORS.border}`,
    ...TYPOGRAPHY.caption,
    textAlign: 'center',
};

const logoIcon = {
    width: '28px',
    height: '28px',
    borderRadius: '6px',
    background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.secondary})`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '11px',
    fontWeight: 800,
    color: '#fff',
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
    fontSize: '18px',
    transition: 'color 0.2s',
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
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '100px',
    background: 'rgba(255, 255, 255, 0.1)',
    fontSize: '10px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: COLORS.primary,
};

const stepsList = {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
};

const stepItem = {
    padding: '16px',
    borderRadius: '12px',
    transition: ANIMATIONS.transition,
};

const stepNumber = {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    border: '1.5px solid',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '11px',
    fontWeight: 700,
    transition: ANIMATIONS.transition,
};

const actionBtn = {
    marginTop: '12px',
    background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.secondary})`,
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
    transition: 'transform 0.1s',
};

const centerState = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: '16px',
};

const spinnerStyle = {
    width: '40px',
    height: '40px',
    border: `3px solid ${COLORS.surface}`,
    borderTop: `3px solid ${COLORS.primary}`,
    borderRadius: '50%',
    animation: 'wg-spin 1s linear infinite',
};

const pulseCircle = {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    background: COLORS.primary,
    boxShadow: `0 0 0 rgba(99, 102, 241, 0.4)`,
    animation: 'wg-pulse 2s infinite',
};

const fadeIn = {
    animation: 'wg-fadeIn 0.5s ease-out',
};
