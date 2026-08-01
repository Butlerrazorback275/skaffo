/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Every colour resolves to a CSS variable, so switching themes is a
      // single attribute change with no re-render.
      colors: {
        // rgb(... / <alpha-value>) lets `bg-card/95` work. Without the raw
        // channels Tailwind silently emits nothing for opacity modifiers.
        bg:      'rgb(var(--cf-bg-rgb) / <alpha-value>)',
        sidebar: 'rgb(var(--cf-sidebar-rgb) / <alpha-value>)',
        card:    'rgb(var(--cf-card-rgb) / <alpha-value>)',
        txt:     'rgb(var(--cf-txt-rgb) / <alpha-value>)',
        muted:   'rgb(var(--cf-muted-rgb) / <alpha-value>)',
        primary: 'rgb(var(--cf-primary-rgb) / <alpha-value>)',
        line:    'var(--cf-line)',
        well:    'var(--cf-well)',
        raise:   'var(--cf-raise)',
        hover:   'var(--cf-hover)',
        scrim:   'var(--cf-scrim)',
        code:    'var(--cf-code)',
        success: '#10B981',
        danger:  '#EF4444',
        warn:    '#F59E0B',
      },
      fontFamily: {
        sans: ['var(--cf-font)', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      transitionDuration: { DEFAULT: '200ms' },
      boxShadow: {
        glass: 'var(--cf-shadow)',
        glow: '0 0 0 1px var(--cf-primary-ring), 0 8px 30px var(--cf-primary-soft)',
      },
      keyframes: {
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
      },
      animation: { shimmer: 'shimmer 2.5s linear infinite' },
    },
  },
  plugins: [],
};
