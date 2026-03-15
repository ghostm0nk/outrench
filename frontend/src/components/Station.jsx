import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useUser } from '@clerk/clerk-react';
import {
  CheckCircle2, AlertTriangle, XCircle,
  ChevronDown,
  ChevronUp,
  Terminal as TerminalIcon,
  Send,
  MessageSquare,
  Activity,
  ZoomIn,
  ZoomOut,
  BarChart2,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Station — Main Dashboard View
// Layout:
//   [Notification Bar]
//   [Terminal  |  Task Panel]
//   [Message Input]
// ─────────────────────────────────────────────────────────────────────────────
export default function Station() {
  const { user } = useUser();
  const [input, setInput] = useState('');
  // Session scoreboard — totals accumulate from backend save confirmations
  const [sessionStats, setSessionStats] = useState({ leads: 0, drafts: 0, trends: 0, runs: 0 });
  // Last 5 commands this session
  const [cmdHistory, setCmdHistory] = useState([]);

  // Terminal lines shape: [{ id, timestamp, type, text }]
  const [lines, setLines] = useState([]);

  const pushLine = useCallback((type, text) => {
    setLines(prev => [
      ...prev,
      { id: Date.now() + Math.random(), timestamp: Date.now(), type, text },
    ]);
  }, []);

  // Parse "Saved to database: 3 leads, 2 drafts, 1 trend" into numbers
  const parseSaveLine = useCallback((text) => {
    const leads  = (text.match(/(\d+)\s+lead/)  || [])[1];
    const drafts = (text.match(/(\d+)\s+draft/) || [])[1];
    const trends = (text.match(/(\d+)\s+trend/) || [])[1];
    if (leads || drafts || trends) {
      setSessionStats(prev => ({
        leads:  prev.leads  + (parseInt(leads)  || 0),
        drafts: prev.drafts + (parseInt(drafts) || 0),
        trends: prev.trends + (parseInt(trends) || 0),
        runs: prev.runs,
      }));
    }
    // Count completed runs
    if (text.includes('broadsearch complete')) {
      setSessionStats(prev => ({ ...prev, runs: prev.runs + 1 }));
    }
  }, []);

  // System notification state
  // status: 'ok' | 'warn' | 'error'
  const [sysStatus, setSysStatus] = useState('warn');
  const [sysMessage, setSysMessage] = useState('Summoning Spirit...');
  const [sysExpanded, setSysExpanded] = useState(false);
  const [sysDetail, setSysDetail] = useState('');

  // Prompt mode — when backend asks for a credential field interactively
  const [promptState, setPromptState] = useState({ active: false, field: null, masked: false, label: '' });

  const socketRef = useRef(null);
  const retryTimerRef = useRef(null);
  const retryCountRef = useRef(0);
  const unmountedRef = useRef(false);
  const connectRef = useRef(null); // ref to break circular dependency

  const scheduleRetry = useCallback((shouldRetry) => {
    if (!shouldRetry || unmountedRef.current) {
      setSysStatus('warn');
      setSysMessage('Disconnected');
      return;
    }

    const delays = [2, 4, 8, 16, 30];
    const delay = delays[Math.min(retryCountRef.current, delays.length - 1)];
    retryCountRef.current += 1;

    setSysStatus('warn');
    setSysMessage(`Reconnecting in ${delay}s...`);

    let remaining = delay;
    clearInterval(retryTimerRef.current);
    retryTimerRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(retryTimerRef.current);
        if (!unmountedRef.current) {
          setSysMessage('Attempting reconnect...');
          connectRef.current?.(); // call via ref — no circular dep
        }
      } else {
        setSysMessage(`Reconnecting in ${remaining}s...`);
      }
    }, 1000);
  }, []);

  const connect = useCallback(() => {
    if (unmountedRef.current) return;

    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
    const wsUrl = apiUrl.replace(/^http/, 'ws') + '/api/agent/stream';

    setSysStatus('warn');
    setSysMessage('Waking Spirit...');
    setSysDetail('');

    // Step 1: Ping to wake the Render dyno before opening WebSocket
    fetch(`${apiUrl}/api/ping`, { signal: AbortSignal.timeout(8000) })
      .then(() => {
        if (unmountedRef.current) return;
        setSysMessage('Opening channel...');

        // Step 2: Open WebSocket now that the dyno is awake
        const socket = new WebSocket(wsUrl);
        socketRef.current = socket;

        socket.onopen = () => {
          if (unmountedRef.current) { socket.close(); return; }
          retryCountRef.current = 0;
          setSysStatus('ok');
          setSysMessage('Presence Active');
          setSysDetail('');
          pushLine('ai_response', 'Ghost Driver online. I am your autonomous growth analyst.');
          pushLine('info', 'I can browse X/Twitter and TikTok — reading feeds, following people, and identifying leads — exactly like a senior market analyst would.');
          pushLine('info', 'Tell me which platform to start on and what kind of people to find.');
          pushLine('cmd', 'Example: "Go to X and find founders talking about SaaS struggles"');
        };

        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            // Backend is asking for a credential field — enter prompt mode
            if (data.type === 'prompt') {
              pushLine('info', data.text);
              setPromptState({ active: true, field: data.field, masked: !!data.masked, label: data.text });
              return;
            }
            if (data.type && data.text) {
              pushLine(data.type, data.text);
              if (data.type === 'success') parseSaveLine(data.text);
            }
          } catch (err) {
            console.error('WS parse error', err);
          }
        };

        socket.onerror = () => {
          // onerror always fires before onclose — let onclose handle retry
        };

        socket.onclose = (event) => {
          if (unmountedRef.current) return;
          scheduleRetry(event.code !== 1000);
        };
      })
      .catch((err) => {
        if (unmountedRef.current) return;
        const msg = err?.name === 'TimeoutError'
          ? 'Backend is taking too long to wake (>8s).'
          : 'Cannot reach backend at configured URL.';
        setSysDetail(`${msg} Retrying automatically.`);
        scheduleRetry(true);
      });
  }, [pushLine, scheduleRetry]);

  useEffect(() => {
    connectRef.current = connect; // keep ref in sync
  }, [connect]);

  useEffect(() => {
    unmountedRef.current = false;
    connect();

    return () => {
      unmountedRef.current = true;
      clearInterval(retryTimerRef.current);
      socketRef.current?.close(1000, 'Component unmounted');
    };
  }, []); // intentionally empty — connect() is stable via refs

  const handleSubmit = (e) => {
    e.preventDefault();
    const cmd = input.trim();
    if (!cmd) return;

    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      pushLine('error', 'Agent disconnected. Cannot send command.');
      setInput('');
      return;
    }

    // If we're in prompt mode, send a credential response (never log the value)
    if (promptState.active) {
      pushLine('cmd', promptState.masked ? '••••••••' : cmd);
      socketRef.current.send(JSON.stringify({ type: 'prompt_response', field: promptState.field, value: cmd }));
      setPromptState({ active: false, field: null, masked: false, label: '' });
      setInput('');
      return;
    }

    // Normal command
    pushLine('cmd', cmd);
    setCmdHistory(prev => [{ id: Date.now(), text: cmd, ts: Date.now() }, ...prev].slice(0, 5));
    socketRef.current.send(JSON.stringify({ task: cmd, clerk_id: user?.id }));
    setInput('');
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      gap: 0,
    }}>
      {/* ── System Notification Bar ── */}
      <NotificationBar
        status={sysStatus}
        message={sysMessage}
        detail={sysDetail}
        expanded={sysExpanded}
        onToggle={() => setSysExpanded(v => !v)}
      />

      {/* ── Panels ── */}
      <div style={{
        display: 'flex',
        flex: 1,
        gap: 12,
        padding: '12px 16px 0',
        overflow: 'hidden',
        minHeight: 0,
      }}>
        {/* Left: Terminal */}
        <TerminalPanel lines={lines} />

        {/* Right: Session Scoreboard */}
        <ResultsPanel stats={sessionStats} history={cmdHistory} />
      </div>

      {/* ── Command Input ── */}
      <CommandInput
        value={input}
        onChange={setInput}
        onSubmit={handleSubmit}
        promptState={promptState}
      />

    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Notification Bar
