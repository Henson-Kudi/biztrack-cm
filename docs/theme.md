# BizTrack CM — Design System & Theme Tokens
**Shared across: apps/admin-web · apps/web · apps/mobile · apps/desktop**

---

## 1. Brand Identity

BizTrack CM is a financial management tool for Cameroonian SMEs. The visual language must communicate:

- **Trust** — this software handles money and business data
- **Clarity** — users range from tech-savvy to low-literacy; the UI must be instantly readable
- **Confidence** — bold enough to feel premium, not cluttered or anxious
- **Local warmth** — not cold enterprise software; accessible and human

The primary color is **Deep Blue** — the color of trust, reliability, and finance across cultures. It is paired with clean neutrals and purposeful semantic colors. No gradients. No decoration. Substance first.

---

## 2. Color Palette

### 2.1 Brand Colors (Primary — Deep Blue)

| Token | Hex | Usage |
|-------|-----|-------|
| `brand-50` | `#E6F1FB` | Light tints, hover backgrounds, selected states |
| `brand-100` | `#B5D4F4` | Borders on light backgrounds, icon fills |
| `brand-200` | `#85B7EB` | Muted icons, secondary text on dark bg |
| `brand-400` | `#378ADD` | Interactive elements, links, active indicators |
| `brand-600` | `#185FA5` | **Primary brand color** — buttons, active nav, key UI |
| `brand-800` | `#0C447C` | Hover states on brand-600, headings on light bg |
| `brand-900` | `#042C53` | **App headers, sidebars, dark surfaces** |

### 2.2 Neutral Colors (Gray — Warm)

Warm gray (slightly yellow-tinted) rather than cool gray. Feels more approachable and pairs better with the deep blue.

| Token | Hex | Usage |
|-------|-----|-------|
| `neutral-50` | `#F8F7F4` | Page background (light mode) |
| `neutral-100` | `#EFEDE8` | Card backgrounds, subtle dividers |
| `neutral-200` | `#D9D6CF` | Borders, disabled states |
| `neutral-300` | `#C2BFB7` | Placeholder text borders |
| `neutral-400` | `#8C8980` | Placeholder text, muted icons |
| `neutral-500` | `#6B6861` | Secondary text, captions |
| `neutral-600` | `#4A4843` | Body text |
| `neutral-700` | `#343230` | Primary text (light mode) |
| `neutral-800` | `#1F1E1C` | Headings, high emphasis text |
| `neutral-900` | `#111110` | Maximum contrast text |
| `neutral-950` | `#0A0A09` | Dark mode backgrounds |

### 2.3 Semantic Colors

#### Success (Green)
| Token | Hex | Usage |
|-------|-----|-------|
| `success-50` | `#EAF3DE` | Success background tint |
| `success-100` | `#C0DD97` | Success border light |
| `success-400` | `#639922` | Success icons, text on light bg |
| `success-600` | `#3B6D11` | Success badges, confirmed states |
| `success-800` | `#27500A` | Success text on tinted bg |

#### Warning (Amber)
| Token | Hex | Usage |
|-------|-----|-------|
| `warning-50` | `#FAEEDA` | Warning background tint |
| `warning-100` | `#FAC775` | Warning border light |
| `warning-400` | `#BA7517` | Warning icons, text |
| `warning-600` | `#854F0B` | Warning badges |
| `warning-800` | `#633806` | Warning text on tinted bg |

#### Danger (Red)
| Token | Hex | Usage |
|-------|-----|-------|
| `danger-50` | `#FCEBEB` | Danger background tint |
| `danger-100` | `#F7C1C1` | Danger border light |
| `danger-400` | `#E24B4A` | Danger icons, destructive actions |
| `danger-600` | `#A32D2D` | Danger badges, error states |
| `danger-800` | `#791F1F` | Danger text on tinted bg |

