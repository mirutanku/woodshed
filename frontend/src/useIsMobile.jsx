import { useState, useEffect } from 'react'

const MOBILE_BREAKPOINT = 1024

export default function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined'
      ? window.innerWidth < MOBILE_BREAKPOINT || ('ontouchstart' in window && window.innerWidth <= 1366)
      : false
  )

  useEffect(() => {
    function handleResize() {
      setIsMobile(
        window.innerWidth < MOBILE_BREAKPOINT || ('ontouchstart' in window && window.innerWidth <= 1366)
      )
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return isMobile
}