/* ── Accent colour presets ─────────────────────────────────── */
export const ACCENTS = [
    { id: 'indigo', label: 'Indigo', dot: '#6366f1', gradient: 'linear-gradient(135deg,#4f46e5,#6366f1,#818cf8)', glow: 'rgba(99,102,241,0.35)' },
    { id: 'sky', label: 'Sky', dot: '#0ea5e9', gradient: 'linear-gradient(135deg,#0284c7,#0ea5e9,#38bdf8)', glow: 'rgba(14,165,233,0.3)' },
    { id: 'emerald', label: 'Emerald', dot: '#10b981', gradient: 'linear-gradient(135deg,#059669,#10b981,#34d399)', glow: 'rgba(16,185,129,0.3)' },
    { id: 'violet', label: 'Violet', dot: '#8b5cf6', gradient: 'linear-gradient(135deg,#7c3aed,#8b5cf6,#a78bfa)', glow: 'rgba(139,92,246,0.3)' },
    { id: 'rose', label: 'Rose', dot: '#f43f5e', gradient: 'linear-gradient(135deg,#e11d48,#f43f5e,#fb7185)', glow: 'rgba(244,63,94,0.3)' },
    { id: 'amber', label: 'Amber', dot: '#f59e0b', gradient: 'linear-gradient(135deg,#d97706,#f59e0b,#fbbf24)', glow: 'rgba(245,158,11,0.3)' },
    { id: 'teal', label: 'Teal', dot: '#14b8a6', gradient: 'linear-gradient(135deg,#0d9488,#14b8a6,#2dd4bf)', glow: 'rgba(20,184,166,0.3)' },
    { id: 'orange', label: 'Orange', dot: '#f97316', gradient: 'linear-gradient(135deg,#ea580c,#f97316,#fb923c)', glow: 'rgba(249,115,22,0.3)' },
];

/**
 * Applies the selected accent color to the CSS variables.
 * @param {string} accentId - The ID of the accent color to apply.
 */
export function applyAccent(accentId) {
    const a = ACCENTS.find(x => x.id === accentId) ?? ACCENTS[0];
    const root = document.documentElement;
    root.style.setProperty('--brand-primary', a.dot);
    root.style.setProperty('--brand-gradient', a.gradient);
    root.style.setProperty('--brand-glow', a.glow);
}

/**
 * Applies the selected color mode (dark/light/system) to the data-theme attribute.
 * @param {string} mode - The theme mode (dark, light, or system).
 */
export function applyColorMode(mode) {
    const html = document.documentElement;
    if (mode === 'system') {
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        html.setAttribute('data-theme', isDark ? 'dark' : 'light');
    } else {
        html.setAttribute('data-theme', mode);
    }
}
