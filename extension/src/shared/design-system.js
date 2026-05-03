/**
 * WebGuide Extension Design System — Neutral Edition
 *
 * A site-agnostic palette:
 * - Neutral frosted-glass dark panel (no brand color)
 * - White/silver accents that read well on ANY background
 * - Minimal accent: warm white glow instead of blue
 */

export const COLORS = {
    primary: '#ffffff',          // Pure white — universal accent
    primaryHover: '#e2e8f0',     // Slight warm tone on hover
    secondary: '#cbd5e1',        // Silver / Slate 300
    background: 'rgba(10, 10, 12, 0.45)',   // Ultra-transparent ghost background
    surface: 'rgba(50, 50, 60, 0.3)',        // Floating surface tint
    border: 'rgba(255, 255, 255, 0.12)',     // Subtle glass boundary
    text: '#ffffff',             // Bright white for readability
    textMuted: '#cbd5e1',        // Slate 300
    success: '#4ade80',
    error: '#f87171',
    accent: 'rgba(255, 255, 255, 0.12)',
};

export const GLASS = {
    backdropFilter: 'blur(20px) saturate(160%)',
    WebkitBackdropFilter: 'blur(20px) saturate(160%)',
    backgroundColor: COLORS.background,
    border: `1px solid ${COLORS.border}`,
};

export const SHADOWS = {
    xl: '0 24px 48px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255,255,255,0.05)',
};

export const ANIMATIONS = {
    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
};

export const TYPOGRAPHY = {
    fontFamily: '"Inter", system-ui, -apple-system, sans-serif',
    h1: { fontSize: '1.1rem', fontWeight: 700, letterSpacing: '-0.02em', color: '#ffffff' },
    h2: { fontSize: '0.95rem', fontWeight: 600, color: '#f1f5f9' },
    body: { fontSize: '0.875rem', lineHeight: '1.35rem', color: '#cbd5e1' },
    caption: { fontSize: '0.72rem', color: '#64748b', lineHeight: '1rem' },
};
