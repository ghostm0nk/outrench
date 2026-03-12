import React, { useState } from 'react';
import { useUser, UserButton } from '@clerk/clerk-react';
import { Copy, Send, Loader2, Sparkles } from 'lucide-react';
import axios from 'axios';
import outrenchLogo from '../assets/outrench.png';

export default function Dashboard() {
  const { user } = useUser();
  const [platform, setPlatform] = useState('reddit');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [latestPost, setLatestPost] = useState('');
  const [generatedMessage, setGeneratedMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    if (!username.trim()) return;
    setIsLoading(true);
    setGeneratedMessage('');
    setCopied(false);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const response = await axios.post(`${apiUrl}/api/generate`, {
        username: username.trim(),
        target_platform: platform,
        bio: bio.trim(),
        latest_post: latestPost.trim(),
      });
      setGeneratedMessage(response.data.message);
    } catch (error) {
      console.error('Error generating message:', error);
      alert('Failed to generate message. Check console for details.');
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedMessage);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0a',
      backgroundImage: `
        radial-gradient(circle at 15% 50%, rgba(99, 102, 241, 0.08) 0%, transparent 50%),
        radial-gradient(circle at 85% 30%, rgba(236, 40, 165, 0.08) 0%, transparent 50%)
      `,
      color: '#fff',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* ── Navbar ── */}
      <header style={{
        padding: '20px 48px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'rgba(10,10,10,0.6)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        position: 'sticky',
        top: 0,
        zIndex: 100
      }}>
        <img src={outrenchLogo} alt="Outrench" style={{ height: 32, objectFit: 'contain' }} />
        <UserButton appearance={{ elements: { userButtonAvatarBox: 'w-10 h-10 border border-white/10' } }} />
      </header>

      {/* ── Main Content ── */}
      <main style={{ flex: 1, padding: '40px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        
        {/* Header Text */}
        <div style={{ textAlign: 'center', marginBottom: 48, maxWidth: 600 }}>
          <h2 style={{ fontSize: '32px', fontWeight: 800, marginBottom: '12px', letterSpacing: '-0.5px' }}>
            Welcome back, {user?.username || user?.firstName || 'there'} 👋
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '16px', lineHeight: 1.5 }}>
            Craft hyper-personalized, AI-driven outreach that gets replies.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '40px', width: '100%', maxWidth: '1000px', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'flex-start' }}>
          
          {/* ── Form Card ── */}
          <div style={{
            flex: '1 1 400px',
            background: 'linear-gradient(145deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))',
            border: '1px solid rgba(255,255,255,0.05)',
            borderRadius: '24px',
            padding: '32px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            backdropFilter: 'blur(10px)',
          }}>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Channel
              </label>
              <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 4, gap: 4 }}>
                {['reddit', 'twitter', 'email'].map((p) => (
                  <button
                    key={p}
                    onClick={() => setPlatform(p)}
                    style={{
                      flex: 1, padding: '10px', borderRadius: 8, border: 'none',
                      fontWeight: 600, fontSize: 14, textTransform: 'capitalize', cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      background: platform === p ? 'rgba(255,255,255,0.1)' : 'transparent',
                      color: platform === p ? '#fff' : 'rgba(255,255,255,0.4)',
                      boxShadow: platform === p ? '0 4px 12px rgba(0,0,0,0.2)' : 'none'
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <InputGroup label="Target Handle / Username" value={username} onChange={setUsername} placeholder="e.g. u/startup_fanatic" />
              <InputGroup label="User Bio" value={bio} onChange={setBio} placeholder="e.g. Early-stage founder looking for tools..." optional />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Context / Latest Post <span style={{ opacity: 0.5, fontWeight: 400, textTransform: 'none' }}>(Optional)</span>
                </label>
                <textarea
                  value={latestPost} onChange={(e) => setLatestPost(e.target.value)}
                  placeholder="e.g. 'I spend so much time replying to emails...'"
                  rows={3}
                  style={{
                    width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 12, padding: '14px 16px', color: '#fff', fontSize: 15, outline: 'none',
                    resize: 'none', transition: 'border-color 0.2s', boxSizing: 'border-box'
                  }}
                  onFocus={e => e.target.style.borderColor = 'rgba(99,102,241,0.6)'}
                  onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
                />
              </div>

              <button
                onClick={handleGenerate}
                disabled={!username.trim() || isLoading}
                style={{
                  width: '100%', padding: '16px', marginTop: 12, borderRadius: 12, border: 'none',
                  background: isLoading || !username.trim() ? 'rgba(99,102,241,0.3)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  color: isLoading || !username.trim() ? 'rgba(255,255,255,0.4)' : '#fff',
                  fontWeight: 700, fontSize: 15, cursor: isLoading || !username.trim() ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  boxShadow: isLoading || !username.trim() ? 'none' : '0 10px 25px rgba(99,102,241,0.4)',
                  transition: 'all 0.2s',
                }}
              >
                {isLoading ? <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Processing Data...</> : <><Sparkles size={18} /> Generate Perfect Message</>}
              </button>
            </div>
          </div>

          {/* ── Results Card ── */}
          <div style={{
            flex: '1 1 400px',
            minHeight: '450px',
            background: generatedMessage 
              ? 'linear-gradient(145deg, rgba(99,102,241,0.08), rgba(236,40,165,0.03))'
              : 'linear-gradient(145deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))',
            border: generatedMessage ? '1px solid rgba(99,102,241,0.3)' : '1px solid rgba(255,255,255,0.05)',
            borderRadius: '24px',
            padding: '32px',
            boxShadow: generatedMessage ? '0 0 40px rgba(99,102,241,0.1)' : '0 20px 40px rgba(0,0,0,0.5)',
            display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden',
            backdropFilter: 'blur(10px)',
            transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)'
          }}>
            {/* Holographic Top Bar */}
            {generatedMessage && (
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                background: 'linear-gradient(90deg, #6366f1, #ec28a5, #10b981)',
                boxShadow: '0 2px 10px rgba(236,40,165,0.5)'
              }} />
            )}

            {generatedMessage ? (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, animation: 'fadeIn 0.5s ease-out' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#818cf8', fontWeight: 600, fontSize: 13, marginBottom: 24, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <Sparkles size={14} /> AI Generated Draft
                </div>
                
                <div style={{ 
                  flex: 1, fontSize: 18, lineHeight: 1.6, color: '#f3f4f6', 
                  fontStyle: 'italic', letterSpacing: '-0.3px'
                }}>
                  "{generatedMessage}"
                </div>

                <button
                  onClick={copyToClipboard}
                  style={{
                    width: '100%', padding: '16px', marginTop: 32, borderRadius: 12, border: 'none',
                    background: copied ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255,255,255,0.1)',
                    color: copied ? '#10b981' : '#fff',
                    fontWeight: 700, fontSize: 15, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    transition: 'all 0.2s',
                    border: copied ? '1px solid rgba(16,185,129,0.3)' : '1px solid transparent'
                  }}
                  onMouseOver={e => !copied && (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
                  onMouseOut={e => !copied && (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
                >
                  {copied ? 'Copied to Clipboard!' : <><Copy size={18} /> Copy to Clipboard</>}
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'rgba(255,255,255,0.2)' }}>
                <Send size={48} strokeWidth={1} style={{ marginBottom: 24 }} />
                <p style={{ fontSize: 16, fontWeight: 500, marginBottom: 8, color: 'rgba(255,255,255,0.4)' }}>Ready to serialize connection.</p>
                <p style={{ fontSize: 14, textAlign: 'center', maxWidth: 250, lineHeight: 1.5 }}>Enter a target profile on the left and hit generate to craft your message.</p>
              </div>
            )}
          </div>

        </div>
      </main>
      
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}

// ── Reusable Component ──
function InputGroup({ label, placeholder, value, onChange, optional }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label} {optional && <span style={{ opacity: 0.5, fontWeight: 400, textTransform: 'none' }}>(Optional)</span>}
      </label>
      <input
        type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{
          width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12, padding: '14px 16px', color: '#fff', fontSize: 15, outline: 'none',
          transition: 'border-color 0.2s', boxSizing: 'border-box'
        }}
        onFocus={e => e.target.style.borderColor = 'rgba(99,102,241,0.6)'}
        onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
      />
    </div>
  );
}
