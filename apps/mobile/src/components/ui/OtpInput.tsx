import React, { useEffect, useRef, useState } from 'react'
import { Text, TextInput, View } from 'react-native'

const OTP_LENGTH = 6

export interface OtpInputProps {
  onComplete: (code: string) => void
  error?: string
  disabled?: boolean
  autoFocus?: boolean
}

export const OtpInput: React.FC<OtpInputProps> = ({
  onComplete,
  error,
  disabled = false,
  autoFocus = true,
}) => {
  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''))
  const inputRefs = useRef<(TextInput | null)[]>(Array(OTP_LENGTH).fill(null))

  // Auto-focus first box on mount — store timeout id for cleanup
  useEffect(() => {
    if (!autoFocus) return
    const id = setTimeout(() => inputRefs.current[0]?.focus(), 100)
    return () => clearTimeout(id)
  }, [autoFocus])

  const handleChange = (text: string, index: number) => {
    const digits = text.replace(/\D/g, '')

    if (digits.length > 1) {
      // Pasted content — distribute across boxes
      const next = Array(OTP_LENGTH).fill('') as string[]
      for (let i = 0; i < OTP_LENGTH; i++) {
        next[i] = digits[i] ?? ''
      }
      setOtp(next)
      if (digits.length >= OTP_LENGTH) {
        inputRefs.current[OTP_LENGTH - 1]?.blur()
        onComplete(digits.slice(0, OTP_LENGTH))
      } else {
        inputRefs.current[Math.min(digits.length, OTP_LENGTH - 1)]?.focus()
      }
      return
    }

    // Single digit
    const digit = digits.slice(-1)
    const next = [...otp]
    next[index] = digit
    setOtp(next)

    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus()
    }

    if (next.every(Boolean)) {
      inputRefs.current[OTP_LENGTH - 1]?.blur()
      onComplete(next.join(''))
    }
  }

  const handleKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !otp[index] && index > 0) {
      const next = [...otp]
      next[index - 1] = ''
      setOtp(next)
      inputRefs.current[index - 1]?.focus()
    }
  }

  return (
    <View>
      <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'center' }}>
        {otp.map((digit, i) => {
          const isFilled = Boolean(digit)
          const borderColor = error
            ? '#E24B4A'
            : isFilled
            ? '#185FA5'
            : '#D3D1C7'

          return (
            <TextInput
              key={i}
              ref={(ref) => {
                inputRefs.current[i] = ref
              }}
              value={digit}
              onChangeText={(text) => handleChange(text, i)}
              onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, i)}
              keyboardType="number-pad"
              maxLength={OTP_LENGTH} // allows paste detection
              editable={!disabled}
              selectTextOnFocus
              accessibilityLabel={`OTP digit ${i + 1} of ${OTP_LENGTH}`}
              accessibilityRole="text"
              accessibilityState={{ disabled }}
              style={{
                width: 44,
                height: 52,
                borderWidth: 1.5,
                borderColor,
                borderRadius: 10,
                backgroundColor: isFilled ? '#E6F1FB' : '#F1EFE8',
                textAlign: 'center',
                fontSize: 20,
                fontWeight: '600',
                color: '#042C53',
              }}
            />
          )
        })}
      </View>

      {error ? (
        <Text
          style={{
            fontSize: 12,
            color: '#E24B4A',
            textAlign: 'center',
            marginTop: 10,
          }}
          accessibilityRole="alert"
        >
          {error}
        </Text>
      ) : null}
    </View>
  )
}
