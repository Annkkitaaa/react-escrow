/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // DoraHacks brand palette — orange / black / white
        brand: {
          50:  '#fff5eb',
          100: '#ffe8cc',
          200: '#ffcf99',
          300: '#ffad5c',
          400: '#ff8c24',
          500: '#ff6b00',   // DoraHacks primary orange
          600: '#e55e00',
          700: '#bf4d00',
          800: '#993d00',
          900: '#7a3100',
          950: '#3d1800',
        },
        // Surface palette — near-black backgrounds
        surface: {
          base:  '#0a0a0a',   // page background
          card:  '#141414',   // card background
          hover: '#1c1c1c',   // card hover
          border:'#252525',   // border / divider
          input: '#1a1a1a',   // input fields
          muted: '#2a2a2a',   // muted / disabled surfaces
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      backgroundImage: {
        // Orange radial glow — used behind hero content
        'glow-orange': 'radial-gradient(ellipse 60% 40% at 50% 0%, rgba(255,107,0,0.15) 0%, transparent 70%)',
        // Subtle card gradient
        'card-gradient': 'linear-gradient(135deg, #141414 0%, #0f0f0f 100%)',
        // Orange → transparent gradient for accents
        'orange-fade': 'linear-gradient(90deg, #ff6b00 0%, rgba(255,107,0,0) 100%)',
      },
      boxShadow: {
        'orange-sm':  '0 0 12px rgba(255,107,0,0.25)',
        'orange-md':  '0 0 24px rgba(255,107,0,0.30)',
        'orange-lg':  '0 0 48px rgba(255,107,0,0.20)',
        'card':       '0 1px 3px rgba(0,0,0,0.6), 0 1px 2px rgba(0,0,0,0.8)',
        'card-hover': '0 4px 20px rgba(0,0,0,0.7), 0 0 1px rgba(255,107,0,0.3)',
      },
      animation: {
        'pulse-slow':    'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'pulse-orange':  'pulseOrange 2s ease-in-out infinite',
        'slide-in':      'slideIn 0.3s ease-out',
        'slide-up':      'slideUp 0.3s ease-out',
        'fade-in':       'fadeIn 0.2s ease-out',
        'glow':          'glow 2s ease-in-out infinite alternate',
        'spin-slow':     'spin 8s linear infinite',
      },
      keyframes: {
        slideIn: {
          '0%':   { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)',    opacity: '1' },
        },
        slideUp: {
          '0%':   { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',   opacity: '1' },
        },
        fadeIn: {
          '0%':   { opacity: '0', transform: 'translateY(-4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseOrange: {
          '0%, 100%': { boxShadow: '0 0 6px rgba(255,107,0,0.4)' },
          '50%':      { boxShadow: '0 0 18px rgba(255,107,0,0.8)' },
        },
        glow: {
          '0%':   { textShadow: '0 0 8px rgba(255,107,0,0.5)' },
          '100%': { textShadow: '0 0 20px rgba(255,107,0,0.9)' },
        },
      },
      borderRadius: {
        'xl':  '12px',
        '2xl': '16px',
        '3xl': '24px',
      },
    },
  },
  plugins: [],
}