#### Info (Purple — used for special/pro features)
| Token | Hex | Usage |
|-------|-----|-------|
| `info-50` | `#EEEDFE` | Info background tint |
| `info-100` | `#CECBF6` | Info border light |
| `info-400` | `#7F77DD` | Info icons |
| `info-600` | `#534AB7` | Pro plan badges, special grants |
| `info-800` | `#3C3489` | Info text on tinted bg |

---

## 3. Semantic Design Tokens

These are the tokens components actually use. They map to the palette above but carry semantic meaning — changing light/dark mode means remapping these tokens, not changing every component.

### 3.1 Light Mode

```css
/* Background layers */
--bg-base:        #F8F7F4;   /* Page background */
--bg-surface:     #FFFFFF;   /* Cards, panels, modals */
--bg-elevated:    #FFFFFF;   /* Dropdowns, popovers (with shadow) */
--bg-subtle:      #EFEDE8;   /* Subtle section backgrounds */
--bg-inverse:     #042C53;   /* Headers, sidebars */

/* Brand surfaces */
--bg-brand:       #185FA5;   /* Primary buttons, active elements */
--bg-brand-hover: #0C447C;   /* Hover on brand */
--bg-brand-muted: #E6F1FB;   /* Tinted brand bg — selected rows, tags */

/* Semantic surfaces */
--bg-success:     #EAF3DE;
--bg-warning:     #FAEEDA;
--bg-danger:      #FCEBEB;
--bg-info:        #EEEDFE;

/* Text */
--text-primary:   #1F1E1C;   /* Body, labels */
--text-secondary: #4A4843;   /* Descriptions, captions */
--text-muted:     #8C8980;   /* Placeholders, hints */
--text-disabled:  #C2BFB7;   /* Disabled states */
--text-inverse:   #FFFFFF;   /* Text on dark backgrounds */
--text-brand:     #185FA5;   /* Links, brand text */
--text-brand-muted: #0C447C; /* Headings on brand-tinted bg */

/* Semantic text */
--text-success:   #3B6D11;
--text-warning:   #854F0B;
--text-danger:    #A32D2D;
--text-info:      #534AB7;

/* Borders */
--border-default: #D9D6CF;   /* Standard borders */
--border-subtle:  #EFEDE8;   /* Very subtle dividers */
--border-strong:  #C2BFB7;   /* Emphasis borders */
--border-brand:   #378ADD;   /* Focus rings, active borders */
--border-success: #C0DD97;
--border-warning: #FAC775;
--border-danger:  #F7C1C1;
--border-info:    #CECBF6;

/* Icons */
--icon-default:   #6B6861;
--icon-muted:     #8C8980;
--icon-brand:     #185FA5;
--icon-inverse:   #FFFFFF;
--icon-success:   #3B6D11;
--icon-warning:   #854F0B;
--icon-danger:    #A32D2D;

/* Interactive */
--focus-ring:     #378ADD;   /* Focus outline color */
--overlay:        rgba(4, 44, 83, 0.4);  /* Modal backdrop */
```

### 3.2 Dark Mode

