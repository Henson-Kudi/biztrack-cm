'use client'
import * as React from 'react'
import { cn } from '../lib/utils'

type AvatarImageLoadingStatus = 'idle' | 'loading' | 'loaded' | 'error'

type AvatarContextValue = {
  imageLoadingStatus: AvatarImageLoadingStatus
  setImageLoadingStatus: React.Dispatch<React.SetStateAction<AvatarImageLoadingStatus>>
}

const AvatarContext = React.createContext<AvatarContextValue | null>(null)

function useAvatarContext(componentName: string) {
  const context = React.useContext(AvatarContext)

  if (!context) {
    throw new Error(`${componentName} must be used within Avatar`)
  }

  return context
}

const Avatar = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    const [imageLoadingStatus, setImageLoadingStatus] =
      React.useState<AvatarImageLoadingStatus>('idle')

    return (
      <AvatarContext.Provider value={{ imageLoadingStatus, setImageLoadingStatus }}>
        <div
          ref={ref}
          className={cn('relative flex shrink-0 overflow-hidden rounded-full', className)}
          {...props}
        />
      </AvatarContext.Provider>
    )
  },
)
Avatar.displayName = 'Avatar'

const AvatarImage = React.forwardRef<
  HTMLImageElement,
  React.ImgHTMLAttributes<HTMLImageElement>
>(({ className, onLoad, onError, src, alt = '', ...props }, ref) => {
  const { imageLoadingStatus, setImageLoadingStatus } = useAvatarContext('AvatarImage')

  React.useEffect(() => {
    // Reset the image state whenever the source changes so the fallback can
    // take over immediately for empty or newly broken URLs.
    if (!src) {
      setImageLoadingStatus('error')
      return
    }

    setImageLoadingStatus('loading')
  }, [src, setImageLoadingStatus])

  if (!src) {
    return null
  }

  return (
    <img
      ref={ref}
      src={src}
      alt={alt}
      className={cn(
        'h-full w-full object-cover',
        imageLoadingStatus !== 'loaded' && 'opacity-0',
        className,
      )}
      onLoad={(event) => {
        setImageLoadingStatus('loaded')
        onLoad?.(event)
      }}
      onError={(event) => {
        // We intentionally swap to the fallback instead of leaving the browser's
        // native broken-image placeholder, which tends to overflow tight product
        // tiles and makes dense commerce screens feel visually broken.
        setImageLoadingStatus('error')
        onError?.(event)
      }}
      {...props}
    />
  )
})
AvatarImage.displayName = 'AvatarImage'

const AvatarFallback = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement>
>(({ className, ...props }, ref) => {
  const { imageLoadingStatus } = useAvatarContext('AvatarFallback')

  if (imageLoadingStatus === 'loaded') {
    return null
  }

  return (
    <span
      ref={ref}
      className={cn(
        'flex h-full w-full items-center justify-center rounded-full bg-muted',
        className,
      )}
      {...props}
    />
  )
})
AvatarFallback.displayName = 'AvatarFallback'

export { Avatar, AvatarFallback, AvatarImage }
