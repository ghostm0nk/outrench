import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useUser } from '@clerk/clerk-react';
import { Send, Loader2, Plus, X as XIcon } from 'lucide-react';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const PLATFORMS = [
  { id: 'twitter',   label: 'Twitter / X' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'linkedin',  label: 'LinkedIn' },
];

// ── Main Component ─────────────────────────────────────────────────────────────
export default function Onboarding({ onComplete }) {
  const { user } = useUser();
  const [lines, setLines]       = useState([]);
  const [phase, setPhase]       = useState('account_type');
  const [data, setData]         = useState({
    account_type: '', platform: '', handle: '',
    followed_accounts: [], bio: '', post_link: '',
  });
  const [analysis, setAnalysis] = useState(null);
  const [input, setInput]       = useState('');
  const [followInput, setFollowInput] = useState('');
  const [saving, setSaving]     = useState(false);
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  const pushLine = useCallback((type, text) => {
    setLines(prev => [...prev, { id: Date.now() + Math.random(), type, text }]);
  }, []);

  // Scroll to bottom on new lines
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines.length]);

  // Focus text input when phase needs it
  useEffect(() => {
    if (['handle', 'bio', 'post'].includes(phase)) {
      setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [phase]);

  // Greeting
  useEffect(() => {
    const delay = ms => new Promise(r => setTimeout(r, ms));
    (async () => {
      await delay(400);
      pushLine('ai', "I'm Spirit — your autonomous growth operator.");
      await delay(700);
      pushLine('ai', "Before I start working, I need to understand who I'm working for.");
      await delay(600);
      pushLine('ai', "Are you growing a personal brand or a product account?");
    })();
  }, [pushLine]);

  // ── Phase handlers ─────────────────────────────────────────────────────────

  const selectAccountType = (type) => {
    pushLine('user', type === 'personal' ? 'Personal brand' : 'Product account');
    setData(d => ({ ...d, account_type: type }));
    setTimeout(() => {
      pushLine('ai', "Which platform are you focusing on?");
      setPhase('platform');
    }, 350);
  };

  const selectPlatform = (platformId) => {
    const label = PLATFORMS.find(p => p.id === platformId)?.label || platformId;
    pushLine('user', label);
    setData(d => ({ ...d, platform: platformId }));
    setTimeout(() => {
      pushLine('ai', `What's your handle on ${label}?`);
      setPhase('handle');
    }, 350);
  };

  const submitHandle = (e) => {
    e.preventDefault();
    const val = input.trim().replace(/^@/, '');
    if (!val) return;
    pushLine('user', `@${val}`);
    setData(d => ({ ...d, handle: val }));
    setInput('');
    setTimeout(() => {
      pushLine('ai', "Add up to 5 accounts you follow or admire. These help me understand your space.");
      setPhase('following');
    }, 350);
  };

  const addFollowed = (e) => {
    e.preventDefault();
    const val = followInput.trim().replace(/^@/, '');
    if (!val || data.followed_accounts.length >= 5) return;
    setData(d => ({ ...d, followed_accounts: [...d.followed_accounts, val] }));
    setFollowInput('');
  };

  const removeFollowed = (idx) => {
    setData(d => ({ ...d, followed_accounts: d.followed_accounts.filter((_, i) => i !== idx) }));
  };

  const continueFromFollowing = () => {
    if (data.followed_accounts.length === 0) {
      pushLine('warn', "Add at least one account to continue.");
      return;
    }
    pushLine('user', data.followed_accounts.map(a => `@${a}`).join(', '));
    setTimeout(() => {
      pushLine('ai', "Paste your bio exactly as it appears on your profile.");
      setPhase('bio');
    }, 350);
  };

  const submitBio = (e) => {
    e.preventDefault();
    const val = input.trim();
    if (!val) return;
    pushLine('user', val.length > 100 ? val.slice(0, 100) + '...' : val);
    setData(d => ({ ...d, bio: val }));
    setInput('');
    setTimeout(() => {
      pushLine('ai', "Drop a link to a recent post. Skip if you haven't posted yet.");
      setPhase('post');
    }, 350);
  };

  const submitPost = async (skip = false) => {
    const val = skip ? '' : input.trim();
    pushLine('user', skip ? '(skip)' : val || '(skip)');
    const finalData = { ...data, post_link: val };
    setData(finalData);
    setInput('');
    setTimeout(async () => {
      pushLine('ai', "Analyzing your profile...");
      setPhase('analyzing');
      try {
        const res = await axios.post(`${API}/api/onboarding/analyze`, {
          clerk_id: user.id,
          platform: finalData.platform,
          handle: finalData.handle,
          account_type: finalData.account_type,
          followed_accounts: finalData.followed_accounts,
          bio: finalData.bio,
          post_link: finalData.post_link,
        });
        setAnalysis(res.data.analysis);
        pushLine('ai', `Here's what I understood:\n\n${res.data.analysis.summary}`);
        setPhase('summary');
      } catch (err) {
        pushLine('error', "Analysis failed. Let's try again.");
        setPhase('bio');
      }
    }, 350);
  };

  const confirm = async () => {
    setSaving(true);
    pushLine('ai', "Saving your profile...");
    try {
      await axios.post(`${API}/api/onboarding`, {
        clerk_id: user.id,
        name: data.handle,
        one_liner: analysis?.space || '',
        target_audience: analysis?.target_audience || '',
        problem_solved: analysis?.problem_solved || '',
        unique_value: '',
        tone: analysis?.tone || 'direct and genuine',
        account_types: data.account_type,
        mode: 'growth',
        platform: data.platform,
        handle: data.handle,
        followed_accounts: JSON.stringify(data.followed_accounts),
        bio: data.bio,
        post_link: data.post_link,
      });
      pushLine('success', "You're set. Spirit is ready to work.");
      setPhase('done');
    } catch (err) {
      pushLine('error', err.response?.data?.detail || 'Save failed. Try again.');
      setSaving(false);
    }
  };

  // ── Input area by phase ────────────────────────────────────────────────────
  const renderInput = () => {
    if (phase === 'account_type') return (
      <ChoiceRow>
        <ChoiceBtn onClick={() => selectAccountType('personal')}>Personal Brand</ChoiceBtn>
        <ChoiceBtn onClick={() => selectAccountType('product')}>Product Account</ChoiceBtn>
      </ChoiceRow>
    );

    if (phase === 'platform') return (
      <ChoiceRow>
        {PLATFORMS.map(p => (
          <ChoiceBtn key={p.id} onClick={() => selectPlatform(p.id)}>{p.label}</ChoiceBtn>
        ))}
      </ChoiceRow>
    );

    if (phase === 'handle') return (
      <form onSubmit={submitHandle} style={{ display: 'flex', gap: 8 }}>
        <TerminalInput ref={inputRef} value={input} onChange={e => setInput(e.target.value)} placeholder="yourhandle" prefix="@" />
        <SendBtn disabled={!input.trim()} />
      </form>
    );

    if (phase === 'following') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {data.followed_accounts.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {data.followed_accounts.map((a, i) => (
              <span key={i} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)',
                borderRadius: 8, padding: '4px 10px',
                fontSize: 13, color: '#818cf8',
                fontFamily: '"PPSupplyMono", monospace',
              }}>
                @{a}
                <button onClick={() => removeFollowed(i)} style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'rgba(255,255,255,0.3)', display: 'flex', padding: 0, lineHeight: 1,
                }}>
                  <XIcon size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
        {data.followed_accounts.length < 5 && (
          <form onSubmit={addFollowed} style={{ display: 'flex', gap: 8 }}>
            <TerminalInput
              value={followInput}
              onChange={e => setFollowInput(e.target.value)}
              placeholder="handle"
              prefix="@"
              autoFocus
            />
            <IconBtn type="submit" disabled={!followInput.trim()}>
              <Plus size={15} />
            </IconBtn>
          </form>
        )}
        {data.followed_accounts.length >= 1 && (
          <button onClick={continueFromFollowing} style={continueBtnStyle}>
            Continue →
          </button>
        )}
      </div>
    );

    if (phase === 'bio') return (
      <form onSubmit={submitBio} style={{ display: 'flex', gap: 8 }}>
        <TerminalInput ref={inputRef} value={input} onChange={e => setInput(e.target.value)} placeholder="Paste your bio here..." />
        <SendBtn disabled={!input.trim()} />
      </form>
    );

    if (phase === 'post') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <form onSubmit={e => { e.preventDefault(); submitPost(false); }} style={{ display: 'flex', gap: 8 }}>
          <TerminalInput ref={inputRef} value={input} onChange={e => setInput(e.target.value)} placeholder="https://..." />
          <SendBtn disabled={!input.trim()} />
        </form>
        <button onClick={() => submitPost(true)} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'rgba(255,255,255,0.25)', fontSize: 12,
          fontFamily: '"PPSupplyMono", monospace', textAlign: 'left', padding: 0,
        }}>
          skip →
        </button>
      </div>
    );

    if (phase === 'analyzing') return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(255,255,255,0.25)', fontSize: 13, fontFamily: '"PPSupplyMono", monospace' }}>
        <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
        analyzing...
      </div>
    );

    if (phase === 'summary') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {analysis && (
          <div style={{
            background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.18)',
            borderRadius: 12, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            {[
              { label: 'Audience', val: analysis.target_audience },
              { label: 'Tone',     val: analysis.tone },
              { label: 'Space',    val: analysis.space },
            ].filter(r => r.val).map(({ label, val }) => (
              <div key={label} style={{ display: 'flex', gap: 12, fontSize: 13 }}>
                <span style={{ color: 'rgba(255,255,255,0.3)', fontFamily: '"PPSupplyMono", monospace', width: 56, flexShrink: 0 }}>{label}</span>
                <span style={{ color: 'rgba(255,255,255,0.75)' }}>{val}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={confirm} disabled={saving} style={{
            flex: 1, padding: '11px 0', borderRadius: 10, border: 'none',
            background: saving ? 'rgba(99,102,241,0.3)' : 'linear-gradient(135deg, #6366f1, #4f46e5)',
            color: '#fff', fontWeight: 600, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            transition: 'opacity 0.2s',
          }}>
            {saving && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
            Looks right — let's go
          </button>
          <button onClick={() => { setPhase('bio'); setInput(''); pushLine('ai', "Ok, paste your bio again."); }} style={{
            padding: '11px 16px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)',
            background: 'transparent', color: 'rgba(255,255,255,0.4)', fontSize: 14, cursor: 'pointer',
          }}>
            Adjust
          </button>
        </div>
      </div>
    );

    if (phase === 'done') return (
      <button onClick={onComplete} style={{
        padding: '12px 36px', borderRadius: 50, border: 'none',
        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
        color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer',
        boxShadow: '0 0 40px rgba(99,102,241,0.4)',
      }}>
        Enter Station →
      </button>
    );

    return null;
  };

  return (
    <div style={{
      height: '100vh',
      background: '#0f0c08',
      backgroundImage: `
        radial-gradient(circle at 20% 20%, rgba(99,102,241,0.08) 0%, transparent 55%),
        radial-gradient(circle at 80% 80%, rgba(139,92,246,0.06) 0%, transparent 55%)
      `,
      display: 'flex', flexDirection: 'column',
      color: '#fff',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>

      {/* Header */}
      <div style={{
        padding: '20px 24px 12px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
      }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: '#818cf8', boxShadow: '0 0 8px #818cf8',
          animation: 'pulse 2s ease-in-out infinite',
        }} />
        <span style={{
          fontSize: 11, fontFamily: '"PPSupplyMono", monospace',
          color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em',
        }}>
          Spirit · Setup
        </span>
      </div>

      {/* Chat area */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '24px 24px 12px',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.06) transparent',
      }}>
        <div style={{ width: '100%', maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {lines.map(line => <ChatLine key={line.id} line={line} />)}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input area */}
      <div style={{
        margin: '0 auto 28px', width: '100%', maxWidth: 520,
        padding: '0 16px', boxSizing: 'border-box', flexShrink: 0,
      }}>
        {renderInput()}
      </div>

      <style>{`
        @keyframes pulse  { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
        @keyframes spin   { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
        @keyframes fadeIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
      `}</style>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ChatLine({ line }) {
  const isUser = line.type === 'user';
  const styles = {
    ai:      { text: 'rgba(255,255,255,0.85)', prefix: '←', bg: 'rgba(99,102,241,0.07)',  border: 'rgba(129,140,248,0.2)' },
    user:    { text: '#fff',                   prefix: '$', bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.08)' },
    success: { text: '#10b981',                prefix: '✓', bg: 'rgba(16,185,129,0.06)',  border: 'rgba(16,185,129,0.15)' },
    error:   { text: '#ef4444',                prefix: '✗', bg: 'rgba(239,68,68,0.06)',   border: 'rgba(239,68,68,0.15)' },
    warn:    { text: '#f59e0b',                prefix: '⚠', bg: 'rgba(245,158,11,0.06)',  border: 'rgba(245,158,11,0.15)' },
  };
  const s = styles[line.type] || styles.ai;
  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', animation: 'fadeIn 0.25s ease-out' }}>
      <div style={{
        maxWidth: '85%', background: s.bg, border: `1px solid ${s.border}`,
        borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
        padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'flex-start',
      }}>
        <span style={{ fontSize: 12, color: s.text, opacity: 0.5, flexShrink: 0, fontFamily: '"PPSupplyMono", monospace', marginTop: 1 }}>
          {s.prefix}
        </span>
        <span style={{ fontSize: 14, color: s.text, lineHeight: 1.6, fontFamily: isUser ? '"PPSupplyMono", monospace' : 'system-ui, sans-serif', whiteSpace: 'pre-line' }}>
          {line.text}
        </span>
      </div>
    </div>
  );
}

function ChoiceRow({ children }) {
  return <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{children}</div>;
}

function ChoiceBtn({ onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: '10px 20px', borderRadius: 10,
      border: '1px solid rgba(99,102,241,0.3)',
      background: 'rgba(99,102,241,0.1)',
      color: '#a5b4fc', fontSize: 14, fontWeight: 500,
      cursor: 'pointer', transition: 'all 0.15s',
    }}
    onMouseOver={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.22)'; e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)'; }}
    onMouseOut={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.1)'; e.currentTarget.style.borderColor = 'rgba(99,102,241,0.3)'; }}
    >
      {children}
    </button>
  );
}

const TerminalInput = React.forwardRef(function TerminalInput({ value, onChange, placeholder, prefix, autoFocus }, ref) {
  return (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', gap: 8,
      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 10, padding: '4px 4px 4px 12px',
    }}>
      {prefix && <span style={{ fontSize: 13, color: '#818cf8', fontFamily: '"PPSupplyMono", monospace', flexShrink: 0 }}>{prefix}</span>}
      <input
        ref={ref}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoFocus={autoFocus}
        style={{
          flex: 1, background: 'transparent', border: 'none', outline: 'none',
          color: '#fff', fontSize: 14, fontFamily: '"PPSupplyMono", "Courier New", monospace',
          caretColor: '#818cf8', padding: '8px 0',
        }}
      />
    </div>
  );
});

