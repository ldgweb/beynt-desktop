import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary/ErrorBoundary'

// No StrictMode: its double effects would subscribe twice to events and run start-up refreshes twice.
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)
