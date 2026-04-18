import type { Config } from 'tailwindcss'
import { colors } from '@biztrack/theme/tokens'
import baseConfig from '../web/tailwind.config'

const config: Config = {
  ...baseConfig,
  content: [
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    ...baseConfig.theme,
    extend: {
      ...baseConfig.theme?.extend,
      // Desktop gets slightly denser typography for information density
      fontSize: {
        ...baseConfig.theme?.extend?.fontSize,
        'body-md': ['13px', { lineHeight: '1.5', fontWeight: '400' }],
        'label-md': ['11px', { lineHeight: '1.4', fontWeight: '500' }],
      },
    },
  },
}

export default config
