/**
 * WebGuide Extension Design System
 * 
 * Defines the "WOW" factor aesthetics:
 * - Glassmorphism (Backdrop blur + semi-transparency)
 * - Premium Indigo/Violet gradients
 * - Fluid spacing and typography
 */

export const COLORS = {
    primary: '#6366f1', // Indigo 500
    primaryHover: '#4f46e5', // Indigo 600
    secondary: '#8b5cf6', // Violet 500
    background: 'rgba(15, 23, 42, 0.8)', // Slate 900 with alpha
    surface: 'rgba(30, 41, 59, 0.5)', // Slate 800 with alpha
    border: 'rgba(255, 255, 255, 0.1)',
    text: '#f8fafc', // Slate 50
    textMuted: '#94a3b8', // Slate 400
    success: '#10b981', // Emerald 500
    error: '#ef4444', // Red 500
};

export const GLASS = {
    backdropFilter: 'blur(16px) saturate(180%)',
    WebkitBackdropFilter: 'blur(16px) saturate(180%)',
    backgroundColor: COLORS.background,
    border: `1px solid ${COLORS.border}`,
};

export const SHADOWS = {
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
};

export const ANIMATIONS = {
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
};

export const TYPOGRAPHY = {
    fontFamily: '"Inter", system-ui, -apple-system, sans-serif',
    h1: { fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.025em' },
    h2: { fontSize: '1rem', fontWeight: 600 },
    body: { fontSize: '0.875rem', lineHeight: '1.25rem' },
    caption: { fontSize: '0.75rem', color: COLORS.textMuted },
};
