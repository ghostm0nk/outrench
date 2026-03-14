import React, { useState, useEffect, useCallback } from 'react';
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
  MessageSquare,
  Globe,
  Database,
  BarChart2,
  ListTodo,
  Flame,
  ArrowRight,
  ShieldCheck,
  Layout,
  Activity
} from 'lucide-react';

const SOURCES = [
  { id: 'all', label: 'Intelligence Feed', icon: Activity, color: '#818cf8', description: 'Consolidated view of all AI findings' },
  { id: 'google', label: 'Google Search', icon: Globe, color: '#4285F4', description: 'Broad search insights and market leads' },
  { id: 'twitter', label: 'X / Twitter', icon: Twitter, color: '#1DA1F2', description: 'Social signals and direct outreach' },
  { id: 'tiktok', label: 'TikTok', icon: Video, color: '#ff0050', description: 'Viral trends and video strategy' },
];

export default function Channels() {
  const { user } = useUser();
  const [activeSource, setActiveSource] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');
  
  // Data state
  const [leads, setLeads] = useState([]);
  const [queue, setQueue] = useState([]);
  const [trends, setTrends] = useState([]);
  const [connections, setConnections] = useState({});
  const [isDriverActive, setIsDriverActive] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const fetchAllData = useCallback(async () => {
    if (!user) return;
    setIsRefreshing(true);
    try {
      const baseUrl = import.meta.env.VITE_API_URL;
      const [leadsRes, queueRes, trendsRes, statusRes] = await Promise.all([
        fetch(`${baseUrl}/api/market/leads/${user.id}`).then(r => r.json()),
        fetch(`${baseUrl}/api/content/queue/${user.id}`).then(r => r.json()),
        fetch(`${baseUrl}/api/growth/trends/${user.id}`).then(r => r.json()),
        fetch(`${baseUrl}/api/channels/status/${user.id}`).then(r => r.json())
      ]);

      if (leadsRes.leads) setLeads(leadsRes.leads);
      if (queueRes.queue) setQueue(queueRes.queue);
      if (trendsRes.trends) setTrends(trendsRes.trends);
      if (statusRes.connections) setConnections(statusRes.connections);
    } catch (err) {
      console.error("Failed to fetch intelligence data", err);
      setError("Network error: Spirit could not reach the database.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // Extension status checking & Sync listeners
  useEffect(() => {
    const checkDriver = () => {
      const hasAttr = document.documentElement.getAttribute('data-ghost-driver') === 'active';
      if (window.__GHOST_DRIVER__ || hasAttr) setIsDriverActive(true);
    };
    const timer = setInterval(checkDriver, 2000);

    const handleMessage = (event) => {
      if (event.data.type === "SYNC_COMPLETE") {
        fetchAllData();
        setIsSyncing(false);
      }
      if (event.data.type === "SYNC_ERROR" || event.data.type === "SESSION_NOT_FOUND") {
        setError(event.data.error || "Ghost Driver sync failed.");
        setIsSyncing(false);
      }
    };
    window.addEventListener("message", handleMessage);

    return () => {
      clearInterval(timer);
      window.removeEventListener("message", handleMessage);
    };
  }, [fetchAllData]);

  const handleSync = () => {
    if (!user || activeSource === 'all') return;
    setError('');
    setIsSyncing(true);
    window.postMessage({ 
      type: "SYNC_PROFILE_REQUEST",
      clerk_id: user.id,
      platform: activeSource,
      account_type: 'personal' // Defaulting for simplicity in this view
    }, "*");
    
    setTimeout(() => setIsSyncing(false), 10000);
  };

  const handleDisconnect = async (platform) => {
    if (!confirm(`Disconnect ${platform}?`)) return;
    try {
      const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/channels/disconnect/${user.id}/${platform}/personal`, {
        method: 'DELETE',
      });
      if (resp.ok) fetchAllData();
    } catch (err) {
      console.error(err);
    }
  };

  // Filter logic
  const filteredLeads = activeSource === 'all' ? leads : leads.filter(l => l.platform?.toLowerCase() === activeSource);
  const filteredQueue = activeSource === 'all' ? queue : queue.filter(q => q.platform?.toLowerCase() === activeSource);
  const filteredTrends = activeSource === 'all' ? trends : trends.filter(t => t.platform?.toLowerCase() === activeSource);

  // Connection helpers
  const getSourceConnections = (source) => {
    if (source === 'all') return Object.keys(connections).length;
    return Object.keys(connections).filter(k => k.startsWith(source)).length;
  };

  if (isLoading) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
        <RefreshCw size={32} className="spin-fast" style={{ color: '#818cf8' }} />
        <span style={{ fontSize: 12, fontFamily: '"PPSupplyMono", monospace', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em' }}>
          Initializing Intelligence Hub...
        </span>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      height: '100%',
      background: 'rgba(10, 10, 12, 0.4)',
      backdropFilter: 'blur(30px)',
      overflow: 'hidden',
    }}>
      {/* ── Sidebar: Data Sources ── */}
      <div style={{
        width: 280,
        borderRight: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(0,0,0,0.2)',
        flexShrink: 0,
      }}>
        <div style={{ padding: '24px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Layout size={18} style={{ color: '#818cf8' }} />
          <h1 style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.02em', margin: 0 }}>Intelligence</h1>
        </div>

        <div style={{ flex: 1, padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {SOURCES.map(source => {
            const Icon = source.icon;
            const isActive = activeSource === source.id;
            const connCount = getSourceConnections(source.id);
            
            return (
              <button
                key={source.id}
                onClick={() => setActiveSource(source.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 14px',
                  borderRadius: 12,
                  border: '1px solid transparent',
                  background: isActive ? 'rgba(129, 140, 248, 0.08)' : 'transparent',
                  borderColor: isActive ? 'rgba(129, 140, 248, 0.15)' : 'transparent',
                  color: isActive ? '#fff' : 'rgba(255,255,255,0.5)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              >
                <div style={{
                  width: 32, height: 32,
                  borderRadius: 8,
                  background: isActive ? source.color : 'rgba(255,255,255,0.03)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: isActive ? '#fff' : source.color,
                  transition: 'all 0.2s',
                }}>
                  <Icon size={18} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{source.label}</div>
                  <div style={{ fontSize: 10, opacity: 0.6 }}>{connCount > 0 ? `${connCount} active channel` : 'Not connected'}</div>
                </div>
                {isActive && <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#818cf8' }} />}
              </button>
            );
          })}
        </div>

        {/* Sync Status Footer */}
        <div style={{ padding: 20, borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: isDriverActive ? '#10b981' : '#f59e0b', boxShadow: isDriverActive ? '0 0 8px #10b981' : 'none' }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>
              Ghost Driver {isDriverActive ? 'Ready' : 'Standby'}
            </span>
          </div>
          <button 
            onClick={fetchAllData}
            disabled={isRefreshing}
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: 8,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.7)',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <RefreshCw size={12} className={isRefreshing ? "spin-fast" : ""} />
            Database Refresh
          </button>
        </div>
      </div>

      {/* ── Main content: Intelligence Feed ── */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Feed Header */}
        <div style={{
          padding: '24px 32px',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px 0' }}>{SOURCES.find(s => s.id === activeSource)?.label}</h2>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', margin: 0 }}>
              {SOURCES.find(s => s.id === activeSource)?.description}
            </p>
          </div>
          
          <div style={{ display: 'flex', gap: 12 }}>
            {activeSource !== 'all' && (
              <div style={{ display: 'flex', gap: 8 }}>
                {getSourceConnections(activeSource) > 0 ? (
                  <button 
                    onClick={() => handleDisconnect(activeSource)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 10,
                      background: 'rgba(239,68,68,0.05)',
                      border: '1px solid rgba(239,68,68,0.1)',
                      color: '#f87171',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Disconnect
                  </button>
                ) : null}
                
                <button 
                  onClick={handleSync}
                  disabled={isSyncing || !isDriverActive}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 10,
                    background: isSyncing ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, #818cf8, #6366f1)',
                    border: 'none',
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: (isSyncing || !isDriverActive) ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    boxShadow: isSyncing ? 'none' : '0 4px 12px rgba(129,140,248,0.3)'
                  }}
                >
                  {isSyncing ? <RefreshCw size={14} className="spin-fast" /> : <Zap size={14} />}
                  {isSyncing ? 'Syncing...' : 'Sync Platform'}
                </button>
              </div>
            )}

            <div style={{ width: 1, background: 'rgba(255,255,255,0.05)', margin: '0 8px' }} />

            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, fontFamily: '"PPSupplyMono", monospace', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>Session Health</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#10b981' }}>Optimized</div>
            </div>
          </div>
        </div>

        {/* Scrollable Feed */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px 32px',
          display: 'flex',
          flexDirection: 'column',
          gap: 32,
        }}>
          {error && (
             <div style={{ padding: '16px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 12, color: '#f87171', fontSize: 13 }}>
                {error}
             </div>
          )}

          {/* ── Section: Market Leads (Scouted Users) ── */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <UserPlus size={16} style={{ color: '#818cf8' }} />
              <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0, opacity: 0.6 }}>Market Leads</h3>
              <div style={{ padding: '2px 8px', borderRadius: 4, background: 'rgba(129,140,248,0.1)', color: '#818cf8', fontSize: 10, fontWeight: 700 }}>{filteredLeads.length}</div>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: 16,
            }}>
              {filteredLeads.length === 0 ? (
                <EmptyState icon={UserPlus} text="No scouted leads in this sector." />
              ) : (
                filteredLeads.map(lead => <LeadCard key={lead.id} lead={lead} />)
              )}
            </div>
          </section>

          {/* ── Section: Content Queue (AI Drafts) ── */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <MessageSquare size={16} style={{ color: '#fbbf24' }} />
              <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0, opacity: 0.6 }}>Strategic Drafts</h3>
              <div style={{ padding: '2px 8px', borderRadius: 4, background: 'rgba(251,191,36,0.1)', color: '#fbbf24', fontSize: 10, fontWeight: 700 }}>{filteredQueue.length}</div>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: 16,
            }}>
              {filteredQueue.length === 0 ? (
                <EmptyState icon={MessageSquare} text="Awaiting strategic content generation." />
              ) : (
                filteredQueue.map(item => <QueueCard key={item.id} item={item} />)
              )}
            </div>
          </section>

          {/* ── Section: Growth Trends ── */}
          <section style={{ marginBottom: 40 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <TrendingUp size={16} style={{ color: '#10b981' }} />
              <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0, opacity: 0.6 }}>Industry Trends</h3>
              <div style={{ padding: '2px 8px', borderRadius: 4, background: 'rgba(16,185,129,0.1)', color: '#10b981', fontSize: 10, fontWeight: 700 }}>{filteredTrends.length}</div>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: 16,
            }}>
              {filteredTrends.length === 0 ? (
                <EmptyState icon={TrendingUp} text="Spirit is currently mapping market trends." />
              ) : (
                filteredTrends.map(trend => <TrendCard key={trend.id} trend={trend} />)
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

// ── Sub-Components ──

function EmptyState({ icon: Icon, text }) {
  return (
    <div style={{
      gridColumn: '1 / -1',
      padding: '40px 20px',
      border: '1px dashed rgba(255,255,255,0.06)',
      borderRadius: 16,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      color: 'rgba(255,255,255,0.2)',
    }}>
      <Icon size={24} strokeWidth={1.5} />
      <span style={{ fontSize: 12 }}>{text}</span>
    </div>
  );
}

function LeadCard({ lead }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.05)',
      borderRadius: 16,
      padding: 16,
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <img 
          src={lead.avatar_url || 'https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png'} 
          style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.1)' }} 
        />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{lead.name}</div>
          <div style={{ fontSize: 11, color: '#818cf8', fontWeight: 500 }}>{lead.handle}</div>
        </div>
        <div style={{
          padding: '2px 6px',
          background: 'rgba(129, 140, 248, 0.1)',
          borderRadius: 4,
          fontSize: 9,
          fontFamily: '"PPSupplyMono", monospace',
          color: '#818cf8',
          textTransform: 'uppercase'
        }}>
          {lead.platform}
        </div>
      </div>
      
      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5, margin: 0 }}>
        {lead.content}
      </p>

      <div style={{
        marginTop: 'auto',
        display: 'flex',
        alignItems: 'center',
        background: 'rgba(0,0,0,0.2)',
        padding: '8px 10px',
        borderRadius: 8,
        gap: 6,
      }}>
        <Search size={10} style={{ color: 'rgba(255,255,255,0.3)' }} />
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {lead.reason}
        </span>
      </div>
    </div>
  );
}

function QueueCard({ item }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.05)',
      borderRadius: 16,
      padding: 20,
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(251,191,36,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fbbf24' }}>
          <Zap size={14} />
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          AI Generated Hook
        </span>
      </div>

      <p style={{ fontSize: 13, color: '#fff', lineHeight: 1.6, margin: 0, fontStyle: 'italic' }}>
        "{item.content}"
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 'auto' }}>
        <div style={{ display: 'flex', gap: 4 }}>
           <div style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)', fontSize: 9, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>
            {item.platform}
          </div>
          <div style={{ padding: '2px 8px', borderRadius: 4, background: 'rgba(251,191,36,0.1)', color: '#fbbf24', fontSize: 9, fontWeight: 700, textTransform: 'uppercase' }}>
            Draft
          </div>
        </div>
      </div>
    </div>
  );
}

function TrendCard({ trend }) {
  return (
    <div style={{
      background: 'rgba(16,185,129,0.03)',
      border: '1px solid rgba(16,185,129,0.1)',
      borderRadius: 16,
      padding: '16px 20px',
      display: 'flex',
      alignItems: 'center',
      gap: 16,
    }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
        <Flame size={20} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{trend.keyword}</div>
        <div style={{ fontSize: 10, color: '#10b981', fontFamily: '"PPSupplyMono", monospace', display: 'flex', alignItems: 'center', gap: 4 }}>
          <TrendingUp size={10} />
          {trend.volume || 'Rising'}
        </div>
      </div>
      <ArrowRight size={14} style={{ opacity: 0.2 }} />
    </div>
  );
}
