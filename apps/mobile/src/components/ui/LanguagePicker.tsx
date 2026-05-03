import React from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'

import theme from '../../../theme'
const { colors, radius } = theme

export type Locale = 'fr' | 'en'

interface LanguagePickerProps {
  value: Locale
  onChange: (locale: Locale) => void
  className?: string
}

const OPTIONS: { locale: Locale; label: string }[] = [
  { locale: 'fr', label: 'Français' },
  { locale: 'en', label: 'English' },
]

export const LanguagePicker: React.FC<LanguagePickerProps> = ({
  value,
  onChange,
  className,
}) => {
  return (
    <View className={className} style={styles.container}>
      {OPTIONS.map(({ locale, label }) => {
        const isActive = value === locale
        return (
          <TouchableOpacity
            key={locale}
            onPress={() => onChange(locale)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={label}
            style={[
              styles.option,
              {
                backgroundColor: isActive ? colors.brand[600] : colors.brand[50],
                borderColor: isActive ? colors.brand[600] : colors.brand[100],
              }
            ]}
          >
            <Text
              style={[
                styles.text,
                { color: isActive ? '#FFFFFF' : colors.brand[600] }
              ]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row', 
    gap: 8,
  },
  option: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.icon,
    alignItems: 'center',
    borderWidth: 1,
  },
  text: {
    fontSize: 12,
    fontWeight: '500',
  }
})
