import { useState, lazy, Suspense } from 'react';
import { SignedIn, SignedOut, useSignIn, useSignUp } from '@clerk/clerk-react';
import { Loader2, Sparkles, X, Mail, Lock, Eye, EyeOff, User, Send } from 'lucide-react';
import outrenchLogo from './assets/outrench.png';
import Dashboard from './components/Dashboard';

// Lazy-load the heavy Three.js component so it doesn't block the dashboard
const SpectralGhost = lazy(() => import('./components/SpectralGhost'));

// ── Reusable styled input ────────────────────────────────────────────────────
function AuthInput({ icon: Icon, type = 'text', placeholder, value, onChange, right }) {
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div style={{
        position: 'absolute', left: 14, top: '50%',
        transform: 'translateY(-50%)',
        color: 'rgba(255,255,255,0.3)', pointerEvents: 'none',
        display: 'flex', alignItems: 'center',
      }}>
        <Icon size={16} />
      </div>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        style={{
          width: '100%',
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 12,
          padding: '13px 44px',
          color: '#fff',
          fontSize: 15,
          outline: 'none',
          transition: 'border-color 0.2s',
          boxSizing: 'border-box',
        }}
        onFocus={e => e.target.style.borderColor = 'rgba(99,102,241,0.7)'}
        onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
      />
      {right && (
        <div style={{
          position: 'absolute', right: 14, top: '50%',
          transform: 'translateY(-50%)',
        }}>
          {right}
        </div>
      )}
    </div>
  );
}