```css
/* Background layers */
--bg-base:        #111110;   /* Page background */
--bg-surface:     #1C1C1B;   /* Cards, panels */
--bg-elevated:    #252523;   /* Dropdowns, popovers */
--bg-subtle:      #1C1C1B;   /* Subtle section backgrounds */
--bg-inverse:     #042C53;   /* Headers, sidebars (same as light) */

/* Brand surfaces */
--bg-brand:       #185FA5;   /* Same — brand blue holds in dark mode */
--bg-brand-hover: #1F72C4;   /* Slightly lighter hover in dark mode */
--bg-brand-muted: #0C1E33;   /* Dark tinted brand bg */

/* Semantic surfaces */
--bg-success:     #0D1F07;
--bg-warning:     #1F1100;
--bg-danger:      #200909;
--bg-info:        #0E0C24;

/* Text */
--text-primary:   #F0EFE9;   /* Near-white primary text */
--text-secondary: #A8A49C;   /* Muted secondary text */
--text-muted:     #6B6861;   /* Hints, placeholders */
--text-disabled:  #3D3C39;   /* Disabled */
--text-inverse:   #111110;   /* Text on light surfaces */
--text-brand:     #85B7EB;   /* Links in dark mode — lighter shade */
--text-brand-muted: #B5D4F4; /* Headings on dark brand bg */

/* Semantic text */
--text-success:   #97C459;
--text-warning:   #FAC775;
--text-danger:    #F09595;
--text-info:      #AFA9EC;

/* Borders */
--border-default: #2E2D2A;   /* Standard dark borders */
--border-subtle:  #222221;   /* Very subtle */
--border-strong:  #3D3C39;   /* Emphasis */
--border-brand:   #185FA5;
--border-success: #1D3A08;
--border-warning: #3A2000;
--border-danger:  #3A0F0F;
--border-info:    #1A1840;

/* Icons */
--icon-default:   #A8A49C;
--icon-muted:     #6B6861;
--icon-brand:     #85B7EB;
--icon-inverse:   #111110;
--icon-success:   #97C459;
--icon-warning:   #FAC775;
--icon-danger:    #F09595;

/* Interactive */
--focus-ring:     #378ADD;
--overlay:        rgba(0, 0, 0, 0.6);
```

---

## 4. Typography

One font family across all surfaces: **Inter**. Available via Google Fonts and bundles well in all environments (web, Expo, Electron).

```
Font family:  Inter
Fallbacks:    -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
```

### Scale

| Name | Size | Weight | Line Height | Usage |
|------|------|--------|-------------|-------|
| `display-lg` | 32px / 2rem | 600 | 1.2 | Hero headings |
| `display-sm` | 24px / 1.5rem | 600 | 1.25 | Page titles |
| `heading-lg` | 20px / 1.25rem | 600 | 1.3 | Section headings |
| `heading-md` | 16px / 1rem | 600 | 1.4 | Card titles |
| `heading-sm` | 14px / 0.875rem | 600 | 1.4 | Subsection labels |
| `body-lg` | 16px / 1rem | 400 | 1.6 | Primary body text |
| `body-md` | 14px / 0.875rem | 400 | 1.6 | Standard body, table rows |
| `body-sm` | 13px / 0.8125rem | 400 | 1.5 | Secondary info, captions |
| `label-lg` | 14px / 0.875rem | 500 | 1.4 | Form labels, nav items |
| `label-md` | 12px / 0.75rem | 500 | 1.4 | Badges, tags, small labels |
| `label-sm` | 11px / 0.6875rem | 500 | 1.4 | Micro labels, timestamps |
| `mono` | 13px / 0.8125rem | 400 | 1.5 | UUIDs, phone numbers, codes |

**Minimum font size: 11px** — nothing smaller on any surface.

---

## 5. Spacing Scale

Based on a 4px base unit. Used consistently across all surfaces.

```
1  →  4px    (0.25rem)  — Tight inline gaps
2  →  8px    (0.5rem)   — Icon padding, badge padding
3  →  12px   (0.75rem)  — Small component padding
4  →  16px   (1rem)     — Standard component padding
5  →  20px   (1.25rem)  — Card padding
6  →  24px   (1.5rem)   — Section padding
8  →  32px   (2rem)     — Large section gaps
10 →  40px   (2.5rem)   — Page section breaks
12 →  48px   (3rem)     — Large layout gaps
16 →  64px   (4rem)     — Hero sections
```

---

## 6. Border Radius

```
none   →  0px
sm     →  4px    Badges, tags, small pills
md     →  8px    Buttons, inputs, small cards
lg     →  12px   Cards, panels, modals
xl     →  16px   Large cards, bottom sheets (mobile)
2xl    →  20px   Modals on mobile
full   →  9999px Avatars, toggle switches, circular buttons
```

---

## 7. Shadows (Light Mode Only — Dark Mode Uses Borders)

