import React from 'react'
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableOpacityProps,
  View,
} from 'react-native'

import theme from '../../../theme'
const { colors, radius } = theme

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface AppButtonProps extends Omit<TouchableOpacityProps, 'style'> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  fullWidth?: boolean
  children: React.ReactNode
}

const VARIANT_STYLES: Record<ButtonVariant, { bg: string; text: string; border?: string }> = {
  primary:   { bg: colors.primary,            text: colors.neutral[50] },
  secondary: { bg: colors.neutral[50],        text: colors.primary,      border: colors.primary },
  ghost:     { bg: 'transparent',             text: colors.neutral[400] },
  danger:    { bg: colors.danger[400],        text: colors.neutral[50] },
}

const SIZE_STYLES: Record<ButtonSize, { px: number; py: number; fontSize: number }> = {
  sm: { px: 12, py: 8,  fontSize: 12 },
  md: { px: 16, py: 13, fontSize: 14 },
  lg: { px: 24, py: 16, fontSize: 15 },
}

export const AppButton: React.FC<AppButtonProps> = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  disabled,
  children,
  ...props
}) => {
  const vs = VARIANT_STYLES[variant]
  const ss = SIZE_STYLES[size]
  const isDisabled = disabled || loading

  return (
    <TouchableOpacity
      activeOpacity={0.82}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      {...props}
      style={[
        styles.button,
        {
          backgroundColor: vs.bg,
          borderWidth: vs.border ? 1.5 : 0,
          borderColor: vs.border,
          paddingHorizontal: ss.px,
          paddingVertical: ss.py,
          width: fullWidth ? '100%' : undefined,
          opacity: isDisabled ? 0.55 : 1,
        }
      ]}
    >
      {loading ? (
        // Loading: show only spinner, no children — avoids double rendering
        <ActivityIndicator size="small" color={vs.text} />
      ) : typeof children === 'string' ? (
        <Text style={[styles.text, { fontSize: ss.fontSize, color: vs.text }]}>
          {children}
        </Text>
      ) : (
        <View style={styles.childContainer}>
          {children}
        </View>
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  button: {
    borderRadius: radius.btn,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  text: {
    fontWeight: '500',
  },
  childContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
})
