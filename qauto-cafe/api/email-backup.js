// Vercel serverless function: email a cloud backup to admin@q-auto.com via
// Resend. The app POSTs the backup object here right after it saves a backup.
// Runs server-side so the Resend key never ships in the browser bundle and so
// we avoid Resend's no-CORS-from-browser restriction.
//
// Config (Vercel → Settings → Environment Variables; values below are fallbacks):
//   RESEND_API_KEY  – Resend API key
//   BACKUP_FROM     – sender (needs a verified domain to use @q-auto.com)
//   BACKUP_TO       – recipient

const RESEND_API_KEY = process.env.RESEND_API_KEY 
const FROM = process.env.BACKUP_FROM || 'Q-Auto Cafe <backups@q-auto.com>'
const TO = process.env.BACKUP_TO || 'admin@q-auto.com'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })
  const payload = req.body || {}
  const kind = payload.kind || 'backup'
  const date = new Date(payload.exportedAt || Date.now()).toISOString().slice(0, 10)
  const json = JSON.stringify({ version: payload.version, exportedAt: payload.exportedAt, data: payload.data })
  const content = Buffer.from(json).toString('base64')

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM,
      to: [TO],
      subject: `Q-Auto Cafe backup (${kind}) — ${date}`,
      html: `<p>Automated <strong>${kind}</strong> backup from the Q-Auto Cafe POS.</p>
             <p>The full backup is attached as JSON — restore it via Admin → Backup → "Restore from file".</p>`,
      attachments: [{ filename: `qauto-cafe-backup-${kind}-${date}.json`, content }],
    }),
  })
  const text = await r.text()
  if (!r.ok) return res.status(502).json({ error: text })
  return res.status(200).json({ ok: true, id: JSON.parse(text || '{}').id })
}
