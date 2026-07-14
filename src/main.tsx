import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

// Admin SEO suite is gated behind /admin-tools/* login — keep it (and
// react-router, which only the admin needs) out of the landing-page critical
// path by loading the whole router+admin tree on demand. The landing itself
// is a single page, so no client router is required for it.
const AdminRoot = lazy(() => import('./admin/AdminRoot'))

const isAdmin = window.location.pathname.startsWith('/admin-tools')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isAdmin ? (
      <Suspense fallback={null}>
        <AdminRoot />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
)
