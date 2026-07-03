import { useCallback, useLayoutEffect, useState } from 'react'

const STORAGE_KEY = 'prenatal_livia_desktop_aside_open'

function readInitialOpen(): boolean {
  if (typeof window === 'undefined') return true
  try {
    return sessionStorage.getItem(STORAGE_KEY) !== '0'
  } catch {
    return true
  }
}

/**
 * Desktop Livia panel: toggles `--livia-aside-width` (0px when collapsed).
 * Persists choice in sessionStorage (same idea as the collapsible nav).
 */
export function useLiviaDesktopAsideOpen() {
  const [open, setOpen] = useState(readInitialOpen)

  useLayoutEffect(() => {
    const root = document.documentElement
    if (open) {
      root.style.removeProperty('--livia-aside-width')
    } else {
      root.style.setProperty('--livia-aside-width', '0px')
    }
    return () => {
      root.style.removeProperty('--livia-aside-width')
    }
  }, [open])

  const setOpenPersist = useCallback((next: boolean) => {
    setOpen(next)
    try {
      sessionStorage.setItem(STORAGE_KEY, next ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [])

  return [open, setOpenPersist] as const
}