```
shadow-sm:   0 1px 2px rgba(4, 44, 83, 0.06)
shadow-md:   0 2px 8px rgba(4, 44, 83, 0.08), 0 1px 2px rgba(4, 44, 83, 0.04)
shadow-lg:   0 8px 24px rgba(4, 44, 83, 0.10), 0 2px 6px rgba(4, 44, 83, 0.06)
shadow-xl:   0 16px 48px rgba(4, 44, 83, 0.12), 0 4px 12px rgba(4, 44, 83, 0.08)
```

Shadows use the brand-900 color tinted at low opacity — feels warmer and more cohesive than pure black shadows.

In dark mode, elevation is communicated through **background lightness** (bg-surface → bg-elevated → bg-subtle), not shadows.

---

## 8. shadcn/ui — CSS Variable Mapping

shadcn components use CSS variables following the convention below. Map BizTrack tokens to shadcn's expected variables.

### globals.css

```css
@layer base {
  :root {
    /* shadcn mapping → BizTrack light tokens */
    --background:             248 247 244;   /* neutral-50 in HSL-ish rgb */
    --foreground:             31 30 28;      /* neutral-800 */

    --card:                   255 255 255;
    --card-foreground:        31 30 28;

    --popover:                255 255 255;
    --popover-foreground:     31 30 28;

    --primary:                24 95 165;     /* brand-600 */
    --primary-foreground:     255 255 255;

    --secondary:              239 237 232;   /* neutral-100 */
    --secondary-foreground:   31 30 28;

    --muted:                  239 237 232;   /* neutral-100 */
    --muted-foreground:       140 137 128;   /* neutral-400 */

    --accent:                 230 241 251;   /* brand-50 */
    --accent-foreground:      12 68 124;     /* brand-800 */

    --destructive:            226 75 74;     /* danger-400 */
    --destructive-foreground: 255 255 255;

    --border:                 217 214 207;   /* neutral-200 */
    --input:                  217 214 207;
    --ring:                   55 138 221;    /* brand-400 */

    --radius: 0.5rem;                        /* 8px = md */

    /* Chart colors */
    --chart-1: 24 95 165;    /* brand-600 — primary series */
    --chart-2: 99 153 34;    /* success-400 */
    --chart-3: 186 117 23;   /* warning-400 */
    --chart-4: 226 75 74;    /* danger-400 */
    --chart-5: 83 74 183;    /* info-600 */
  }

  .dark {
    --background:             17 17 16;      /* neutral-950 */
    --foreground:             240 239 233;   /* near-white */

    --card:                   28 28 27;      /* bg-surface dark */
    --card-foreground:        240 239 233;

    --popover:                37 37 35;      /* bg-elevated dark */
    --popover-foreground:     240 239 233;

    --primary:                24 95 165;     /* brand-600 — same */
    --primary-foreground:     255 255 255;

    --secondary:              37 37 35;
    --secondary-foreground:   168 164 156;

    --muted:                  28 28 27;
    --muted-foreground:       107 104 97;    /* neutral-500 */

    --accent:                 12 30 51;      /* bg-brand-muted dark */
    --accent-foreground:      181 212 244;   /* brand-100 */

    --destructive:            163 45 45;     /* danger-600 */
    --destructive-foreground: 255 255 255;

    --border:                 46 45 42;      /* border-default dark */
    --input:                  46 45 42;
    --ring:                   55 138 221;    /* brand-400 — same */

    --chart-1: 55 138 221;   /* brand-400 — lighter in dark */
    --chart-2: 151 196 89;   /* success lighter */
    --chart-3: 250 199 117;  /* warning lighter */
    --chart-4: 240 149 149;  /* danger lighter */
    --chart-5: 175 169 236;  /* info lighter */
  }
}
```

---

## 9. Tailwind Configuration