// ── Auth Bottom Sheet ─────────────────────────────────────────────────────────
function AuthSheet({ isOpen, onClose }) {
  const { signIn, setActive: setSignInActive } = useSignIn();
  const { signUp, setActive: setSignUpActive } = useSignUp();

  const [tab, setTab] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setEmail(''); setPassword(''); setUsername('');
    setCode(''); setVerifying(false);
    setError(''); setLoading(false); setShowPass(false);
  };

  const switchTab = (t) => { setTab(t); reset(); };

  // ── Sign In ────────────────────────────────────────────────────────────────
  const handleSignIn = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const result = await signIn.create({ identifier: email, password });
      if (result.status === 'complete') {
        await setSignInActive({ session: result.createdSessionId });
        onClose();
      }
    } catch (err) {
      setError(err.errors?.[0]?.message || 'Sign in failed. Please try again.');
    } finally { setLoading(false); }
  };

  // ── Sign Up ────────────────────────────────────────────────────────────────
  const handleSignUp = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await signUp.create({
        username,
        emailAddress: email,
        password,
      });
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setVerifying(true);
    } catch (err) {
      setError(err.errors?.[0]?.message || 'Sign up failed. Please try again.');
    } finally { setLoading(false); }
  };

  // ── Verify email code ──────────────────────────────────────────────────────
  const handleVerify = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const result = await signUp.attemptEmailAddressVerification({ code });
      if (result.status === 'complete') {
        await setSignUpActive({ session: result.createdSessionId });
        onClose();
      }
    } catch (err) {
      setError(err.errors?.[0]?.message || 'Invalid code. Please try again.');
    } finally { setLoading(false); }
  };

  const sheetStyle = {
    position: 'fixed',
    bottom: 0, left: 0, right: 0,
    zIndex: 999,
    background: 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.01))',
    backdropFilter: 'blur(30px) saturate(180%)',
    WebkitBackdropFilter: 'blur(30px) saturate(180%)',
    borderTop: '1px solid rgba(255,255,255,0.15)',
    boxShadow: '0 -15px 50px rgba(99, 102, 241, 0.2), inset 0 1px 0 rgba(255,255,255,0.3)',
    borderRadius: '32px 32px 0 0',
    padding: '12px 24px 48px',
    transform: isOpen ? 'translateY(0)' : 'translateY(100%)',
    transition: 'transform 0.45s cubic-bezier(0.32, 0.72, 0, 1)',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    maxHeight: '92vh', overflowY: 'auto',
  };

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(6px)',
        zIndex: 998,
        opacity: isOpen ? 1 : 0,
        pointerEvents: isOpen ? 'auto' : 'none',
        transition: 'opacity 0.35s ease',
      }} />

      <div style={sheetStyle}>
        {/* Holographic glow line */}
        <div style={{
          position: 'absolute', top: 0, left: '15%', right: '15%', height: 1.5,
          background: 'linear-gradient(90deg, transparent, rgba(99,102,241,0.8), rgba(236,40,165,0.8), rgba(16,185,129,0.8), transparent)',
          boxShadow: '0 2px 10px rgba(236,40,165,0.5)'
        }} />

        {/* Drag handle */}
        <div style={{ width: 40, height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.25)', margin: '14px 0 28px', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />

        {/* Close */}
        <button onClick={onClose} style={{
          position: 'absolute', top: 16, right: 20,
          background: 'rgba(255,255,255,0.08)', border: 'none',
          borderRadius: 50, width: 32, height: 32,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', color: 'white',
        }}><X size={16} /></button>

        <div style={{ width: '100%', maxWidth: 380 }}>

          {/* ── Tab switcher ── */}
          {!verifying && (
            <div style={{
              display: 'flex', gap: 4,
              background: 'rgba(255,255,255,0.05)',
              borderRadius: 12, padding: 4,
              marginBottom: 28,
            }}>
              {['signin', 'signup'].map(t => (
                <button
                  key={t}
                  onClick={() => switchTab(t)}
                  style={{
                    flex: 1, padding: '10px 0',
                    borderRadius: 9, border: 'none',
                    fontWeight: 600, fontSize: 14,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    background: tab === t ? 'rgba(99,102,241,0.85)' : 'transparent',
                    color: tab === t ? '#fff' : 'rgba(255,255,255,0.4)',
                  }}
                >
                  {t === 'signin' ? 'Sign In' : 'Create Account'}
                </button>
              ))}
            </div>
          )}

          {/* ── Verify email ── */}
          {verifying ? (
            <form onSubmit={handleVerify} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ textAlign: 'center', marginBottom: 8 }}>
                <p style={{ color: '#fff', fontWeight: 700, fontSize: 20, marginBottom: 6 }}>Check your email</p>
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>We sent a 6-digit code to <strong style={{ color: '#818cf8' }}>{email}</strong></p>
              </div>
              <AuthInput icon={Mail} placeholder="Enter verification code" value={code} onChange={e => setCode(e.target.value)} />
              {error && <p style={{ color: '#f87171', fontSize: 13, textAlign: 'center' }}>{error}</p>}
              <SubmitButton loading={loading} label="Verify Email" />
              <button type="button" onClick={() => { setVerifying(false); setError(''); }}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 13, cursor: 'pointer', marginTop: 4 }}>
                ← Back
              </button>
            </form>

          ) : tab === 'signin' ? (
            /* ── Sign In Form ── */
            <form onSubmit={handleSignIn} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <AuthInput icon={Mail} type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} />
              <AuthInput
                icon={Lock} type={showPass ? 'text' : 'password'} placeholder="Password"
                value={password} onChange={e => setPassword(e.target.value)}
                right={
                  <button type="button" onClick={() => setShowPass(v => !v)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', display: 'flex' }}>
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                }
              />
              {error && <p style={{ color: '#f87171', fontSize: 13 }}>{error}</p>}
              <SubmitButton loading={loading} label="Sign In" />
            </form>

          ) : (
            /* ── Sign Up Form ── */
            <form onSubmit={handleSignUp} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <AuthInput icon={User} placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} />
              <AuthInput icon={Mail} type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} />
              <AuthInput
                icon={Lock} type={showPass ? 'text' : 'password'} placeholder="Create a password"
                value={password} onChange={e => setPassword(e.target.value)}
                right={
                  <button type="button" onClick={() => setShowPass(v => !v)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', display: 'flex' }}>
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                }
              />
              {error && <p style={{ color: '#f87171', fontSize: 13 }}>{error}</p>}
              <SubmitButton loading={loading} label="Create Account" />
            </form>
          )}

          {/* Fine print */}
          {!verifying && (
            <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: 12, marginTop: 20 }}>
              By continuing you agree to our Terms & Privacy Policy
            </p>
          )}
        </div>
      </div>
    </>
  );
}