function SendBtn({ disabled }) {
  return (
    <button type="submit" disabled={disabled} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      width: 38, height: 38, borderRadius: 10, border: 'none', flexShrink: 0,
      background: disabled ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, #6366f1, #4f46e5)',
      color: disabled ? 'rgba(255,255,255,0.2)' : '#fff',
      cursor: disabled ? 'not-allowed' : 'pointer',
      boxShadow: disabled ? 'none' : '0 0 14px rgba(99,102,241,0.4)',
      transition: 'all 0.2s', alignSelf: 'center',
    }}>
      <Send size={14} />
    </button>
  );
}

function IconBtn({ type, disabled, onClick, children }) {
  return (
    <button type={type} disabled={disabled} onClick={onClick} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      width: 38, height: 38, borderRadius: 10, border: 'none', flexShrink: 0,
      background: disabled ? 'rgba(255,255,255,0.05)' : 'rgba(99,102,241,0.2)',
      color: disabled ? 'rgba(255,255,255,0.2)' : '#818cf8',
      cursor: disabled ? 'not-allowed' : 'pointer', transition: 'all 0.2s', alignSelf: 'center',
    }}>
      {children}
    </button>
  );
}

const continueBtnStyle = {
  padding: '9px 20px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)',
  background: 'transparent', color: 'rgba(255,255,255,0.5)', fontSize: 13,
  fontFamily: '"PPSupplyMono", monospace', cursor: 'pointer', textAlign: 'left',
  transition: 'color 0.2s',
};
