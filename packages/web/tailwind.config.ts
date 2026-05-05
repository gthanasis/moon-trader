import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg:      'var(--bg)',
        surface: 'var(--surface)',
        sf2:     'var(--sf2)',
        border:  'var(--border)',
        fg:      'var(--fg)',
        muted:   'var(--muted)',
        accent:  'var(--accent)',
        pos:     'var(--pos)',
        neg:     'var(--neg)',
        warn:    'var(--warn)',
        info:    'var(--info)',
      },
      fontFamily: {
        display: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'system-ui', 'sans-serif'],
        body:    ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'system-ui', 'sans-serif'],
        mono:    ['JetBrains Mono', 'IBM Plex Mono', 'ui-monospace', 'Menlo', 'monospace'],
      },
      borderRadius: {
        sm: '3px',
        DEFAULT: '5px',
        md: '5px',
        lg: '10px',
      },
      fontSize: {
        '2xs': '9.5px',
        xs:    '10px',
        sm:    '11px',
        base:  '12px',
        stat:  '20px',
      },
    },
  },
  plugins: [],
}

export default config