// ── Shared submit button ──────────────────────────────────────────────────────
function SubmitButton({ loading, label }) {
  return (
    <button
      type="submit"
      disabled={loading}
      style={{
        width: '100%',
        padding: '14px',
        borderRadius: 12,
        border: 'none',
        background: loading ? 'rgba(99,102,241,0.4)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
        color: '#fff',
        fontWeight: 700,
        fontSize: 15,
        cursor: loading ? 'not-allowed' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        transition: 'opacity 0.2s',
        marginTop: 4,
        boxShadow: '0 0 30px rgba(99,102,241,0.35)',
      }}
    >
      {loading ? <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Working...</> : label}
    </button>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
function App() {
  const [authOpen, setAuthOpen] = useState(false);

  return (
    <>
      {/* ── LANDING PAGE (signed out) ─────────────────────────────── */}
      <SignedOut>
        {/* Inject CSS to replace the native browser cursor with a Ghost globally on this page */}
        <style>{`
          .landing-cursor-override,
          .landing-cursor-override * {
            cursor: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="white" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 10h.01"/><path d="M15 10h.01"/><path d="M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z"/></svg>') 16 16, auto !important;
          }
        `}</style>
        
        <div className="landing-cursor-override" style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>

          {/* Ghost animation fills the screen */}
          <Suspense fallback={<div style={{ width: '100vw', height: '100vh', background: '#0a0a0a' }} />}>
            <SpectralGhost
              loadingText="Summoning spirits"
              quote={<>Outreach<br />Engine</>}
              author="The smarter way to reach people"
            />
          </Suspense>

          {/* Floating navbar */}
          <nav style={{
            position: 'absolute', top: 0, left: 0, right: 0,
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            padding: '24px',
            zIndex: 100,
          }}>
            {/* Logo, aligned center and larger */}
            <img
              src={outrenchLogo}
              alt="Outrench"
              style={{ height: 48, objectFit: 'contain' }}
            />
          </nav>

          {/* Bottom CTA */}
          <div style={{
            position: 'absolute',
            bottom: '12vh', left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 100,
            textAlign: 'center',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', gap: 16,
          }}>
            <button
              onClick={() => setAuthOpen(true)}
              style={{
                background: 'rgba(99,102,241,0.9)',
                border: '1px solid rgba(99,102,241,0.6)',
                backdropFilter: 'blur(12px)',
                color: 'white',
                padding: '14px 36px',
                borderRadius: 50,
                fontWeight: 700,
                fontSize: 15,
                display: 'flex', alignItems: 'center', gap: 8,
                boxShadow: '0 0 40px rgba(99,102,241,0.4)',
                transition: 'transform 0.2s, box-shadow 0.2s',
              }}
              onMouseOver={e => { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.boxShadow = '0 0 60px rgba(99,102,241,0.6)'; }}
              onMouseOut={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 0 40px rgba(99,102,241,0.4)'; }}
            >
              {/* Invisible spacer ensures the word "Get Started" forms the true optical center */}
              <div style={{ width: 15 }} />
              <span>Get Started</span>
              <Send size={15} />
            </button>
          </div>

          {/* Bottom Left Version */}
          <div style={{
            position: 'absolute', bottom: '24px', left: '24px',
            zIndex: 100,
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            padding: '8px 14px',
            borderRadius: '10px',
            color: 'rgba(255,255,255,0.4)',
            fontSize: '11px',
            fontFamily: '"PPSupplyMono", monospace',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}>
            v1.0.0_beta
          </div>

          {/* Bottom Right Links */}
          <div style={{
            position: 'absolute', bottom: '24px', right: '24px',
            zIndex: 100,
            display: 'flex', gap: '20px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            padding: '10px 24px',
            borderRadius: '50px',
          }}>
            {['About', 'Privacy', 'Terms'].map(link => (
              <a
                key={link}
                href={`#${link.toLowerCase()}`}
                style={{
                  color: 'rgba(255,255,255,0.5)',
                  fontSize: '12px',
                  textDecoration: 'none',
                  fontWeight: 500,
                  transition: 'color 0.2s',
                  fontFamily: 'system-ui',
                }}
                onMouseOver={e => e.currentTarget.style.color = '#fff'}
                onMouseOut={e => e.currentTarget.style.color = 'rgba(255,255,255,0.5)'}
              >
                {link}
              </a>
            ))}
          </div>
        </div>

        {/* Auth bottom sheet */}
        <AuthSheet isOpen={authOpen} onClose={() => setAuthOpen(false)} />
      </SignedOut>

      {/* ── DASHBOARD (signed in) ─────────────────────────────────── */}
      <SignedIn>
        <Dashboard />
      </SignedIn>
    </>
  );
}

export default App;
