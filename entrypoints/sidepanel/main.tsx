import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import '@/assets/style.css'
import sonnerStyles from 'sonner/dist/styles.css?inline'

// Inject sonner styles into the side panel shadow DOM / head
const style = document.createElement('style')
style.textContent = sonnerStyles
document.head.appendChild(style)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
