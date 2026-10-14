import { defineConfig } from 'vite'

// The customer ordering site (qautocafe.vercel.app). A build of its own, from
// online/, so it can never ship the POS or admin screens.
export default defineConfig({
  root: 'online',
  build: { outDir: '../dist-online', emptyOutDir: true, target: 'es2018' },
})
