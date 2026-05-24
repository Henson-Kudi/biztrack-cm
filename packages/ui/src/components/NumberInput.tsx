'use client'
import React from 'react'

import { cn } from '../lib/utils'
import { Input, type InputProps } from './Input'

export interface NumberInputProps extends Omit<InputProps, 'type'> {}

export const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  ({ className, inputMode = 'decimal', ...props }, ref) => {
    return (
      <Input
        ref={ref}
        type="number"
        inputMode={inputMode}
        className={cn(
          '[appearance:textfield] [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
          className,
        )}
        {...props}
      />
    )
  },
)

NumberInput.displayName = 'NumberInput'