```typescript
// tailwind.config.ts

import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',   // shared UI package
  ],
  theme: {
    extend: {
      colors: {
        // Brand
        brand: {
          50:  '#E6F1FB',
          100: '#B5D4F4',
          200: '#85B7EB',
          400: '#378ADD',
          600: '#185FA5',
          800: '#0C447C',
          900: '#042C53',
        },
        // Neutral (warm gray)
        neutral: {
          50:  '#F8F7F4',
          100: '#EFEDE8',
          200: '#D9D6CF',
          300: '#C2BFB7',
          400: '#8C8980',
          500: '#6B6861',
          600: '#4A4843',
          700: '#343230',
          800: '#1F1E1C',
          900: '#111110',
          950: '#0A0A09',
        },
        // Semantic
        success: {
          50:  '#EAF3DE',
          100: '#C0DD97',
          400: '#639922',
          600: '#3B6D11',
          800: '#27500A',
        },
        warning: {
          50:  '#FAEEDA',
          100: '#FAC775',
          400: '#BA7517',
          600: '#854F0B',
          800: '#633806',
        },
        danger: {
          50:  '#FCEBEB',
          100: '#F7C1C1',
          400: '#E24B4A',
          600: '#A32D2D',
          800: '#791F1F',
        },
        info: {
          50:  '#EEEDFE',
          100: '#CECBF6',
          400: '#7F77DD',
          600: '#534AB7',
          800: '#3C3489',
        },
      },

      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },

      fontSize: {
        'display-lg': ['2rem',    { lineHeight: '1.2',  fontWeight: '600' }],
        'display-sm': ['1.5rem',  { lineHeight: '1.25', fontWeight: '600' }],
        'heading-lg': ['1.25rem', { lineHeight: '1.3',  fontWeight: '600' }],
        'heading-md': ['1rem',    { lineHeight: '1.4',  fontWeight: '600' }],
        'heading-sm': ['0.875rem',{ lineHeight: '1.4',  fontWeight: '600' }],
        'body-lg':    ['1rem',    { lineHeight: '1.6',  fontWeight: '400' }],
        'body-md':    ['0.875rem',{ lineHeight: '1.6',  fontWeight: '400' }],
        'body-sm':    ['0.8125rem',{ lineHeight:'1.5',  fontWeight: '400' }],
        'label-lg':   ['0.875rem',{ lineHeight: '1.4',  fontWeight: '500' }],
        'label-md':   ['0.75rem', { lineHeight: '1.4',  fontWeight: '500' }],
        'label-sm':   ['0.6875rem',{lineHeight: '1.4',  fontWeight: '500' }],
      },

      spacing: {
        '4.5': '1.125rem',   // 18px — useful for icon buttons
        '18':  '4.5rem',     // 72px — common component heights
        '22':  '5.5rem',
      },

      borderRadius: {
        sm:   '4px',
        md:   '8px',
        lg:   '12px',
        xl:   '16px',
        '2xl':'20px',
      },

      boxShadow: {
        sm:  '0 1px 2px rgba(4, 44, 83, 0.06)',
        md:  '0 2px 8px rgba(4, 44, 83, 0.08), 0 1px 2px rgba(4, 44, 83, 0.04)',
        lg:  '0 8px 24px rgba(4, 44, 83, 0.10), 0 2px 6px rgba(4, 44, 83, 0.06)',
        xl:  '0 16px 48px rgba(4, 44, 83, 0.12), 0 4px 12px rgba(4, 44, 83, 0.08)',
      },

      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          from: { transform: 'translateX(100%)' },
          to:   { transform: 'translateX(0)' },
        },
        'slide-in-up': {
          from: { transform: 'translateY(100%)' },
          to:   { transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in':       'fade-in 0.15s ease-out',
        'slide-in-right':'slide-in-right 0.2s ease-out',
        'slide-in-up':   'slide-in-up 0.2s ease-out',
      },
    },
  },
  plugins: [
    require('tailwindcss-animate'),   // required by shadcn
  ],
}

export default config
```

---

## 10. React Native Theme (Mobile App)

The mobile app uses the same tokens through a `ThemeContext`. Since React Native does not use CSS variables, tokens are defined as JavaScript objects.

