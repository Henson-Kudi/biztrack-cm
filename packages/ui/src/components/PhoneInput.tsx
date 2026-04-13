//@ts-ignore
import 'react-phone-number-input/style.css'
import * as React from 'react'
import PhoneInputBase, { type Country } from 'react-phone-number-input'
import { cn } from '../lib/utils'

const PhoneNumberInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none',
        className,
      )}
      {...props}
    />
  ),
)
PhoneNumberInput.displayName = 'PhoneNumberInput'

export interface PhoneInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value?: string
  onChange?: (value?: string) => void
}

const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ className, value, onChange, ...props }, ref) => {
    return (
      <div
        className={cn(
          'flex w-full items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-within:ring-2 focus-within:ring-ring',
          className,
        )}
      >
        <PhoneInputBase
          {...props}
          ref={ref as any}
          international
          defaultCountry={'CM' as Country}
          country={'CM' as Country}
          withCountryCallingCode
          value={value}
          onChange={onChange!}
          inputComponent={PhoneNumberInput}
          countrySelectProps={{ disabled: true, className: 'text-sm text-muted-foreground bg-transparent' }}
          className="w-full flex items-center gap-2"
        />
      </div>
    )
  },
)

PhoneInput.displayName = 'PhoneInput'

export { PhoneInput }
