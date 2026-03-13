import React, { useState } from 'react';
import { useUser, UserButton } from '@clerk/clerk-react';
import { Home, BookOpen, FileText, Radio, BarChart2, User } from 'lucide-react';
import Station from './Station';
import Channels from './Channels';

// ── Nav config ────────────────────────────────────────────────────────────────
const TOP_TABS = [
  { id: 'station',   label: 'Station',   icon: Home },
  { id: 'channels',  label: 'Channels',  icon: Radio },
  { id: 'analytics', label: 'Analytics', icon: BarChart2 },
];

const BOTTOM_TABS = [
  { id: 'directory', label: 'Directory', icon: BookOpen },
  { id: 'notes',     label: 'Notes',     icon: FileText },
  { id: 'profile',   label: 'Profile',   icon: User, isProfile: true },
];

const ALL_TABS = [...TOP_TABS, ...BOTTOM_TABS];

// ── Dashboard Shell ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('station');

  return (
    <div style={{
      height: '100vh',
      background: '#0f0c08',
      backgroundImage: `
        radial-gradient(circle at 20% 20%, rgba(245,158,11,0.08) 0%, transparent 55%),
        radial-gradient(circle at 80% 80%, rgba(251,146,60,0.06) 0%, transparent 55%)
      `,
      color: '#fff',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      overflow: 'hidden',
    }}>

      {/* ── Page Content Area ── */}
      <main style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        paddingBottom: 90, // clearance for the floating nav bar
      }}>
        {activeTab === 'station' && <Station />}
        {activeTab === 'channels' && <Channels />}
        {activeTab !== 'station' && activeTab !== 'channels' && <PagePlaceholder activeTab={activeTab} />}
      </main>

      {/* ── Bottom Nav Bar ── */}
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />

      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

// ── Bottom Navigation ─────────────────────────────────────────────────────────
function BottomNav({ activeTab, onTabChange }) {
  return (
    <nav style={{
      position: 'fixed',
      bottom: 28,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 200,
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      background: 'rgba(18,18,22,0.75)',
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 999,
      padding: '6px 10px',
      boxShadow: `
        0 4px 32px rgba(0,0,0,0.5),
        0 0 0 1px rgba(255,255,255,0.04) inset,
        0 1px 0 rgba(255,255,255,0.07) inset
      `,
    }}>

      {/* Divider between top-row tabs and bottom-row tabs */}
      {ALL_TABS.map((tab, i) => (
        <React.Fragment key={tab.id}>
          {/* Subtle separator between the two groups */}
          {i === TOP_TABS.length && (
            <div style={{
              width: 1,
              height: 28,
              background: 'rgba(255,255,255,0.08)',
              margin: '0 6px',
              borderRadius: 1,
            }} />
          )}
          <NavPill tab={tab} isActive={activeTab === tab.id} onClick={() => onTabChange(tab.id)} />
        </React.Fragment>
      ))}
    </nav>
  );
}

// ── Individual Nav Pill ───────────────────────────────────────────────────────
function NavPill({ tab, isActive, onClick }) {
  const Icon = tab.icon;

  if (tab.isProfile) {
    // Profile tab: show Clerk UserButton inside the pill
    return (
      <button
        onClick={onClick}
        title="Profile"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: isActive ? 8 : 0,
          padding: isActive ? '8px 16px 8px 10px' : '8px 10px',
          borderRadius: 999,
          border: 'none',
          cursor: 'pointer',
          background: isActive
            ? 'linear-gradient(135deg, rgba(245,158,11,0.25), rgba(251,146,60,0.15))'
            : 'transparent',
          boxShadow: isActive ? '0 0 0 1px rgba(245,158,11,0.35)' : 'none',
          transition: 'all 0.25s cubic-bezier(0.34,1.56,0.64,1)',
          outline: 'none',
        }}
      >
        {/* Clerk UserButton acts as the avatar */}
        <div style={{ pointerEvents: 'none', display: 'flex' }}>
          <UserButton
            appearance={{
              elements: {
                userButtonAvatarBox: {
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  border: '1px solid rgba(255,255,255,0.15)',
                },
              },
            }}
          />
        </div>
        {isActive && (
          <span style={{
            fontSize: 13,
            fontWeight: 600,
            color: '#fdba74',
            whiteSpace: 'nowrap',
            animation: 'fadeUp 0.2s ease-out',
          }}>
            {tab.label}
          </span>
        )}
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      title={tab.label}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: isActive ? 8 : 0,
        padding: isActive ? '8px 18px 8px 14px' : '8px 12px',
        borderRadius: 999,
        border: 'none',
        cursor: 'pointer',
        background: isActive
          ? 'linear-gradient(135deg, rgba(245,158,11,0.25), rgba(251,146,60,0.15))'
          : 'transparent',
        boxShadow: isActive ? '0 0 0 1px rgba(245,158,11,0.35)' : 'none',
        transition: 'all 0.25s cubic-bezier(0.34,1.56,0.64,1)',
        outline: 'none',
        overflow: 'hidden',
      }}
      onMouseEnter={e => {
        if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
      }}
      onMouseLeave={e => {
        if (!isActive) e.currentTarget.style.background = 'transparent';
      }}
    >
      <Icon
        size={18}
        style={{
          color: isActive ? '#a5b4fc' : 'rgba(255,255,255,0.45)',
          transition: 'color 0.2s',
          flexShrink: 0,
        }}
        strokeWidth={isActive ? 2.2 : 1.8}
      />
      {isActive && (
        <span style={{
          fontSize: 13,
          fontWeight: 600,
          color: '#fdba74',
          whiteSpace: 'nowrap',
          animation: 'fadeUp 0.2s ease-out',
        }}>
          {tab.label}
        </span>
      )}
    </button>
  );
}

// ── Placeholder view (to swap out per tab later) ──────────────────────────────
function PagePlaceholder({ activeTab }) {
  const tab = ALL_TABS.find(t => t.id === activeTab);
  const Icon = tab?.icon || Home;
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 16,
      color: 'rgba(255,255,255,0.12)',
      userSelect: 'none',
      animation: 'fadeUp 0.3s ease-out',
    }}>
      <Icon size={48} strokeWidth={1} />
      <span style={{ fontSize: 13, fontFamily: '"PPSupplyMono", monospace', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
        {tab?.label}
      </span>
    </div>
  );
}
