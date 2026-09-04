import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#0E1116',
          900: '#14171C',
          800: '#1C2128',
          700: '#262C35',
          600: '#333B46',
        },
        line: '#2E353F',
        paper: '#F6F4EF',
        text: {
          DEFAULT: '#E6E8EB',
          muted: '#8A919C',
          onPaper: '#1B1D21',
        },
        amber: {
          DEFAULT: '#E8A33D',
          dim: '#B57C29',
          bright: '#F5BB63',
        },
        success: '#4FA876',
        danger: '#D65F5F',
        info: '#5B8FD6',
        // Customer menu (dark, food-app aesthetic). Kept separate from the
        // staff `ink` chrome so the two surfaces can evolve independently.
        surface: {
          950: '#0B0B0D',
          900: '#141416',
          800: '#1C1C1F',
          700: '#26262B',
        },
        brand: {
          DEFAULT: '#E23744',
          bright: '#F0525E',
          dim: '#B72A36',
        },
        rating: '#267E3E',
        veg: '#2EA043',
        nonveg: '#E43B4F',
        egg: '#D9A129',
      },
      fontFamily: {
        display: ['var(--font-display)', 'sans-serif'],
        body: ['var(--font-body)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      borderRadius: {
        sm: '4px',
        DEFAULT: '8px',
        lg: '14px',
      },
      boxShadow: {
        panel: '0 1px 0 rgba(255,255,255,0.03) inset, 0 8px 24px rgba(0,0,0,0.35)',
      },
    },
  },
  plugins: [],
};

export default config;