// ─────────────────────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  ok:    { color: '#10b981', bg: 'rgba(16,185,129,0.06)',  Icon: CheckCircle2,  label: 'Spirit Summoned' },
  warn:  { color: '#f59e0b', bg: 'rgba(245,158,11,0.07)',  Icon: AlertTriangle,  label: 'Presence Fading' },
  error: { color: '#ef4444', bg: 'rgba(239,68,68,0.08)',   Icon: XCircle,        label: 'Essence Severed' },
};

function NotificationBar({ status, message, detail, expanded, onToggle }) {
  const { color, bg, Icon, label } = STATUS_CONFIG[status] || STATUS_CONFIG.ok;
  const hasDetail = !!detail;

  return (
    <div style={{
      background: bg,
      borderBottom: `1px solid ${color}22`,
      transition: 'all 0.3s ease',
      overflow: 'hidden',
      flexShrink: 0,
    }}>
      {/* Collapsed row */}
      <div
        onClick={hasDetail ? onToggle : undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '7px 16px',
          cursor: hasDetail ? 'pointer' : 'default',
          userSelect: 'none',
        }}
      >
        {/* Status dot */}
        <span style={{
          width: 7, height: 7, borderRadius: '50%',
          background: color,
          boxShadow: `0 0 6px ${color}`,
          flexShrink: 0,
          animation: status === 'ok' ? 'none' : 'pulse 1.5s ease-in-out infinite',
        }} />

        <Icon size={13} style={{ color, flexShrink: 0 }} strokeWidth={2} />

        <span style={{
          fontSize: 11,
          fontFamily: '"PPSupplyMono", "Courier New", monospace',
          color,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          fontWeight: 600,
          flexShrink: 0,
        }}>
          {label}
        </span>

        <span style={{
          fontSize: 12,
          color: 'rgba(255,255,255,0.45)',
          fontFamily: 'system-ui',
        }}>
          {message}
        </span>

        {hasDetail && (
          <span style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.25)' }}>
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </span>
        )}
      </div>

      {/* Expanded detail */}
      {hasDetail && expanded && (
        <div style={{
          padding: '8px 16px 12px 36px',
          fontFamily: '"PPSupplyMono", monospace',
          fontSize: 12,
          color: 'rgba(255,255,255,0.5)',
          lineHeight: 1.7,
          borderTop: `1px solid ${color}18`,
          whiteSpace: 'pre-wrap',
        }}>
          {detail}
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// Terminal Panel (left)
// ─────────────────────────────────────────────────────────────────────────────
function TerminalPanel({ lines }) {
  const bottomRef = useRef(null);
  const [fontSize, setFontSize] = useState(13); // Default in px

  const zoomIn = () => setFontSize(prev => Math.min(prev + 1, 24));
  const zoomOut = () => setFontSize(prev => Math.max(prev - 1, 9));

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines.length]);

  return (
    <div style={{
      flex: '1 1 65%',
      display: 'flex',
      flexDirection: 'column',
      background: '#0d0d10',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 14,
      overflow: 'hidden',
      minWidth: 0,
      minHeight: 0,
    }}>
      {/* Title bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '10px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        background: 'rgba(0,0,0,0.3)',
        flexShrink: 0,
      }}>
        {/* macOS-style traffic lights */}
        <div style={{ display: 'flex', gap: 6 }}>
          {['#ff5f57', '#febc2e', '#28c840'].map(c => (
            <div key={c} style={{ width: 11, height: 11, borderRadius: '50%', background: c, opacity: 0.85 }} />
          ))}
        </div>

        <TerminalIcon size={13} style={{ color: 'rgba(255,255,255,0.3)', marginLeft: 14 }} />
        <span style={{
          fontSize: 11,
          fontFamily: '"PPSupplyMono", monospace',
          color: 'rgba(255,255,255,0.3)',
          letterSpacing: '0.05em',
          marginLeft: 8
        }}>
          Spirit
        </span>

        {/* Zoom Controls */}
        <div style={{
          marginLeft: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          background: 'rgba(255,255,255,0.03)',
          padding: '2px 6px',
          borderRadius: 6,
          border: '1px solid rgba(255,255,255,0.05)'
        }}>
          <button
            onClick={zoomOut}
            style={{
              background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)',
              cursor: 'pointer', padding: 4, display: 'flex'
            }}
            onMouseEnter={e => e.currentTarget.style.color = '#fff'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.4)'}
          >
            <ZoomOut size={13} />
          </button>
          <div style={{ width: 1, height: 10, background: 'rgba(255,255,255,0.1)' }} />
          <button
            onClick={zoomIn}
            style={{
              background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)',
              cursor: 'pointer', padding: 4, display: 'flex'
            }}
            onMouseEnter={e => e.currentTarget.style.color = '#fff'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.4)'}
          >
            <ZoomIn size={13} />
          </button>
        </div>
      </div>

      {/* Terminal output area */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '14px 16px',
        fontFamily: '"PPSupplyMono", "Courier New", monospace',
        fontSize,
        lineHeight: 1.75,
        color: 'rgba(255,255,255,0.7)',
        scrollbarWidth: 'thin',
        scrollbarColor: 'rgba(255,255,255,0.08) transparent',
      }}>
        {/* Session header */}
        <div style={{ color: 'rgba(255,255,255,0.2)', marginBottom: 16, fontSize: 11 }}>
          ──── session started · {new Date().toLocaleString()} ────
        </div>

        {/* Empty state */}
        {lines.length === 0 && (
          <div style={{ color: 'rgba(255,255,255,0.18)', fontSize: 12 }}>
            Waiting for agent activity...
          </div>
        )}

        {/* Log lines — populated by backend */}
        {lines.map(line => (
          <TerminalLine key={line.id} line={line} fontSize={fontSize} />
        ))}

        {/* Blinking cursor */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <span style={{ color: '#f59e0b' }}>$</span>
          <span style={{
            display: 'inline-block',
            width: 8, height: fontSize + 2,
            background: 'rgba(245,158,11,0.8)',
            borderRadius: 1,
            animation: 'blink 1.1s step-end infinite',
          }} />
        </div>

        <div ref={bottomRef} />
      </div>

      <style>{`
        @keyframes blink { 0%,100% { opacity:1; } 50% { opacity:0; } }
      `}</style>
    </div>
  );
}

