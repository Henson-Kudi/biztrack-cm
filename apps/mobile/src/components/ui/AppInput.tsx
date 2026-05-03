import React, { forwardRef, useState, useId } from 'react'
import {
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native'

import theme from '../../../theme'
const { colors, radius } = theme

export interface AppInputProps extends Omit<TextInputProps, 'style'> {
  label?: string
  error?: string
  hint?: string
  leftSlot?: React.ReactNode
  rightSlot?: React.ReactNode
  /** Optional: applies to the root container View */
  containerStyle?: StyleProp<ViewStyle>
}

export const AppInput = forwardRef<TextInput, AppInputProps>(({
  label,
  error,
  hint,
  leftSlot,
  rightSlot,
  containerStyle,
  ...inputProps
}, ref) => {
  const [focused, setFocused] = useState(false)
  const inputId = useId()

  const borderColor = error
    ? colors.danger[400]
    : focused
    ? colors.primary
    : colors.neutral[100]

  return (
    <View style={containerStyle}>
      {label ? (
        <Text style={styles.label} nativeID={inputId}>{label}</Text>
      ) : null}

      <View style={[styles.inputContainer, { borderColor }]}>
        {leftSlot ? (
          <View style={{ flexShrink: 0 }}>{leftSlot}</View>
        ) : null}

        <TextInput
          ref={ref}
          placeholderTextColor={colors.neutral[400]}
          accessibilityLabelledBy={label ? inputId : undefined}
          aria-invalid={!!error}
          {...inputProps}
          onFocus={(e) => {
            setFocused(true)
            inputProps.onFocus?.(e)
          }}
          onBlur={(e) => {
            setFocused(false)
            inputProps.onBlur?.(e)
          }}
          style={styles.input}
        />

        {rightSlot ? (
          <View style={{ flexShrink: 0 }}>{rightSlot}</View>
        ) : null}
      </View>

      {error ? (
        <Text
          style={styles.error}
          accessibilityLiveRegion="polite"
        >
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  )
})

AppInput.displayName = 'AppInput'

const styles = StyleSheet.create({
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.neutral[400],
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.neutral[50],
    borderWidth: 1.5,
    borderRadius: radius.input,
    paddingHorizontal: 14,
    paddingVertical: 4,
    gap: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: colors.neutral[800],
    paddingVertical: 12,
  },
  error: {
    fontSize: 12,
    color: colors.danger[400],
    marginTop: 4,
  },
  hint: {
    fontSize: 12,
    color: colors.neutral[400],
    marginTop: 4,
  },
})
