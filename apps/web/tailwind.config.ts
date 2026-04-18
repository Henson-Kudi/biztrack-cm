import type { Config } from 'tailwindcss'
import { colors } from '@biztrack/theme/tokens'

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Brand
        brand: {
          50: colors.brand[50],
          100: colors.brand[100],
          200: colors.brand[200],
          400: colors.brand[400],
          600: colors.brand[600],
          800: colors.brand[800],
          900: colors.brand[900],
        },
        // Neutral (warm gray)
        neutral: {
          50: colors.neutral[50],
          100: colors.neutral[100],
          200: colors.neutral[200],
          300: colors.neutral[300],
          400: colors.neutral[400],
          500: colors.neutral[500],
          600: colors.neutral[600],
          700: colors.neutral[700],
          800: colors.neutral[800],
          900: colors.neutral[900],
          950: colors.neutral[950],
        },
        // Semantic
        success: {
          50: colors.success[50],
          100: colors.success[100],
          400: colors.success[400],
          600: colors.success[600],
          800: colors.success[800],
        },
        warning: {
          50: colors.warning[50],
          100: colors.warning[100],
          400: colors.warning[400],
          600: colors.warning[600],
          800: colors.warning[800],
        },
        danger: {
          50: colors.danger[50],
          100: colors.danger[100],
          400: colors.danger[400],
          600: colors.danger[600],
          800: colors.danger[800],
        },
        info: {
          50: colors.info[50],
          100: colors.info[100],
          400: colors.info[400],
          600: colors.info[600],
          800: colors.info[800],
        },
        // shadcn/ui CSS variable mappings
        background: 'rgb(var(--background) / <alpha-value>)',
        foreground: 'rgb(var(--foreground) / <alpha-value>)',
        card: {
          DEFAULT: 'rgb(var(--card) / <alpha-value>)',
          foreground: 'rgb(var(--card-foreground) / <alpha-value>)',
        },
        popover: {
          DEFAULT: 'rgb(var(--popover) / <alpha-value>)',
          foreground: 'rgb(var(--popover-foreground) / <alpha-value>)',
        },
        primary: {
          DEFAULT: 'rgb(var(--primary) / <alpha-value>)',
          foreground: 'rgb(var(--primary-foreground) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'rgb(var(--secondary) / <alpha-value>)',
          foreground: 'rgb(var(--secondary-foreground) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'rgb(var(--muted) / <alpha-value>)',
          foreground: 'rgb(var(--muted-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          foreground: 'rgb(var(--accent-foreground) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'rgb(var(--destructive) / <alpha-value>)',
          foreground: 'rgb(var(--destructive-foreground) / <alpha-value>)',
        },
        border: 'rgb(var(--border) / <alpha-value>)',
        input: 'rgb(var(--input) / <alpha-value>)',
        ring: 'rgb(var(--ring) / <alpha-value>)',
        chart: {
          1: 'rgb(var(--chart-1) / <alpha-value>)',
          2: 'rgb(var(--chart-2) / <alpha-value>)',
          3: 'rgb(var(--chart-3) / <alpha-value>)',
          4: 'rgb(var(--chart-4) / <alpha-value>)',
          5: 'rgb(var(--chart-5) / <alpha-value>)',
        },
      },

      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },

      fontSize: {
        'display-lg': ['2rem', { lineHeight: '1.2', fontWeight: '600' }],
        'display-sm': ['1.5rem', { lineHeight: '1.25', fontWeight: '600' }],
        'heading-lg': ['1.25rem', { lineHeight: '1.3', fontWeight: '600' }],
        'heading-md': ['1rem', { lineHeight: '1.4', fontWeight: '600' }],
        'heading-sm': ['0.875rem', { lineHeight: '1.4', fontWeight: '600' }],
        'body-lg': ['1rem', { lineHeight: '1.6', fontWeight: '400' }],
        'body-md': ['0.875rem', { lineHeight: '1.6', fontWeight: '400' }],
        'body-sm': ['0.8125rem', { lineHeight: '1.5', fontWeight: '400' }],
        'label-lg': ['0.875rem', { lineHeight: '1.4', fontWeight: '500' }],
        'label-md': ['0.75rem', { lineHeight: '1.4', fontWeight: '500' }],
        'label-sm': ['0.6875rem', { lineHeight: '1.4', fontWeight: '500' }],
      },

      spacing: {
        '4.5': '1.125rem',
        '18': '4.5rem',
        '22': '5.5rem',
      },

      borderRadius: {
        sm: '4px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        '2xl': '20px',
      },

      boxShadow: {
        sm: '0 1px 2px rgba(4, 44, 83, 0.06)',
        md: '0 2px 8px rgba(4, 44, 83, 0.08), 0 1px 2px rgba(4, 44, 83, 0.04)',
        lg: '0 8px 24px rgba(4, 44, 83, 0.10), 0 2px 6px rgba(4, 44, 83, 0.06)',
        xl: '0 16px 48px rgba(4, 44, 83, 0.12), 0 4px 12px rgba(4, 44, 83, 0.08)',
      },

      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
        'slide-in-up': {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.15s ease-out',
        'slide-in-right': 'slide-in-right 0.2s ease-out',
        'slide-in-up': 'slide-in-up 0.2s ease-out',
      },
    },
  },
  plugins: [
    require('tailwindcss-animate'),
  ],
}

export default config
