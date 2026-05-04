import React from 'react'
import { Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

interface AuthHeaderProps {
  title?: string
  subtitle?: string
  /** Show the 4-square BizTrack logo */
  showLogo?: boolean
}

/**
 * Reusable blue-900 hero section used on all auth screens.
 * Renders the logo, title, and subtitle on a brand-dark background.
 */
export const AuthHeader: React.FC<AuthHeaderProps> = ({
  title = 'BizTrack CM',
  subtitle,
  showLogo = true,
}) => {
  const insets = useSafeAreaInsets()

  return (
    <View
      style={{
        backgroundColor: '#042C53',
        paddingTop: insets.top + 16,
        paddingBottom: 16,
        paddingHorizontal: 20,
        alignItems: 'center',
        gap: 8,
      }}
    >
      {showLogo ? <BizTrackLogo /> : null}
      {title ? (
        <Text
          style={{ fontSize: 24, fontWeight: '600', color: '#FFFFFF' }}
        >
          {title}
        </Text>
      ) : null}
      {subtitle ? (
        <Text
          style={{
            fontSize: 14,
            color: '#85B7EB',
            textAlign: 'center',
            lineHeight: 20,
          }}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  )
}

/** The 4-square BizTrack logo mark */
const BizTrackLogo: React.FC = () => (
  <View
    style={{
      width: 48,
      height: 48,
      backgroundColor: '#185FA5',
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    {/* 2×2 grid of squares */}
    <View style={{ flexDirection: 'row', gap: 3 }}>
      <View style={{ flexDirection: 'column', gap: 3 }}>
        <View style={{ width: 10, height: 10, backgroundColor: '#B5D4F4', borderRadius: 2 }} />
        <View style={{ width: 10, height: 10, backgroundColor: '#378ADD', borderRadius: 2 }} />
      </View>
      <View style={{ flexDirection: 'column', gap: 3 }}>
        <View style={{ width: 10, height: 10, backgroundColor: '#378ADD', borderRadius: 2 }} />
        <View style={{ width: 10, height: 10, backgroundColor: '#B5D4F4', borderRadius: 2 }} />
      </View>
    </View>
  </View>
)
