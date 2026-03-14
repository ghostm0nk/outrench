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
  ListTodo
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

  // Terminal lines — will be populated by backend WebSocket / polling.
  // Shape: [{ id, timestamp, type: 'info'|'success'|'error'|'warn'|'cmd'|'ai_response', text }]
  // For now the user's own commands echo locally as 'cmd' lines.
  const [lines, setLines] = useState([]);

  const pushLine = useCallback((type, text) => {
    setLines(prev => [
      ...prev,
      { id: Date.now() + Math.random(), timestamp: Date.now(), type, text },
    ]);
  }, []);

  // System notification state
  // status: 'ok' | 'warn' | 'error'
  const [sysStatus, setSysStatus] = useState('warn');
  const [sysMessage, setSysMessage] = useState('Summoning Spirit...');
  const [sysExpanded, setSysExpanded] = useState(false);
  const [sysDetail, setSysDetail] = useState('');

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
          pushLine('info', 'Spirit connection established.');
        };

        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type && data.text) pushLine(data.type, data.text);
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

    // Echo the command into the terminal immediately
    pushLine('cmd', cmd);

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        task: cmd,
        clerk_id: user?.id
      }));
    } else {
      pushLine('error', 'Agent disconnected. Cannot send command.');
    }

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

        {/* Right: Task Panel */}
        <TaskPanel />
      </div>

      {/* ── Command Input ── */}
      <CommandInput
        value={input}
        onChange={setInput}
        onSubmit={handleSubmit}
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
// Task Panel (right)
// ─────────────────────────────────────────────────────────────────────────────
function TaskPanel() {
  // tasks will come from backend
  // shape: [{ id, text, status: 'queued'|'running'|'done'|'skipped' }]
  const tasks = [];

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
        <ListTodo size={13} style={{ color: 'rgba(255,255,255,0.3)' }} />
        <span style={{
          fontSize: 11,
          fontFamily: '"PPSupplyMono", monospace',
          color: 'rgba(255,255,255,0.3)',
          letterSpacing: '0.05em',
        }}>
          task queue
        </span>

        {/* Task count badge — will show real count when wired */}
        <div style={{
          marginLeft: 'auto',
          background: 'rgba(99,102,241,0.15)',
          border: '1px solid rgba(99,102,241,0.25)',
          borderRadius: 999,
          padding: '2px 8px',
          fontSize: 10,
          fontFamily: '"PPSupplyMono", monospace',
          color: '#818cf8',
        }}>
          {tasks.length}
        </div>
      </div>

      {/* Task list */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        scrollbarWidth: 'thin',
        scrollbarColor: 'rgba(255,255,255,0.06) transparent',
      }}>
        {tasks.length === 0 ? (
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            color: 'rgba(255,255,255,0.12)',
          }}>
            <ListTodo size={32} strokeWidth={1} />
            <span style={{
              fontSize: 11,
              fontFamily: '"PPSupplyMono", monospace',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}>
              No tasks queued
            </span>
          </div>
        ) : (
          tasks.map(task => <TaskCard key={task.id} task={task} />)
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
function CommandInput({ value, onChange, onSubmit }) {
  return (
    <form
      onSubmit={onSubmit}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        margin: '12px 16px 16px',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12,
        padding: '4px 4px 4px 14px',
        transition: 'border-color 0.2s',
        flexShrink: 0,
      }}
      onFocus={e => e.currentTarget.style.borderColor = 'rgba(99,102,241,0.45)'}
      onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'}
    >
      {/* Prompt symbol */}
      <span style={{
        fontSize: 14,
        fontFamily: '"PPSupplyMono", monospace',
        color: '#f59e0b',
        flexShrink: 0,
        userSelect: 'none',
      }}>
        &gt;_
      </span>

      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Give the agent a task…"
        style={{
          flex: 1,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          color: '#fff',
          fontSize: 14,
          fontFamily: '"PPSupplyMono", "Courier New", monospace',
          letterSpacing: '0.01em',
          caretColor: '#f59e0b',
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
            ? 'linear-gradient(135deg, #f59e0b, #d97706)'
            : 'rgba(255,255,255,0.05)',
          color: value.trim() ? '#fff' : 'rgba(255,255,255,0.2)',
          cursor: value.trim() ? 'pointer' : 'not-allowed',
          transition: 'all 0.2s',
          flexShrink: 0,
          boxShadow: value.trim() ? '0 0 16px rgba(245,158,11,0.35)' : 'none',
        }}
      >
        <Send size={15} />
      </button>
    </form>
  );
}