```typescript
// packages/theme/src/tokens.ts
// Used by apps/mobile ONLY for React Native
// Web and desktop use CSS variables via tailwind.config.ts

export const colors = {
  brand: {
    50:  '#E6F1FB',
    100: '#B5D4F4',
    200: '#85B7EB',
    400: '#378ADD',
    600: '#185FA5',
    800: '#0C447C',
    900: '#042C53',
  },
  neutral: {
    50:  '#F8F7F4',
    100: '#EFEDE8',
    200: '#D9D6CF',
    300: '#C2BFB7',
    400: '#8C8980',
    500: '#6B6861',
    600: '#4A4843',
    700: '#343230',
    800: '#1F1E1C',
    900: '#111110',
    950: '#0A0A09',
  },
  success: { 50:'#EAF3DE', 100:'#C0DD97', 400:'#639922', 600:'#3B6D11', 800:'#27500A' },
  warning: { 50:'#FAEEDA', 100:'#FAC775', 400:'#BA7517', 600:'#854F0B', 800:'#633806' },
  danger:  { 50:'#FCEBEB', 100:'#F7C1C1', 400:'#E24B4A', 600:'#A32D2D', 800:'#791F1F' },
  info:    { 50:'#EEEDFE', 100:'#CECBF6', 400:'#7F77DD', 600:'#534AB7', 800:'#3C3489' },
} as const

export const light = {
  bg: {
    base:        colors.neutral[50],
    surface:     '#FFFFFF',
    elevated:    '#FFFFFF',
    subtle:      colors.neutral[100],
    inverse:     colors.brand[900],
    brand:       colors.brand[600],
    brandHover:  colors.brand[800],
    brandMuted:  colors.brand[50],
    success:     colors.success[50],
    warning:     colors.warning[50],
    danger:      colors.danger[50],
    info:        colors.info[50],
  },
  text: {
    primary:     colors.neutral[800],
    secondary:   colors.neutral[600],
    muted:       colors.neutral[400],
    disabled:    colors.neutral[300],
    inverse:     '#FFFFFF',
    brand:       colors.brand[600],
    brandMuted:  colors.brand[800],
    success:     colors.success[600],
    warning:     colors.warning[600],
    danger:      colors.danger[600],
    info:        colors.info[600],
  },
  border: {
    default:  colors.neutral[200],
    subtle:   colors.neutral[100],
    strong:   colors.neutral[300],
    brand:    colors.brand[400],
    success:  colors.success[100],
    warning:  colors.warning[100],
    danger:   colors.danger[100],
    info:     colors.info[100],
  },
  icon: {
    default:  colors.neutral[500],
    muted:    colors.neutral[400],
    brand:    colors.brand[600],
    inverse:  '#FFFFFF',
    success:  colors.success[600],
    warning:  colors.warning[600],
    danger:   colors.danger[600],
  },
}

export const dark: typeof light = {
  bg: {
    base:        colors.neutral[950],
    surface:     '#1C1C1B',
    elevated:    '#252523',
    subtle:      '#1C1C1B',
    inverse:     colors.brand[900],
    brand:       colors.brand[600],
    brandHover:  '#1F72C4',
    brandMuted:  '#0C1E33',
    success:     '#0D1F07',
    warning:     '#1F1100',
    danger:      '#200909',
    info:        '#0E0C24',
  },
  text: {
    primary:     '#F0EFE9',
    secondary:   colors.neutral[400],
    muted:       colors.neutral[500],
    disabled:    '#3D3C39',
    inverse:     colors.neutral[950],
    brand:       colors.brand[200],
    brandMuted:  colors.brand[100],
    success:     '#97C459',
    warning:     '#FAC775',
    danger:      '#F09595',
    info:        '#AFA9EC',
  },
  border: {
    default:  '#2E2D2A',
    subtle:   '#222221',
    strong:   '#3D3C39',
    brand:    colors.brand[600],
    success:  '#1D3A08',
    warning:  '#3A2000',
    danger:   '#3A0F0F',
    info:     '#1A1840',
  },
  icon: {
    default:  colors.neutral[400],
    muted:    colors.neutral[500],
    brand:    colors.brand[200],
    inverse:  colors.neutral[950],
    success:  '#97C459',
    warning:  '#FAC775',
    danger:   '#F09595',
  },
}

export type Theme = typeof light
```

