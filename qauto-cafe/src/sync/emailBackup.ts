// Best-effort: ask our serverless function to email a freshly-saved backup.
// Never throws — email delivery must not affect the backup itself (and the
// endpoint doesn't exist in local dev).
export async function emailBackup(backup: unknown): Promise<void> {
  try {
    await fetch('/api/email-backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(backup),
    })
  } catch { /* offline / dev / transient — ignore */ }
}