// colour map per line type
const LINE_COLORS = {
  info: 'rgba(255,255,255,0.6)',
  success: '#10b981',
  error: '#ef4444',
  warn: '#f59e0b',
  cmd:         '#fdba74',
  ai_response: '#fbbf24',   // amber — Spirit replies
};

function TerminalLine({ line, fontSize }) {
  const color = LINE_COLORS[line.type] || LINE_COLORS.info;
  const isAI = line.type === 'ai_response';
  const prefix = {
    info: '·',
    success: '✓',
    error: '✗',
    warn: '⚠',
    cmd: '$',
    ai_response: '←',
  }[line.type] || '·';

  return (
    <div style={{
      display: 'flex',
      gap: 10,
      color,
      fontSize,
      // AI response lines get a subtle left-border highlight
      ...(isAI && {
        background: 'rgba(99,102,241,0.06)',
        borderLeft: '2px solid rgba(129,140,248,0.4)',
        paddingLeft: 10,
        marginLeft: -10,
        borderRadius: '0 6px 6px 0',
        paddingTop: 3,
        paddingBottom: 3,
      }),
    }}>
      <span style={{ flexShrink: 0, opacity: 0.6 }}>
        {new Date(line.timestamp).toLocaleTimeString('en-US', { hour12: false })}
      </span>
      <span style={{ color, flexShrink: 0, fontWeight: isAI ? 600 : 400 }}>{prefix}</span>
      <span style={{ wordBreak: 'break-word', fontStyle: isAI ? 'italic' : 'normal' }}>
        {line.text}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Results Panel (right) — session scoreboard
// ─────────────────────────────────────────────────────────────────────────────
function Stat({ label, value, color, icon }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(255,255,255,0.03)',
      border: `1px solid ${color}22`,
      borderRadius: 12,
      padding: '16px 10px',
      gap: 6,
      flex: 1,
      minWidth: 0,
    }}>
      <span style={{ fontSize: 22, lineHeight: 1 }}>{icon}</span>
      <span style={{
        fontSize: 28,
        fontWeight: 800,
        color,
        fontVariantNumeric: 'tabular-nums',
        lineHeight: 1,
      }}>{value}</span>
      <span style={{
        fontSize: 9,
        fontFamily: '"PPSupplyMono", monospace',
        color: 'rgba(255,255,255,0.3)',
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
      }}>{label}</span>
    </div>
  );
}

