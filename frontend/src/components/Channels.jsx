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
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDriverActive, setIsDriverActive] = useState(false);

  // Check for Extension presence & Listen for data
  useEffect(() => {
    const checkDriver = () => {
      // Check for either the window variable or the DOM attribute
      const hasAttr = document.documentElement.getAttribute('data-ghost-driver') === 'active';
      if (window.__GHOST_DRIVER__ || hasAttr) {
        setIsDriverActive(true);
      }
    };
    const timer = setInterval(checkDriver, 1000);

    const handleMessage = (event) => {
      if (event.data.type === "SYNC_COMPLETE") {
        setConnections(prev => ({ ...prev, [connectionKey]: event.data.profile || true }));
        setIsSyncing(false);
      }
      if (event.data.type === "SYNC_ERROR") {
        setError(event.data.error);
        setIsSyncing(false);
      }
      if (event.data.type === "SESSION_NOT_FOUND") {
        setError(event.data.error);
        setIsSyncing(false);
      }
    };

    window.addEventListener("message", handleMessage);

    return () => {
      clearInterval(timer);
      window.removeEventListener("message", handleMessage);
    };
  }, [user, activePlatform, activeAccount]);

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

  const handleConnect = () => {
    if (!user) return;
    setError('');
    setIsSyncing(true);
    // Tell the extension: "Sync THIS user for THIS platform"
    window.postMessage({ 
      type: "SYNC_PROFILE_REQUEST",
      clerk_id: user.id,
      platform: activePlatform,
      account_type: activeAccount
    }, "*");
    
    // Safety timeout
    setTimeout(() => setIsSyncing(false), 8000);
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
            // Get profile data if connected
            const profile = connections[`${activePlatform}_${acc.id}`];
            const isConn = !!profile;
            const displayHandle = isConn && profile.handle ? profile.handle : acc.handle;
            const displayAvatar = isConn && profile.avatar_url ? profile.avatar_url : null;

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
                  {displayAvatar ? (
                    <img src={displayAvatar} alt="avatar" style={{ width: 14, height: 14, borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: acc.badge }} />
                  )}
                  <span style={{ fontWeight: 600 }}>{acc.label}</span>
                </div>
                <span style={{ fontSize: 10, color: isActive ? '#fca5a5' : 'rgba(255,255,255,0.3)', fontFamily: '"PPSupplyMono", monospace' }}>
                  {displayHandle}
                </span>
              </button>
            );
          })}
        </div>

        {/* Global Auto/Manual Toggle & Disconnect */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 16 }}>
          {isConnected && (
             <button 
               onClick={handleDisconnect}
               style={{
                 background: 'rgba(239, 68, 68, 0.1)',
                 border: '1px solid rgba(239, 68, 68, 0.2)',
                 color: '#f87171',
                 padding: '6px 14px',
                 borderRadius: 99,
                 fontSize: 12,
                 fontWeight: 600,
                 cursor: 'pointer',
                 display: 'flex',
                 alignItems: 'center',
                 gap: 6,
                 transition: 'all 0.2s',
               }}
               onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'; e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.4)'; }}
               onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'; e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.2)'; }}
             >
               <XCircle size={14} /> Disconnect
             </button>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
          // ── CONNECTION / GHOST DRIVER SETUP VIEW ──
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
              padding: 40,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
            }}>
              <div style={{ 
                width: 64, height: 64, 
                borderRadius: '50%', 
                background: 'rgba(245,158,11,0.1)', 
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 24,
                border: '1px solid rgba(245,158,11,0.2)',
                position: 'relative'
              }}>
                <Zap size={32} style={{ color: '#f59e0b' }} />
                {isDriverActive && (
                  <div style={{ 
                    position: 'absolute', top: -2, right: -2, 
                    width: 14, height: 14, 
                    borderRadius: '50%', 
                    background: '#10b981', 
                    border: '3px solid #14100c' 
                  }} />
                )}
              </div>

              <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 12px 0', color: '#fff' }}>
                {isDriverActive ? 'Ghost Driver Active' : 'Ghost Driver Missing'}
              </h2>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', maxWidth: 400, margin: '0 0 32px 0', lineHeight: 1.6 }}>
                {isDriverActive 
                  ? "Your Ghost Driver is connected. Spirit can now securely use your browser to manage your growth strategy."
                  : "To bypass Twitter limits and $100/mo costs, we use the Ghost Driver. It acts as Spirit's physical hands on the web."}
              </p>

              {!isDriverActive ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>
                  <button 
                    onClick={() => window.open('https://github.com/ghostm0nk/outrench-extension', '_blank')}
                    style={{ 
                      background: 'rgba(255,255,255,0.05)', 
                      border: '1px solid rgba(255,255,255,0.1)', 
                      color: '#fff', 
                      padding: '12px 24px', 
                      borderRadius: 12, 
                      fontWeight: 600, 
                      cursor: 'pointer',
                      fontSize: 14,
                      transition: 'all 0.2s',
                    }}
                    onMouseOver={(e) => e.target.style.background = 'rgba(255,255,255,0.08)'}
                    onMouseOut={(e) => e.target.style.background = 'rgba(255,255,255,0.05)'}
                  >
                    Step 1: Get Ghost Driver Folder
                  </button>
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', margin: 0 }}>
                    Then visit <span style={{ color: '#f59e0b' }}>chrome://extensions</span> and drag the folder in.
                  </p>
                </div>
              ) : (
                <button 
                  onClick={handleConnect}
                  disabled={isSyncing}
                  style={{ 
                    width: '100%',
                    background: isSyncing ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, #f59e0b, #ea580c)', 
                    border: 'none', 
                    color: isSyncing ? 'rgba(255,255,255,0.3)' : '#fff', 
                    padding: '14px 32px', 
                    borderRadius: 12, 
                    fontWeight: 700, 
                    cursor: isSyncing ? 'not-allowed' : 'pointer',
                    fontSize: 16,
                    boxShadow: isSyncing ? 'none' : '0 4px 20px rgba(245,158,11,0.3)',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10
                  }}
                  onMouseOver={(e) => !isSyncing && (e.target.style.transform = 'scale(1.02)')}
                  onMouseOut={(e) => !isSyncing && (e.target.style.transform = 'scale(1)')}
                >
                  {isSyncing ? (
                    <>
                      <RefreshCw size={18} className="spin-fast" /> Connecting...
                    </>
                  ) : 'Awaken & Sync Spirit'}
                </button>
              )}

              {error && <div style={{ marginTop: 20, color: '#ef4444', fontSize: 13, background: 'rgba(239, 68, 68, 0.1)', padding: '8px 16px', borderRadius: 8 }}>{error}</div>}
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

            </div>
          </>
        )}
      </div>
    </div>
  );
}
