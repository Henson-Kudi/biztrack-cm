import * as React from 'react'
import { OTPInput, OTPInputContext } from 'input-otp'
import { cn } from '../lib/utils'

type OTPPrimitiveProps = {
  value?: string
  onChange?: (value: string) => void
  maxLength: number
  className?: string
  children?: React.ReactNode
}

const OTPInputPrimitive = OTPInput as unknown as React.ComponentType<any>
const OTPInputContextPrimitive = OTPInputContext as unknown as React.Context<any>

const InputOTP = React.forwardRef<HTMLInputElement, OTPPrimitiveProps>(
  ({ className, ...props }, ref) => (
  <OTPInputPrimitive
    ref={ref}
    className={cn('flex w-full items-center gap-2', className)}
    {...props}
  />
))
InputOTP.displayName = 'InputOTP'

const InputOTPGroup = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex w-full items-center gap-2', className)}
    {...props}
  />
))
InputOTPGroup.displayName = 'InputOTPGroup'

const InputOTPSlot = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { index: number }
>(({ className, index, ...props }, ref) => {
  const context = React.useContext(OTPInputContextPrimitive)
  const slot = context?.slots?.[index]
  return (
    <div
      ref={ref}
      className={cn(
        'flex h-14 flex-1 items-center justify-center rounded-md border border-input bg-background text-lg font-semibold text-foreground shadow-sm transition-colors',
        slot?.isActive && 'ring-2 ring-ring',
        className,
      )}
      {...props}
    >
      {slot?.char ?? ''}
    </div>
  )
})
InputOTPSlot.displayName = 'InputOTPSlot'

const InputOTPSeparator = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement>
>(({ className, ...props }, ref) => (
  <span ref={ref} className={cn('text-muted-foreground', className)} {...props}>
    -
  </span>
))
InputOTPSeparator.displayName = 'InputOTPSeparator'

export { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator }
