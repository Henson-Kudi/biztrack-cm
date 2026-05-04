import React, { useId } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'

import theme from '../../../theme'
const { colors, radius } = theme

export interface PhoneInputProps {
  value: string
  onChangeText: (text: string) => void
  error?: string
  label?: string
  placeholder?: string
  accessibilityLabel?: string
}

export const PhoneInput: React.FC<PhoneInputProps> = ({
  value,
  onChangeText,
  error,
  label, // externalized default, defined by parent based on locale
  placeholder = '6XX XXX XXX', // uniform placeholder, mostly doesn't need i18n
  accessibilityLabel,
}) => {
  const inputId = useId()

  return (
    <View>
      {label ? (
        <Text style={styles.label} nativeID={inputId}>
          {label}
        </Text>
      ) : null}

      <View
        style={[
          styles.inputContainer,
          { borderColor: error ? colors.danger[400] : colors.neutral[100] }
        ]}
      >
        {/* Flag + country code — non-tappable prefix */}
        <Text style={styles.flag}>🇨🇲</Text>
        <Text style={styles.countryCode}>+237</Text>

        {/* Vertical divider */}
        <View style={styles.divider} />

        <TextInput
          value={value}
          onChangeText={(text) => {
            // strip non-digits
            onChangeText(text.replace(/\D/g, ''))
          }}
          keyboardType="phone-pad"
          placeholder={placeholder}
          placeholderTextColor={colors.neutral[400]}
          maxLength={9}
          accessibilityLabelledBy={label && !accessibilityLabel ? inputId : undefined}
          accessibilityLabel={accessibilityLabel}
          aria-invalid={!!error}
          style={styles.input}
        />
      </View>

      {error ? (
        <Text 
          style={styles.error}
          accessibilityLiveRegion="polite"
        >
          {error}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  label: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.neutral[400],
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.neutral[50],
    borderWidth: 1.5,
    borderRadius: radius.input,
    paddingHorizontal: 12,
    gap: 8,
  },
  flag: {
    fontSize: 18,
    lineHeight: 20,
  },
  countryCode: {
    fontSize: 13,
    color: colors.neutral[400],
    fontWeight: '500',
    paddingVertical: 10,
  },
  divider: {
    width: 1,
    height: 20,
    backgroundColor: colors.neutral[100],
  },
  input: {
    flex: 1,
    fontSize: 13,
    color: colors.neutral[800],
    paddingVertical: 10,
  },
  error: {
    fontSize: 11,
    color: colors.danger[400],
    marginTop: 4,
  },
})
