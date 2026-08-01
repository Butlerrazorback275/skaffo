/**
 * Theme engine.
 *
 * Colours live as CSS custom properties on <html>, so switching a theme is a
 * single attribute change — no re-render, no flash, and Tailwind classes keep
 * working because every token maps to a var().
 */

export type ThemeId = 'dark' | 'light' | 'midnight' | 'nord';

export interface ThemeTokens {
  bg: string;
  sidebar: string;
  card: string;
  line: string;
  txt: string;
  muted: string;
  /** Base surface for inputs/wells. */
  well: string;
  /** Slight elevation over the card. */
  raise: string;
  shadow: string;
  /** Overlay behind modals. */
  scrim: string;
  /** Background for code blocks and diffs. */
  code: string;
}

export const THEMES: Record<ThemeId, { label: string; dark: boolean; tokens: ThemeTokens }> = {
  dark: {
    label: 'Dark',
    dark: true,
    tokens: {
      bg: '#0F172A',
      sidebar: '#111827',
      card: '#1E293B',
      line: 'rgba(148,163,184,0.14)',
      txt: '#F8FAFC',
      muted: '#94A3B8',
      well: 'rgba(0,0,0,0.25)',
      raise: 'rgba(255,255,255,0.03)',
      shadow: '0 8px 32px rgba(0,0,0,0.37)',
      scrim: 'rgba(0,0,0,0.70)',
      code: 'rgba(0,0,0,0.30)',
    },
  },
  light: {
    label: 'Light',
    dark: false,
    tokens: {
      bg: '#F8FAFC',
      sidebar: '#FFFFFF',
      card: '#FFFFFF',
      line: 'rgba(15,23,42,0.10)',
      txt: '#0F172A',
      muted: '#64748B',
      well: 'rgba(15,23,42,0.04)',
      raise: 'rgba(15,23,42,0.02)',
      shadow: '0 4px 20px rgba(15,23,42,0.08)',
      scrim: 'rgba(15,23,42,0.45)',
      code: '#F1F5F9',
    },
  },
  midnight: {
    label: 'Midnight',
    dark: true,
    tokens: {
      bg: '#09090B',
      sidebar: '#0C0C0F',
      card: '#18181B',
      line: 'rgba(161,161,170,0.13)',
      txt: '#FAFAFA',
      muted: '#A1A1AA',
      well: 'rgba(0,0,0,0.35)',
      raise: 'rgba(255,255,255,0.025)',
      shadow: '0 8px 32px rgba(0,0,0,0.5)',
      scrim: 'rgba(0,0,0,0.75)',
      code: 'rgba(0,0,0,0.40)',
    },
  },
  nord: {
    label: 'Nord',
    dark: true,
    tokens: {
      bg: '#2E3440',
      sidebar: '#292E39',
      card: '#3B4252',
      line: 'rgba(216,222,233,0.13)',
      txt: '#ECEFF4',
      muted: '#9BA7BC',
      well: 'rgba(0,0,0,0.20)',
      raise: 'rgba(255,255,255,0.04)',
      shadow: '0 8px 32px rgba(0,0,0,0.30)',
      scrim: 'rgba(20,24,32,0.65)',
      code: 'rgba(0,0,0,0.22)',
    },
  },
};

/** Accent presets offered in Settings. */
export const ACCENTS = [
  '#6366F1', '#7C3AED', '#10B981',
  '#EF4444', '#F59E0B', '#06B6D4',
  '#EC4899', '#22C55E',
];

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp(((n >> 16) & 255) + amount);
  const g = clamp(((n >> 8) & 255) + amount);
  const b = clamp((n & 255) + amount);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** rgba() string from a hex + alpha, for translucent accent surfaces. */
function alpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** "#1E293B" -> "30 41 59" so Tailwind can do `bg-card/95`. */
function channels(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

export function applyTheme(theme: ThemeId, accent: string): void {
  const t = THEMES[theme] ?? THEMES.dark;
  const root = document.documentElement;
  const s = root.style;

  for (const [key, value] of Object.entries(t.tokens)) {
    s.setProperty(`--cf-${key}`, value);
    // Opacity modifiers (bg-card/95) need bare channels, not a hex string.
    // Tokens that are already rgba() stay as-is and simply aren't used
    // with an alpha modifier.
    if (value.startsWith('#')) {
      s.setProperty(`--cf-${key}-rgb`, channels(value));
    }
  }

  s.setProperty('--cf-primary', accent);
  s.setProperty('--cf-primary-rgb', channels(accent));
  s.setProperty('--cf-hover', shade(accent, -22));
  s.setProperty('--cf-primary-soft', alpha(accent, 0.15));
  s.setProperty('--cf-primary-ring', alpha(accent, 0.4));

  root.dataset.theme = theme;
  root.style.colorScheme = t.dark ? 'dark' : 'light';
}
