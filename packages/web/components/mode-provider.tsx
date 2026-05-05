'use client'

import { useEffect } from 'react'

export function ModeProvider() {
  useEffect(() => {
    const stored = localStorage.getItem('traderMode')
    if (stored === 'noob') {
      document.body.classList.add('noob')
    }
  }, [])

  return null
}
