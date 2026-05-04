import React from 'react'
import { StyleSheet, ScrollView, View } from 'react-native'

import theme from '../../../theme'
const { colors, radius } = theme

interface AuthCardProps {
  children: React.ReactNode
  /** Make content scrollable (for longer forms like register) */
  scrollable?: boolean
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: '#FFFFFF', // standard card background
    borderTopLeftRadius: radius.hero,
    borderTopRightRadius: radius.hero,
  },
  content: {
    paddingTop: 24,
    paddingHorizontal: 22,
    gap: 18,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  staticContent: {
    paddingBottom: 24,
    flex: 1,
  }
})

/**
 * White rounded-top card that sits below the AuthHeader.
 * Provides consistent padding and the characteristic rounded-top shape
 * from the BizTrack design spec (border-radius 22px top).
 */
export const AuthCard: React.FC<AuthCardProps> = ({
  children,
  scrollable = false,
}) => {
  if (scrollable) {
    return (
      <ScrollView
        style={styles.card}
        contentContainerStyle={[styles.content, styles.scrollContent]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    )
  }

  return (
    <View style={styles.card}>
      <View style={[styles.content, styles.staticContent]}>{children}</View>
    </View>
  )
}
