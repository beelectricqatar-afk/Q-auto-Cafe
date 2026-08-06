// Supabase connection. The URL and the *publishable* (anon) key are public by
// design — they ship in the client bundle. Access is controlled by the
// database's row-level policies (currently open, per project decision). The
// SECRET key is never used here. Defaults below let the Vercel build work with
// no env setup; override via VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.
const env = import.meta.env as Record<string, string | undefined>

export const SUPABASE_URL = env.VITE_SUPABASE_URL ?? 'https://ozcsovhflavkkrmeplsp.supabase.co'
export const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96Y3NvdmhmbGF2a2tybWVwbHNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwMDgxOTYsImV4cCI6MjEwMTU4NDE5Nn0.vkjJ72Nq1tSDEXf92gPeSpllJ6YkYrwg6n1WNPMo-sc'

export function isConfigured(): boolean {
  return !!SUPABASE_URL && !!SUPABASE_ANON_KEY
}