```typescript
// packages/theme/src/context.tsx
// React Native ThemeProvider — used in apps/mobile ONLY

import React, { createContext, useContext } from 'react'
import { useColorScheme } from 'react-native'
import { light, dark, colors, type Theme } from './tokens'

interface ThemeContextValue {
  theme:  Theme
  colors: typeof colors
  isDark: boolean
}

const ThemeContext = createContext<ThemeContextValue>({
  theme:  light,
  colors,
  isDark: false,
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const scheme = useColorScheme()
  const isDark  = scheme === 'dark'
  return (
    <ThemeContext.Provider value={{ theme: isDark ? dark : light, colors, isDark }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)

// Usage in any React Native component:
// const { theme } = useTheme()
// <View style={{ backgroundColor: theme.bg.surface }}>
```

---

## 11. Desktop App (Electron + Next.js)

The desktop app (`apps/desktop`) is **Electron + Next.js**. This means it uses the exact same styling approach as `apps/web` and `apps/admin-web` — Tailwind CSS + shadcn/ui + CSS variables. No separate token system needed.

### What this means in practice

- **Same `tailwind.config.ts`** — copy from `apps/web`, point content paths at `apps/desktop/src`
- **Same `globals.css`** — identical CSS variable definitions for light and dark mode
- **Same shadcn components** — install shadcn the same way, same component library
- **Same `next-themes`** — dark mode toggling works identically

The only desktop-specific consideration is **how dark mode preference is read**. On web, `next-themes` reads the browser/OS preference. On Electron, you additionally have access to `nativeTheme` from Electron's main process, which allows the app to respond to OS theme changes in real time and also lets you expose a manual override in the app's preferences.

### Electron + next-themes Integration

```typescript
// apps/desktop/src/app/providers.tsx
'use client'

import { ThemeProvider } from 'next-themes'
import { useEffect } from 'react'

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Listen for OS theme changes sent from Electron main process
    // Electron main sends: win.webContents.send('theme-changed', 'dark' | 'light')
    if (window?.electron?.onThemeChange) {
      window.electron.onThemeChange((theme: 'dark' | 'light') => {
        document.documentElement.classList.toggle('dark', theme === 'dark')
      })
    }
  }, [])

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  )
}
```

```typescript
// apps/desktop/electron/main.ts (relevant excerpt)
import { nativeTheme, BrowserWindow, ipcMain } from 'electron'

// Send initial theme on window load
win.webContents.on('did-finish-load', () => {
  win.webContents.send(
    'theme-changed',
    nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  )
})

// Send theme changes as OS switches
nativeTheme.on('updated', () => {
  win.webContents.send(
    'theme-changed',
    nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  )
})

// Allow renderer to manually set theme (from user preferences)
ipcMain.on('set-theme', (_, theme: 'dark' | 'light' | 'system') => {
  nativeTheme.themeSource = theme
})
```

### Desktop-Specific Tailwind Adjustments

The desktop app renders at larger viewport sizes than the web app. A few small adjustments in `tailwind.config.ts`:

```typescript
// apps/desktop/tailwind.config.ts
// Extends the base web config with desktop-specific overrides

import baseConfig from '../../apps/web/tailwind.config'

export default {
  ...baseConfig,
  content: [
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    ...baseConfig.theme,
    extend: {
      ...baseConfig.theme?.extend,
      // Desktop gets a slightly denser spacing scale
      // since it targets larger screens with mouse/keyboard
      fontSize: {
        ...baseConfig.theme?.extend?.fontSize,
        // Slightly tighter than web defaults for information density
        'body-md': ['13px', { lineHeight: '1.5', fontWeight: '400' }],
        'label-md': ['11px', { lineHeight: '1.4', fontWeight: '500' }],
      },
    },
  },
}
```

---

## 11. Plan & Status Badge Colors

