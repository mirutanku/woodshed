import { useRef, useEffect } from 'react'

export default function useVisibilityTimer(onElapsed: ((seconds: number) => void) | null, isPlayingRef?: React.RefObject<boolean>) {
  const startTimeRef = useRef<number | null>(null)
  const accumulatedRef = useRef(0)
  const onElapsedRef = useRef(onElapsed)
  onElapsedRef.current = onElapsed

  function start() {
    if (!startTimeRef.current) {
      startTimeRef.current = Date.now()
    }
  }

  function pause() {
    if (startTimeRef.current) {
      accumulatedRef.current += Math.round((Date.now() - startTimeRef.current) / 1000)
      startTimeRef.current = null
    }
  }

  function flush() {
    pause()
    const seconds = accumulatedRef.current
    accumulatedRef.current = 0
    if (seconds > 0 && onElapsedRef.current) {
      onElapsedRef.current(seconds)
    }
    return seconds
  }

  const flushRef = useRef(flush)
  flushRef.current = flush

  useEffect(() => {
    function handleVisibility() {
      const shouldRun = document.visibilityState === 'visible' || (isPlayingRef && isPlayingRef.current)
      if (shouldRun) {
        start()
      } else {
        pause()
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)

    if (document.visibilityState === 'visible') {
      start()
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      flushRef.current()
    }
  }, [])

  // Periodic save every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (startTimeRef.current) {
        const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000)
        accumulatedRef.current += elapsed
        startTimeRef.current = Date.now()

        const seconds = accumulatedRef.current
        accumulatedRef.current = 0
        if (seconds > 0 && onElapsedRef.current) {
          onElapsedRef.current(seconds)
        }
      }
    }, 60000)

    return () => clearInterval(interval)
  }, [])

  return { flush }
}