import React, { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, Text, TouchableOpacity } from 'react-native'

interface OtpResendTimerProps {
  /** Initial countdown in seconds. Defaults to 90 */
  initialSeconds?: number
  onResend: () => void | Promise<void>
  resendLabel?: string
  timerLabel?: (secondsLeft: number) => string
  disabled?: boolean
}

/**
 * Countdown timer with a resend button.
 *
 * Uses an absolute deadline (Date.now() + duration) instead of an interval
 * counter so the timer stays accurate when the user leaves the app to read
 * their SMS and comes back. AppState change events trigger an immediate
 * re-sync on foreground resume.
 */
export const OtpResendTimer: React.FC<OtpResendTimerProps> = ({
  initialSeconds = 90,
  onResend,
  resendLabel = 'Resend OTP',
  timerLabel,
  disabled = false,
}) => {
  const mountedRef = useRef(true)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const deadlineRef = useRef<number>(Date.now() + initialSeconds * 1000)

  const [secondsLeft, setSecondsLeft] = useState(initialSeconds)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  /** Recalculate remaining seconds from the stored absolute deadline */
  const syncFromDeadline = useCallback(() => {
    if (!mountedRef.current) return
    const remaining = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000))
    setSecondsLeft(remaining)
    if (remaining <= 0) clearTimer()
  }, [clearTimer])

  const startTimer = useCallback((seconds: number) => {
    clearTimer()
    deadlineRef.current = Date.now() + seconds * 1000
    setSecondsLeft(seconds)
    intervalRef.current = setInterval(syncFromDeadline, 500) // 500ms for snappy UI
  }, [clearTimer, syncFromDeadline])

  // Start on mount, stop on unmount
  useEffect(() => {
    startTimer(initialSeconds)
    return clearTimer
  }, [initialSeconds, startTimer, clearTimer])

  // Re-sync immediately when app comes back to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        syncFromDeadline()
        // Restart polling if there's still time left
        if (Date.now() < deadlineRef.current && !intervalRef.current) {
          intervalRef.current = setInterval(syncFromDeadline, 500)
        }
      } else {
        // Stop polling while backgrounded — no point ticking when frozen
        clearTimer()
      }
    })
    return () => sub.remove()
  }, [clearTimer, syncFromDeadline])

  const handleResend = async () => {
    if (loading || secondsLeft > 0 || disabled) return
    if (!mountedRef.current) return

    setLoading(true)
    try {
      await onResend()
      if (mountedRef.current) startTimer(initialSeconds)
    } catch {
      // Parent screen handles error display
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }

  const minutes = Math.floor(secondsLeft / 60)
  const secs = secondsLeft % 60
  const formatted = `${minutes}:${secs.toString().padStart(2, '0')}`

  if (secondsLeft > 0) {
    return (
      <Text style={{ fontSize: 12, color: '#888780', textAlign: 'center' }}>
        {timerLabel ? timerLabel(secondsLeft) : `Resend in ${formatted}`}
      </Text>
    )
  }

  return (
    <TouchableOpacity
      onPress={handleResend}
      disabled={loading || disabled}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={resendLabel}
      accessibilityState={{ disabled: loading || disabled }}
    >
      <Text
        style={{
          fontSize: 13,
          color: loading ? '#888780' : '#185FA5',
          fontWeight: '500',
          textAlign: 'center',
          textDecorationLine: 'underline',
        }}
      >
        {loading ? 'Sending…' : resendLabel}
      </Text>
    </TouchableOpacity>
  )
}