Consistent across all surfaces — web, mobile, desktop.

| Plan | Background | Text | Border |
|------|-----------|------|--------|
| FREE | `neutral-100` | `neutral-600` | `neutral-200` |
| SOLO | `brand-50` | `brand-800` | `brand-100` |
| BUSINESS | `success-50` | `success-600` | `success-100` |
| PRO | `info-50` | `info-600` | `info-100` |

| Status | Background | Text |
|--------|-----------|------|
| ACTIVE | `success-50` | `success-600` |
| TRIAL | `brand-50` | `brand-600` |
| ONBOARDING | `warning-50` | `warning-600` |
| SUSPENDED | `danger-50` | `danger-600` |
| CANCELLED | `neutral-100` | `neutral-500` |
| PAST_DUE | `danger-50` | `danger-400` |

| Severity | Background | Text |
|----------|-----------|------|
| CRITICAL | `danger-50` | `danger-600` |
| WARNING | `warning-50` | `warning-600` |
| INFO | `info-50` | `info-600` |

| Role (Admin) | Background | Text |
|--------------|-----------|------|
| SUPER_ADMIN | `info-50` | `info-600` |
| FINANCE | `success-50` | `success-600` |
| SUPPORT | `brand-50` | `brand-600` |
| TECHNICAL | `warning-50` | `warning-600` |
| Custom | `neutral-100` | `neutral-600` |

| Role (Business Member) | Background | Text |
|------------------------|-----------|------|
| OWNER | `brand-50` | `brand-800` |
| MANAGER | `info-50` | `info-600` |
| CASHIER | `success-50` | `success-600` |
| ACCOUNTANT | `warning-50` | `warning-600` |

---

## 12. Dark Mode Implementation

### Web (Next.js + shadcn)

Use `next-themes` for dark mode toggling:

```bash
pnpm add next-themes
```

```typescript
// src/app/[locale]/layout.tsx
import { ThemeProvider } from 'next-themes'

<ThemeProvider
  attribute="class"
  defaultTheme="system"
  enableSystem
  disableTransitionOnChange
>
  {children}
</ThemeProvider>
```

The `attribute="class"` setting adds `class="dark"` to the `<html>` element, which activates the `.dark` CSS variables defined in `globals.css`. shadcn's `darkMode: ['class']` in `tailwind.config.ts` responds to this.

### Mobile (React Native + Expo)

```typescript
// app/_layout.tsx (Expo Router root)
import { ThemeProvider } from '@biztrack/theme'

export default function RootLayout() {
  return (
    <ThemeProvider>
      <Stack />
    </ThemeProvider>
  )
}
```

React Native's `useColorScheme()` hook reads the OS-level dark/light preference. The `ThemeProvider` in `packages/theme` maps this to the correct token set automatically.

### Desktop (Electron + React)

Same `ThemeProvider` from `packages/theme`. Electron's `nativeTheme.shouldUseDarkColors` can override system preference — expose this as a user setting in the desktop app's preferences.

---

## 13. Where This Lives in the Monorepo

```
packages/
└── theme/                      Shared theme package
    ├── package.json
    ├── src/
    │   ├── tokens.ts           Color palette + semantic tokens (JS objects)
    │   ├── context.tsx         ThemeProvider + useTheme (React Native)
    │   └── index.ts
    └── tsconfig.json

apps/
├── admin-web/
│   ├── tailwind.config.ts      Imports colors from packages/theme/src/tokens.ts
│   └── src/app/globals.css     CSS variables for shadcn
├── web/
│   ├── tailwind.config.ts      Same config as admin-web
│   └── src/app/globals.css     Same CSS variables
├── mobile/
│   └── src/app/_layout.tsx     Uses ThemeProvider from packages/theme
└── desktop/
    └── src/app.tsx             Uses ThemeProvider from packages/theme
```

The `tailwind.config.ts` in both web apps imports the raw color values from `packages/theme/src/tokens.ts` so the single source of truth for hex values is always `tokens.ts`. If a color ever changes, it changes in one file.