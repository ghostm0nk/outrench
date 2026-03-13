import React, { useState, useEffect } from 'react';
import { useUser } from '@clerk/clerk-react';
import { 
  Twitter, 
  Video, 
  Send, 
  UserPlus, 
  TrendingUp, 
  Zap,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Search,
  Eye,
  MessageSquare
} from 'lucide-react';

// ── Mock Data ────────────────────────────────────────────────────────────────
const PLATFORMS = [
  { id: 'twitter', label: 'Twitter', icon: Twitter, color: '#1DA1F2' },
  { id: 'tiktok', label: 'TikTok', icon: Video, color: '#ff0050' },
];

const ACCOUNTS = [
  { id: 'personal', label: 'Personal', handle: '@jubay', badge: '#f59e0b' },
  { id: 'product', label: 'Product', handle: '@outrench', badge: '#10b981' },
];

// ── Channels Main Component ──────────────────────────────────────────────────
export default function Channels() {
  const { user } = useUser();
  const [activePlatform, setActivePlatform] = useState('twitter');
  const [activeAccount, setActiveAccount] = useState('personal');
  const [isAuto, setIsAuto] = useState(false);
  const [connections, setConnections] = useState({}); // e.g. { 'twitter_personal': true }
  const [tokens, setTokens] = useState({}); // e.g. { 'twitter_personal': 'token_value' }
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Fetch true connection status on mount
  useEffect(() => {
    if (!user) return;
    
    fetch(`${import.meta.env.VITE_API_URL}/api/channels/status/${user.id}`)
      .then(res => res.json())
      .then(data => {
        if (data.connections) setConnections(data.connections);
        if (data.tokens) setTokens(data.tokens);
      })
      .catch(err => console.error("Error fetching channels status:", err))
      .finally(() => setIsLoading(false));
  }, [user]);

  const connectionKey = `${activePlatform}_${activeAccount}`;
  const isConnected = !!connections[connectionKey];
  const authToken = tokens[connectionKey] || '';

  const handleConnect = async () => {
    setError('');
    const token = authToken.trim();
    
    // Front-end validation for Twitter auth_token
    if (activePlatform === 'twitter') {
      const isHex = /^[0-9a-fA-F]+$/.test(token);
      if (token.length !== 40 || !isHex) {
        setError('Invalid auth_token. A valid Twitter auth_token is exactly 40 hex characters.');
        return; // Halt connection
      }
    } else {
      // Basic check for TikTok (can be updated later)
      if (token.length < 10) {
        setError('Invalid session token.');
        return;
      }
    }

    // If valid, connect via API
    try {
      const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/channels/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clerk_id: user.id,
          platform: activePlatform,
          account_type: activeAccount,
          auth_token: token,
        })
      });
      if (!resp.ok) throw new Error("Failed to connect");
      
      setConnections(prev => ({ ...prev, [connectionKey]: true }));
    } catch (err) {
      setError("Failed to save credentials to backend.");
      console.error(err);
    }
  };

  const handleDisconnect = async () => {
    try {
      const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/channels/disconnect/${user.id}/${activePlatform}/${activeAccount}`, {
        method: 'DELETE',
      });
      if (!resp.ok) throw new Error("Failed to disconnect");

      setConnections(prev => {
        const next = { ...prev };
        delete next[connectionKey];
        return next;
      });
      setTokens(prev => {
        const next = { ...prev };
        delete next[connectionKey];
        return next;
      });
    } catch (err) {
      console.error(err);
    }
  };

  if (isLoading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.5)' }}>
        <RefreshCw size={24} className="spin-fast" />
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'rgba(15, 12, 8, 0.6)',
      backdropFilter: 'blur(20px)',
      gap: 0,
      animation: 'fadeUp 0.4s ease-out',
    }}>
      
      {/* ── Top Bar: Platform & Account Select ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        background: 'rgba(0,0,0,0.4)',
        borderBottom: '1px solid rgba(245,158,11,0.1)',
        padding: '0 20px',
        height: 64,
        flexShrink: 0,
      }}>
        {/* Platforms */}
        <div style={{ display: 'flex', gap: 12, marginRight: 32 }}>
          {PLATFORMS.map(p => {
            const Icon = p.icon;
            const isActive = activePlatform === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setActivePlatform(p.id)}
                style={{
                  background: isActive ? 'rgba(255,255,255,0.06)' : 'transparent',
                  border: `1px solid ${isActive ? 'rgba(255,255,255,0.1)' : 'transparent'}`,
                  color: isActive ? p.color : 'rgba(255,255,255,0.4)',
                  padding: '6px 14px',
                  borderRadius: 99,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  transition: 'all 0.2s',
                }}
              >
                <Icon size={16} />
                {p.label}
              </button>
            );
          })}
        </div>
        
        <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.08)', marginRight: 32 }} />

        {/* Accounts */}
        <div style={{ display: 'flex', gap: 12 }}>
          {ACCOUNTS.map(acc => {
            const isActive = activeAccount === acc.id;
            return (
              <button
                key={acc.id}
                onClick={() => setActiveAccount(acc.id)}
                style={{
                  background: isActive ? 'rgba(245,158,11,0.08)' : 'transparent',
                  border: `1px solid ${isActive ? 'rgba(245,158,11,0.2)' : 'transparent'}`,
                  color: isActive ? '#fff' : 'rgba(255,255,255,0.5)',
                  padding: '6px 14px',
                  borderRadius: 8,
                  fontSize: 13,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: acc.badge }} />
                  <span style={{ fontWeight: 600 }}>{acc.label}</span>
                </div>
                <span style={{ fontSize: 10, color: isActive ? '#fca5a5' : 'rgba(255,255,255,0.3)', fontFamily: '"PPSupplyMono", monospace' }}>
                  {acc.handle}
                </span>
              </button>
            );
          })}
        </div>

        {/* Global Auto/Manual Toggle */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 11, fontFamily: '"PPSupplyMono", monospace', color: isAuto ? '#f59e0b' : 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>
            {isAuto ? 'Spirit Autonomous' : 'Require Approval'}
          </span>
          <button 
            onClick={() => setIsAuto(!isAuto)}
            style={{
              width: 44, height: 22,
              borderRadius: 20,
              background: isAuto ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.08)',
              border: `1px solid ${isAuto ? '#f59e0b' : 'rgba(255,255,255,0.1)'}`,
              position: 'relative',
              cursor: 'pointer',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              padding: 0,
            }}
          >
            <div style={{
              position: 'absolute',
              top: 2, left: isAuto ? 24 : 2,
              width: 16, height: 16,
              borderRadius: '50%',
              background: isAuto ? '#f59e0b' : 'rgba(255,255,255,0.3)',
              boxShadow: isAuto ? '0 0 10px #f59e0b' : 'none',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            }} />
          </button>
        </div>
      </div>

      {/* ── Main View Area ── */}
      <div style={{
        display: 'flex',
        flex: 1,
        overflow: 'hidden',
        padding: 20,
        gap: 20,
      }}>
        {!isConnected ? (
          // ── CONNECTION / API SETUP VIEW ──
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <div style={{
              width: 500,
              background: 'rgba(20,15,10,0.8)',
              border: '1px solid rgba(245,158,11,0.2)',
              borderRadius: 24,
              padding: 32,
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
            }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(245,158,11,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                {activePlatform === 'twitter' ? <Twitter size={24} color="#1DA1F2" /> : <Video size={24} color="#ff0050" />}
              </div>
              
              <h2 style={{ margin: '0 0 8px 0', fontSize: 20, fontWeight: 600 }}>Link {activeAccount === 'personal' ? 'Personal' : 'Product'} {activePlatform === 'twitter' ? 'Twitter' : 'TikTok'} Account</h2>
              <p style={{ margin: '0 0 24px 0', fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>
                Spirit needs access to this platform to scrape leads, monitor growth, and post content on your behalf.
              </p>

              {activePlatform === 'twitter' && (
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: 16, borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)', marginBottom: 24 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: '#fbbf24' }}>How to find your Twitter Auth Token (Free):</div>
                  <ol style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
                    <li>Open Twitter (x.com) in your browser and log in.</li>
                    <li>Right-click anywhere and select <strong>Inspect</strong> (or press F12).</li>
                    <li>Go to the <strong>Application</strong> tab (or "Storage" &gt; "Cookies" in Firefox).</li>
                    <li>Under <strong>Cookies</strong> on the left sidebar, select <code>https://x.com</code>.</li>
                    <li>Find the cookie named <strong>auth_token</strong> and copy its value below.</li>
                  </ol>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>
                    Auth Token Cookie
                  </label>
                  <input 
                    type="password"
                    value={authToken}
                    onChange={(e) => setTokens(prev => ({ ...prev, [connectionKey]: e.target.value }))}
                    placeholder="Enter auth_token value"
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', outline: 'none',
                      color: '#fff', fontSize: 14, padding: '12px 16px', borderRadius: 10,
                    }}
                  />
                </div>

                {error && (
                  <div style={{ color: '#ef4444', fontSize: 12, padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: 8, border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                    {error}
                  </div>
                )}

                <button 
                  onClick={handleConnect}
                  disabled={!authToken}
                  style={{
                    marginTop: 8,
                    background: authToken ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'rgba(255,255,255,0.05)',
                    color: authToken ? '#fff' : 'rgba(255,255,255,0.2)',
                    border: 'none', padding: '14px', borderRadius: 10, fontSize: 14, fontWeight: 600,
                    cursor: authToken ? 'pointer' : 'not-allowed',
                    transition: 'all 0.2s',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    boxShadow: authToken ? '0 4px 15px rgba(245,158,11,0.3)' : 'none'
                  }}
                >
                  <Zap size={16} /> Connect & Awaken Spirit
                </button>
              </div>
            </div>
          </div>
        ) : (
          // ── ACTUAL 3-COLUMN CONTROL BOARD (Shown when Connected) ──
          <>
            {/* COLUMN 1: Market Scout */}
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 20,
              overflow: 'hidden',
            }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Search size={16} style={{ color: '#fbbf24' }} />
                <h3 style={{ fontSize: 13, fontWeight: 600, margin: 0, color: '#fff' }}>Market Scout</h3>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginLeft: 'auto' }}>Awaiting Sync</span>
              </div>
              
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20, textAlign: 'center' }}>
                <Search size={32} style={{ color: 'rgba(255,255,255,0.1)', marginBottom: 16 }} />
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>Scanning Market Signals...</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 8, lineHeight: 1.5, maxWidth: 200 }}>
                  Spirit is currently analyzing {activePlatform} for trending topics and high-engagement leads.
                </div>
              </div>
            </div>

            {/* COLUMN 2: Content Queue */}
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              background: 'rgba(0,0,0,0.4)',
              border: '1px solid rgba(245,158,11,0.15)',
              borderRadius: 20,
              overflow: 'hidden',
              boxShadow: '0 8px 32px rgba(245,158,11,0.05)',
            }}>
              <div style={{ padding: '16px 20px', background: 'rgba(245,158,11,0.05)', borderBottom: '1px solid rgba(245,158,11,0.1)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Zap size={16} style={{ color: '#f59e0b' }} />
                <h3 style={{ fontSize: 13, fontWeight: 600, margin: 0, color: '#fff' }}>Content Queue</h3>
                <span style={{ fontSize: 11, color: '#fbbf24', marginLeft: 'auto' }}>0 Drafts</span>
              </div>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20, textAlign: 'center' }}>
                <MessageSquare size={32} style={{ color: 'rgba(245,158,11,0.2)', marginBottom: 16 }} />
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>Waiting for Inspiration</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 8, lineHeight: 1.5, maxWidth: 200 }}>
                  Drafts will appear here once Spirit finds an angle worth posting about.
                </div>
              </div>
            </div>

            {/* COLUMN 3: Growth Targets */}
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 20,
              overflow: 'hidden',
              position: 'relative',
            }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <UserPlus size={16} style={{ color: '#10b981' }} />
                <h3 style={{ fontSize: 13, fontWeight: 600, margin: 0, color: '#fff' }}>Growth Targets</h3>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginLeft: 'auto' }}>Awaiting Sync</span>
              </div>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20, textAlign: 'center' }}>
                <TrendingUp size={32} style={{ color: 'rgba(16,185,129,0.2)', marginBottom: 16 }} />
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>Identifying Key Accounts</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 8, lineHeight: 1.5, maxWidth: 200 }}>
                  Spirit is looking for high-value accounts you should interact with to boost visibility.
                </div>
              </div>

              <button 
                onClick={handleDisconnect}
                style={{ position: 'absolute', bottom: 12, right: 12, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.3)', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 10, transition: 'all 0.2s' }}
                onMouseOver={(e) => e.target.style.color = '#fff'}
                onMouseOut={(e) => e.target.style.color = 'rgba(255,255,255,0.3)'}
              >
                Disconnect
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