function ResultsPanel({ stats = { leads: 0, drafts: 0, trends: 0, runs: 0 }, history = [] }) {
  const isEmpty = stats.leads === 0 && stats.drafts === 0 && stats.trends === 0;

  return (
    <div style={{
      flex: '1 1 35%',
      display: 'flex',
      flexDirection: 'column',
      background: '#0d0d10',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 14,
      overflow: 'hidden',
      minWidth: 0,
      minHeight: 0,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        background: 'rgba(0,0,0,0.3)',
        flexShrink: 0,
      }}>
        <BarChart2 size={13} style={{ color: 'rgba(255,255,255,0.3)' }} />
        <span style={{
          fontSize: 11,
          fontFamily: '"PPSupplyMono", monospace',
          color: 'rgba(255,255,255,0.3)',
          letterSpacing: '0.05em',
        }}>
          session results
        </span>
        {stats.runs > 0 && (
          <div style={{
            marginLeft: 'auto',
            background: 'rgba(16,185,129,0.12)',
            border: '1px solid rgba(16,185,129,0.25)',
            borderRadius: 999,
            padding: '2px 8px',
            fontSize: 10,
            fontFamily: '"PPSupplyMono", monospace',
            color: '#10b981',
          }}>
            {stats.runs} run{stats.runs !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {isEmpty ? (
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            color: 'rgba(255,255,255,0.1)',
          }}>
            <BarChart2 size={32} strokeWidth={1} />
            <span style={{ fontSize: 11, fontFamily: '"PPSupplyMono", monospace', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              No results yet
            </span>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.08)', textAlign: 'center' }}>
              Give Spirit a task to start scouting
            </span>
          </div>
        ) : (
          <>
            {/* Stats grid */}
            <div style={{ display: 'flex', gap: 8 }}>
              <Stat label="Leads" value={stats.leads} color="#818cf8" icon="👤" />
              <Stat label="Drafts" value={stats.drafts} color="#fbbf24" icon="✍️" />
              <Stat label="Trends" value={stats.trends} color="#10b981" icon="📈" />
            </div>

            {/* Command history */}
            {history.length > 0 && (
              <div>
                <div style={{ fontSize: 9, fontFamily: '"PPSupplyMono", monospace', color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
                  Commands this session
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {history.map(h => (
                    <div key={h.id} style={{
                      fontSize: 11,
                      fontFamily: '"PPSupplyMono", monospace',
                      color: 'rgba(255,255,255,0.4)',
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.04)',
                      borderRadius: 6,
                      padding: '6px 10px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      <span style={{ color: '#fdba74', marginRight: 6 }}>$</span>
                      {h.text}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const TASK_STATUS = {
  queued: { color: '#6366f1', label: 'Queued' },
  running: { color: '#f59e0b', label: 'Running' },
  done: { color: '#10b981', label: 'Done' },
  skipped: { color: 'rgba(255,255,255,0.2)', label: 'Skipped' },
};

function TaskCard({ task }) {
  const { color, label } = TASK_STATUS[task.status] || TASK_STATUS.queued;
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: `1px solid ${color}22`,
      borderLeft: `3px solid ${color}`,
      borderRadius: 10,
      padding: '10px 12px',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    }}>
      <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', lineHeight: 1.4 }}>
        {task.text}
      </span>
      <span style={{
        fontSize: 10,
        fontFamily: '"PPSupplyMono", monospace',
        color,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
      }}>
        {label}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Command Input (bottom)
// ─────────────────────────────────────────────────────────────────────────────
function CommandInput({ value, onChange, onSubmit, promptState = {} }) {
  const isPrompt = !!promptState.active;
  const accentColor = isPrompt ? '#818cf8' : '#f59e0b';

  return (
    <div style={{ margin: '12px 16px 16px', flexShrink: 0 }}>
      {/* Prompt label shown above input when backend is asking a question */}
      {isPrompt && (
        <div style={{
          fontSize: 11,
          fontFamily: '"PPSupplyMono", monospace',
          color: '#818cf8',
          marginBottom: 6,
          paddingLeft: 4,
          letterSpacing: '0.04em',
        }}>
          ← {promptState.label}
        </div>
      )}

      <form
        onSubmit={onSubmit}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: isPrompt ? 'rgba(99,102,241,0.07)' : 'rgba(255,255,255,0.04)',
          border: `1px solid ${isPrompt ? 'rgba(99,102,241,0.35)' : 'rgba(255,255,255,0.08)'}`,
          borderRadius: 12,
          padding: '4px 4px 4px 14px',
          transition: 'border-color 0.2s',
        }}
        onFocus={e => e.currentTarget.style.borderColor = isPrompt ? 'rgba(99,102,241,0.6)' : 'rgba(99,102,241,0.45)'}
        onBlur={e => e.currentTarget.style.borderColor = isPrompt ? 'rgba(99,102,241,0.35)' : 'rgba(255,255,255,0.08)'}
      >
        <span style={{
          fontSize: 14,
          fontFamily: '"PPSupplyMono", monospace',
          color: accentColor,
          flexShrink: 0,
          userSelect: 'none',
        }}>
          {isPrompt ? '?' : '>_'}
        </span>

        <input
          type={isPrompt && promptState.masked ? 'password' : 'text'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={isPrompt ? 'Type your answer and press Enter…' : 'Give the agent a task…'}
          autoFocus={isPrompt}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#fff',
            fontSize: 14,
            fontFamily: '"PPSupplyMono", "Courier New", monospace',
            letterSpacing: '0.01em',
            caretColor: accentColor,
          }}
        />

        <button
          type="submit"
          disabled={!value.trim()}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 36,
            height: 36,
            borderRadius: 9,
            border: 'none',
            background: value.trim()
              ? isPrompt
                ? 'linear-gradient(135deg, #6366f1, #4f46e5)'
                : 'linear-gradient(135deg, #f59e0b, #d97706)'
              : 'rgba(255,255,255,0.05)',
            color: value.trim() ? '#fff' : 'rgba(255,255,255,0.2)',
            cursor: value.trim() ? 'pointer' : 'not-allowed',
            transition: 'all 0.2s',
            flexShrink: 0,
            boxShadow: value.trim()
              ? isPrompt ? '0 0 16px rgba(99,102,241,0.4)' : '0 0 16px rgba(245,158,11,0.35)'
              : 'none',
          }}
        >
          <Send size={15} />
        </button>
      </form>
    </div>
  );
}
