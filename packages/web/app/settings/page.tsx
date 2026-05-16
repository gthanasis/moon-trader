import { getBotSettings } from './actions'
import { SettingsForm } from './settings-form'

// Settings must always reflect the current DB row, never a cached snapshot.
export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const settings = await getBotSettings()
  return <SettingsForm initial={settings} />
}
