/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}', './scripts/**/*.{js,ts}'],
  theme: {
    extend: {
      colors: {
        bg: {
          base: '#05070D',
          surface: '#08111F',
          elevated: '#0C1828',
        },
        brand: {
          blue: '#229ED9',
          cyan: '#2FE6D1',
          violet: '#6E3BFF',
        },
        border: 'var(--border)',
        ring: 'var(--ring)',
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        card: 'var(--card)',
        'card-foreground': 'var(--card-foreground)',
        popover: 'var(--popover)',
        'popover-foreground': 'var(--popover-foreground)',
        primary: 'var(--primary)',
        'primary-foreground': 'var(--primary-foreground)',
        secondary: 'var(--secondary)',
        'secondary-foreground': 'var(--secondary-foreground)',
        muted: 'var(--muted)',
        'muted-foreground': 'var(--muted-foreground)',
        accent: 'var(--accent)',
        'accent-foreground': 'var(--accent-foreground)',
        destructive: 'var(--destructive)',
        input: 'var(--input)',
        outline: 'var(--ring)',
      },
      fontFamily: {
        sans: ['Manrope', 'Inter', 'system-ui', 'sans-serif'],
        display: ['Unbounded', 'Manrope', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 40px rgba(34,158,217,0.45), 0 0 80px rgba(47,230,209,0.18)',
        'glow-violet': '0 0 40px rgba(110,59,255,0.45)',
        card: '0 8px 40px -8px rgba(0,0,0,0.6)',
      },
      backgroundImage: {
        'grad-cta': 'linear-gradient(135deg, #229ED9 0%, #2FE6D1 100%)',
        'grad-violet': 'linear-gradient(135deg, #6E3BFF 0%, #229ED9 100%)',
        'grad-radial': 'radial-gradient(ellipse at top, rgba(34,158,217,0.18), transparent 60%)',
      },
      animation: {
        'fade-up': 'fadeUp 0.8s ease-out both',
        'fade-in': 'fadeIn 0.6s ease-out both',
        'float': 'float 6s ease-in-out infinite',
        'pulse-glow': 'pulseGlow 2.4s ease-in-out infinite',
        'pop-in': 'popIn 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both',
        'arrow-flow': 'arrowFlow 2s linear infinite',
        'gradient-pan': 'gradientPan 15s ease-in-out infinite',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        float: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-12px)' },
        },
        pulseGlow: {
          '0%,100%': { boxShadow: '0 0 0 0 rgba(47,230,209,0.55), 0 0 30px rgba(34,158,217,0.4)' },
          '50%': { boxShadow: '0 0 0 14px rgba(47,230,209,0), 0 0 60px rgba(34,158,217,0.7)' },
        },
        popIn: {
          '0%': { opacity: '0', transform: 'scale(0.85) translateY(8px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        arrowFlow: {
          '0%': { transform: 'translateX(-6px)', opacity: '0.2' },
          '50%': { opacity: '1' },
          '100%': { transform: 'translateX(6px)', opacity: '0.2' },
        },
        gradientPan: {
          '0%,100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
      },
    },
  },
  plugins: [],
}
