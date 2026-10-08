import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Standard multi-asset build for hosting on Vercel. (The previous single-file
// build existed so index.html could run offline from the filesystem; the
// Supabase sync layer replaces that need.)
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { target: 'es2018' },
})
