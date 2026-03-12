import { SignUp } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';

export default function SignUpPage() {
  const navigate = useNavigate();

  return (
    <div style={{
      minHeight: '100vh',
      width: '100vw',
      background: 'linear-gradient(135deg, #0a0a0a 0%, #111 50%, #0a0a0a 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'system-ui, sans-serif',
      position: 'relative',
    }}>
      {/* Back arrow */}
      <button
        onClick={() => navigate('/')}
        style={{
          position: 'absolute',
          top: 24,
          left: 32,
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 50,
          color: 'rgba(255,255,255,0.7)',
          padding: '8px 18px',
          fontSize: 13,
          fontWeight: 500,
          cursor: 'pointer',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          transition: 'background 0.2s, color 0.2s',
        }}
        onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; e.currentTarget.style.color = 'white'; }}
        onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}
      >
        ← Back
      </button>

      {/* Logo wordmark */}
      <div style={{ marginBottom: 32, textAlign: 'center' }}>
        <h1 style={{
          color: 'white',
          fontSize: 28,
          fontWeight: 800,
          letterSpacing: '-0.04em',
          margin: 0,
        }}>
          Outrench
        </h1>
        <p style={{
          color: 'rgba(255,255,255,0.4)',
          fontSize: 13,
          marginTop: 6,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          fontFamily: '"PPSupplyMono", monospace',
        }}>
          AI-powered outreach engine
        </p>
      </div>

      {/* Clerk SignUp widget */}
      <SignUp
        routing="path"
        path="/sign-up"
        afterSignUpUrl="/"
        appearance={{
          variables: {
            colorPrimary: '#6366f1',
            colorBackground: '#18181b',
            colorText: '#f4f4f5',
            colorInputBackground: '#09090b',
            colorInputText: '#f4f4f5',
            borderRadius: '12px',
          },
          elements: {
            card: {
              border: '1px solid rgba(255,255,255,0.1)',
              boxShadow: '0 0 60px rgba(99,102,241,0.15)',
            },
            headerTitle: { color: '#f4f4f5' },
            headerSubtitle: { color: 'rgba(244,244,245,0.5)' },
            formButtonPrimary: {
              background: '#6366f1',
              fontWeight: 700,
            },
          },
        }}
      />
    </div>
  );
}
