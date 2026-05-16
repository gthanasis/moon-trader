'use client'

import { SettingsForm } from './settings-form'
import { useSettings } from '@/lib/queries'

export default function SettingsPage() {
  const { data: settings, isLoading, isError } = useSettings()

  if (isLoading) {
    return <p style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--muted)' }}>Loading…</p>
  }
  if (isError || !settings) {
    return <p style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--neg)' }}>Failed to load settings.</p>
  }
  return <SettingsForm initial={settings} />
}
