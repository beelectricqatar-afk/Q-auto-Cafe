import React from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/geist/wght.css'
import '@fontsource/montserrat/latin-400.css'
import '@fontsource/montserrat/latin-500.css'
import '@fontsource/montserrat/latin-600.css'
import '@fontsource/montserrat/latin-700.css'
import './styles/ui.css'
import App from './app/App'

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)
