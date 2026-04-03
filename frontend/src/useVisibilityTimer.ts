import { useRef, useEffect, useCallback } from 'react'

export default function useVisibilityTimer(onElapsed: ((seconds: number) => void) | null, isPlayingRef?: React.RefObject<boolean>) {
  const startTimeRef = useRef<number | null>(null)
  const accumulatedRef = useRef(0)

  const start = useCallback(() => {
    if (!startTimeRef.current) {
      startTimeRef.current = Date.now()
    }
  }, [])

  const pause = useCallback(() => {
    if (startTimeRef.current) {
      accumulatedRef.current += Math.round((Date.now() - startTimeRef.current) / 1000)
      startTimeRef.current = null
    }
  }, [])

  const flush = useCallback(() => {
    pause()
    const seconds = accumulatedRef.current
    accumulatedRef.current = 0
    if (seconds > 0 && onElapsed) {
      onElapsed(seconds)
    }
    return seconds
  }, [pause, onElapsed])

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
      flush()
    }
  }, [start, pause, flush])

  return { flush }
}