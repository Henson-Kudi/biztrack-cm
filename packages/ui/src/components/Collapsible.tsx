'use client'

import * as React from 'react'
import { cn } from '../lib/utils'

type CollapsibleContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
  contentId: string
}

const CollapsibleContext = React.createContext<CollapsibleContextValue | null>(null)

function useCollapsibleContext(componentName: string) {
  const context = React.useContext(CollapsibleContext)

  if (!context) {
    throw new Error(`${componentName} must be used within Collapsible`)
  }

  return context
}

type CollapsibleProps = React.HTMLAttributes<HTMLDivElement> & {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
}

const Collapsible = React.forwardRef<HTMLDivElement, CollapsibleProps>(
  ({ open: openProp, defaultOpen = false, onOpenChange, className, children, ...props }, ref) => {
    const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen)
    const contentId = React.useId()
    const open = openProp ?? uncontrolledOpen

    const setOpen = React.useCallback(
      (nextOpen: boolean) => {
        if (openProp === undefined) {
          setUncontrolledOpen(nextOpen)
        }

        onOpenChange?.(nextOpen)
      },
      [onOpenChange, openProp],
    )

    return (
      <CollapsibleContext.Provider value={{ open, setOpen, contentId }}>
        <div
          ref={ref}
          data-state={open ? 'open' : 'closed'}
          className={cn(className)}
          {...props}
        >
          {children}
        </div>
      </CollapsibleContext.Provider>
    )
  },
)
Collapsible.displayName = 'Collapsible'

const CollapsibleTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, onClick, type = 'button', ...props }, ref) => {
  const { open, setOpen, contentId } = useCollapsibleContext('CollapsibleTrigger')

  return (
    <button
      ref={ref}
      type={type}
      aria-controls={contentId}
      aria-expanded={open}
      data-state={open ? 'open' : 'closed'}
      className={cn(className)}
      onClick={(event) => {
        onClick?.(event)
        if (!event.defaultPrevented) {
          setOpen(!open)
        }
      }}
      {...props}
    />
  )
})
CollapsibleTrigger.displayName = 'CollapsibleTrigger'

const CollapsibleContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, style, ...props }, ref) => {
    const { open, contentId } = useCollapsibleContext('CollapsibleContent')
    const innerRef = React.useRef<HTMLDivElement | null>(null)
    const [height, setHeight] = React.useState(0)

    const updateHeight = React.useCallback(() => {
      if (!innerRef.current) {
        return
      }

      setHeight(innerRef.current.scrollHeight)
    }, [])

    React.useLayoutEffect(() => {
      updateHeight()
    }, [children, open, updateHeight])

    React.useEffect(() => {
      updateHeight()

      if (!innerRef.current || typeof ResizeObserver === 'undefined') {
        return
      }

      const observer = new ResizeObserver(() => {
        updateHeight()
      })

      observer.observe(innerRef.current)
      return () => observer.disconnect()
    }, [children, updateHeight])

    React.useEffect(() => {
      if (open) {
        updateHeight()
      }
    }, [open, updateHeight])

    return (
      <div
        ref={ref}
        id={contentId}
        aria-hidden={!open}
        data-state={open ? 'open' : 'closed'}
        className={cn(
          'overflow-hidden transition-[height,opacity] duration-300 ease-in-out',
          !open && 'pointer-events-none',
          className,
        )}
        style={{
          height: open ? height : 0,
          opacity: open ? 1 : 0,
          ...style,
        }}
        {...props}
      >
        <div
          ref={innerRef}
          className={cn(
            'transition-transform duration-300 ease-in-out',
            open ? 'translate-y-0' : '-translate-y-1',
          )}
        >
          {children}
        </div>
      </div>
    )
  },
)
CollapsibleContent.displayName = 'CollapsibleContent'

export { Collapsible, CollapsibleContent, CollapsibleTrigger }
