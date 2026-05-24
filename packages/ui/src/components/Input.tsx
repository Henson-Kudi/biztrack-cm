'use client'
import React from 'react'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className = '', ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-foreground mb-1">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`block w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground
            focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring
            ${error ? 'border-destructive text-destructive' : 'border-input'}
            disabled:bg-muted disabled:cursor-not-allowed disabled:opacity-60
            ${className}`}
          {...props}
        />
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
        {hint && !error && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </div>
    )
  }
)

Input.displayName = 'Input'
