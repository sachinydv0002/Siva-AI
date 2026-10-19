import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/react'
import './index.css'
import App from './App.jsx'

const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {clerkKey ? (
      <ClerkProvider
        publishableKey={clerkKey}
        signInUrl="/sign-in"
        signUpUrl="/sign-up"
        signInFallbackRedirectUrl="/"
        signUpFallbackRedirectUrl="/"
      >
        <App />
      </ClerkProvider>
    ) : (
      <div style={{ padding: 24, fontFamily: 'sans-serif' }}>
        <h1>Clerk setup required</h1>
        <p>Add VITE_CLERK_PUBLISHABLE_KEY to frontend/.env, then restart the Vite server.</p>
      </div>
    )}
  </StrictMode>,
)
