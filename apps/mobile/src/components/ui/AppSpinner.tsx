import React from 'react'
import { ActivityIndicator, View } from 'react-native'

import theme from '../../../theme'
const { colors } = theme

interface AppSpinnerProps {
  /** Size affects both visually and structurally. Default is 'md' ('small' native).
   * 'sm' explicitly sets scaled small bounds. 'md' is standard inline loading. 'lg' is blocking. */
  size?: 'sm' | 'md' | 'lg'
  color?: string
  className?: string
}

const SIZE_MAP = {
  sm: 'small', // Rendered identically native, but semantic difference for layout
  md: 'small',
  lg: 'large',
} as const

export const AppSpinner: React.FC<AppSpinnerProps> = ({
  size = 'md',
  color = colors.brand[600],
  className,
}) => {
  return (
    <View 
      className={className}
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
      style={size === 'sm' ? { transform: [{ scale: 0.8 }] } : undefined}
    >
      <ActivityIndicator size={SIZE_MAP[size]} color={color} />
    </View>
  )
}
