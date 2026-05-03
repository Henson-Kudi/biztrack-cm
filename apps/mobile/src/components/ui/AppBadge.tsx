import React from 'react'
import { StyleSheet, Text, View } from 'react-native'

import theme from '../../../theme'
const { colors, radius } = theme

export type BadgeVariant =
  | 'owner'
  | 'manager'
  | 'cashier'
  | 'accountant'
  | 'pending'
  | 'active'
  | 'suspended'
  | 'trial'

interface AppBadgeProps {
  variant: BadgeVariant
  label?: string
  className?: string
}

const BADGE_STYLES: Record<BadgeVariant, { bg: string; text: string; defaultLabel: string }> = {
  owner:       { bg: colors.success[50], text: colors.success[800], defaultLabel: 'Owner' },
  manager:     { bg: colors.brand[50],   text: colors.brand[800],   defaultLabel: 'Manager' },
  cashier:     { bg: colors.warning[50], text: colors.warning[800], defaultLabel: 'Cashier' },
  accountant:  { bg: colors.brand[50],   text: colors.brand[600],   defaultLabel: 'Accountant' },
  pending:     { bg: colors.neutral[50], text: colors.neutral[400], defaultLabel: 'Pending' },
  active:      { bg: colors.success[50], text: colors.success[800], defaultLabel: 'Active' },
  suspended:   { bg: colors.danger[50],  text: colors.danger[800],  defaultLabel: 'Suspended' },
  trial:       { bg: colors.warning[50], text: colors.warning[800], defaultLabel: 'Trial' },
}

export const AppBadge: React.FC<AppBadgeProps> = ({ variant, label, className }) => {
  const style = BADGE_STYLES[variant]
  return (
    <View
      className={className}
      accessibilityRole="text"
      accessibilityLabel={`Badge: ${label ?? style.defaultLabel}`}
      style={[
        styles.container,
        { backgroundColor: style.bg }
      ]}
    >
      <Text style={[styles.text, { color: style.text }]}>
        {label ?? style.defaultLabel}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.icon, // default 8 or 6 based on theme
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 10,
    fontWeight: '500',
  },
})
