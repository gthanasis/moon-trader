'use client'

import { useState } from 'react'
import { ApprovalBanner } from './approval-banner'
import type { StoredDecision } from '@trader/db'

export function ApprovalBannerWrapper({ decision }: { decision: StoredDecision }) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null
  return <ApprovalBanner decision={decision} onDismiss={() => setDismissed(true)} />
}
