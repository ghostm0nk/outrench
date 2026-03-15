import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useUser } from '@clerk/clerk-react';
import { Send, Loader2 } from 'lucide-react';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// ── Onboarding questions ──────────────────────────────────────────────────────
const STEPS = [
  {
    field: 'name',
    question: "Let's get you set up. What's your startup called?",
    hint: 'e.g. Acme Inc.',
  },
  {
    field: 'one_liner',
    question: "Give me a one-liner — what does it do?",
    hint: 'e.g. AI-powered invoicing for freelancers',
  },
  {
    field: 'target_audience',
    question: "Who are you trying to reach? Be specific.",
    hint: 'e.g. Indie hackers, B2B SaaS founders, early-stage CTOs',
  },
  {
    field: 'problem_solved',
    question: "What pain are you solving for them?",
    hint: 'e.g. Chasing unpaid invoices wastes 5+ hours a week',
  },
  {
    field: 'unique_value',
    question: "What makes you different from existing solutions?",
    hint: 'e.g. Automated follow-ups with a human tone, not generic templates',
  },
  {
    field: 'tone',
    question: "How should I sound when posting or commenting in your voice?",
    hint: 'e.g. Direct and witty, like a smart founder — no corporate fluff',
  },
  {
    field: 'account_types',
    question: "Which X accounts do you want me to operate?\n\nType: personal, product, or both",
    hint: 'personal / product / both',
    options: ['personal', 'product', 'both'],
  },
  {
    field: 'mode',
    question: "What should I focus on first?\n\nType: growth (likes/follows), content (posting), or both",
    hint: 'growth / content / both',
    options: ['growth', 'content', 'both'],
  },
];

// ── Component ─────────────────────────────────────────────────────────────────
export default function Onboarding({ onComplete }) {
  const { user } = useUser();
  const [lines, setLines] = useState([]);
  const [input, setInput] = useState('');
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  const pushLine = useCallback((type, text) => {
    setLines(prev => [...prev, { id: Date.now() + Math.random(), type, text }]);
  }, []);

  // Greet + first question on mount
  useEffect(() => {
    const delay = (ms) => new Promise(r => setTimeout(r, ms));
    (async () => {
      await delay(400);
      pushLine('ai', "I'm Spirit — your autonomous growth operator.");
      await delay(700);
      pushLine('ai', "Before I start working for you, I need to know who I'm working for.");
      await delay(600);
      pushLine('ai', STEPS[0].question);
    })();
  }, [pushLine]);

  // Scroll to bottom on new lines
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines.length]);

  // Focus input after each question
  useEffect(() => {
    if (!done) inputRef.current?.focus();
  }, [step, done]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const val = input.trim();
    if (!val || saving) return;

    const current = STEPS[step];

    // Validate option-constrained steps
    if (current.options) {
      const valid = current.options.includes(val.toLowerCase());
      if (!valid) {
        pushLine('warn', `Please type one of: ${current.options.join(', ')}`);
        setInput('');
        return;
      }
    }

    pushLine('user', val);
    setInput('');

    const newAnswers = { ...answers, [current.field]: val };
    setAnswers(newAnswers);

    const nextStep = step + 1;

    if (nextStep < STEPS.length) {
      // Small delay so it feels conversational
      setTimeout(() => {
        pushLine('ai', STEPS[nextStep].question);
        setStep(nextStep);
      }, 350);
    } else {
      // All questions answered
      setStep(nextStep);
      setTimeout(async () => {
        pushLine('ai', "Got it. Setting up your profile...");
        setSaving(true);
        try {
          await axios.post(`${API}/api/onboarding`, {
            clerk_id: user.id,
            name: newAnswers.name,
            one_liner: newAnswers.one_liner,
            target_audience: newAnswers.target_audience,
            problem_solved: newAnswers.problem_solved,
            unique_value: newAnswers.unique_value,
            tone: newAnswers.tone,
            account_types: newAnswers.account_types,
            mode: newAnswers.mode,
          });
          pushLine('success', `Profile saved. Spirit is ready to work for ${newAnswers.name}.`);
          setDone(true);
        } catch (err) {
          const msg = err.response?.data?.detail || 'Failed to save profile. Try again.';
          pushLine('error', msg);
          setError(msg);
          setSaving(false);
          // Rewind to let them retry
          setStep(STEPS.length - 1);
        }
      }, 400);
    }
  };

  const currentStep = STEPS[step];
  const placeholder = done
    ? ''
    : saving
    ? 'Saving...'
    : currentStep?.hint || 'Type your answer...';

  return (
    <div style={{
      height: '100vh',
      background: '#0f0c08',
      backgroundImage: `
        radial-gradient(circle at 20% 20%, rgba(99,102,241,0.08) 0%, transparent 55%),
        radial-gradient(circle at 80% 80%, rgba(139,92,246,0.06) 0%, transparent 55%)
      `,
      display: 'flex',
      flexDirection: 'column',
      color: '#fff',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>

      {/* Header */}
      <div style={{
        padding: '20px 24px 12px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexShrink: 0,
      }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: '#818cf8',
          boxShadow: '0 0 8px #818cf8',
          animation: 'pulse 2s ease-in-out infinite',
        }} />
        <span style={{
          fontSize: 11,
          fontFamily: '"PPSupplyMono", monospace',
          color: 'rgba(255,255,255,0.4)',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
        }}>
          Spirit Onboarding
        </span>
        <span style={{
          marginLeft: 'auto',
          fontSize: 11,
          fontFamily: '"PPSupplyMono", monospace',
          color: 'rgba(255,255,255,0.2)',
        }}>
          {Math.min(step, STEPS.length)}/{STEPS.length}
        </span>
      </div>

      {/* Progress bar */}
      <div style={{ height: 2, background: 'rgba(255,255,255,0.04)', flexShrink: 0 }}>
        <div style={{
          height: '100%',
          width: `${(Math.min(step, STEPS.length) / STEPS.length) * 100}%`,
          background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
          transition: 'width 0.4s ease',
        }} />
      </div>

      {/* Chat area */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '24px 24px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        scrollbarWidth: 'thin',
        scrollbarColor: 'rgba(255,255,255,0.06) transparent',
      }}>
        {lines.map(line => (
          <ChatLine key={line.id} line={line} />
        ))}

        {/* Done state — launch button */}
        {done && (
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center' }}>
            <button
              onClick={onComplete}
              style={{
                padding: '13px 36px',
                borderRadius: 50,
                border: 'none',
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                color: '#fff',
                fontWeight: 700,
                fontSize: 15,
                cursor: 'pointer',
                boxShadow: '0 0 40px rgba(99,102,241,0.4)',
                transition: 'transform 0.2s, box-shadow 0.2s',
              }}
              onMouseOver={e => { e.currentTarget.style.transform = 'scale(1.04)'; e.currentTarget.style.boxShadow = '0 0 60px rgba(99,102,241,0.6)'; }}
              onMouseOut={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 0 40px rgba(99,102,241,0.4)'; }}
            >
              Enter Station →
            </button>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      {!done && (
        <form
          onSubmit={handleSubmit}
          style={{
            margin: '0 16px 24px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12,
            padding: '4px 4px 4px 14px',
            flexShrink: 0,
          }}
        >
          <span style={{
            fontSize: 14,
            fontFamily: '"PPSupplyMono", monospace',
            color: '#818cf8',
            flexShrink: 0,
            userSelect: 'none',
          }}>
            &gt;_
          </span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={placeholder}
            disabled={saving}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#fff',
              fontSize: 14,
              fontFamily: '"PPSupplyMono", "Courier New", monospace',
              caretColor: '#818cf8',
            }}
          />
          <button
            type="submit"
            disabled={!input.trim() || saving}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 36,
              height: 36,
              borderRadius: 9,
              border: 'none',
              background: input.trim() && !saving
                ? 'linear-gradient(135deg, #6366f1, #4f46e5)'
                : 'rgba(255,255,255,0.05)',
              color: input.trim() && !saving ? '#fff' : 'rgba(255,255,255,0.2)',
              cursor: input.trim() && !saving ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s',
              flexShrink: 0,
              boxShadow: input.trim() && !saving ? '0 0 16px rgba(99,102,241,0.4)' : 'none',
            }}
          >
            {saving ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={15} />}
          </button>
        </form>
      )}

      <style>{`
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
        @keyframes spin  { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity:0; transform: translateY(6px); } to { opacity:1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}

// ── Chat line ─────────────────────────────────────────────────────────────────
function ChatLine({ line }) {
  const isUser = line.type === 'user';

  const colors = {
    ai:      { text: 'rgba(255,255,255,0.85)', prefix: '←', bg: 'rgba(99,102,241,0.07)', border: 'rgba(129,140,248,0.2)' },
    user:    { text: '#fff',                    prefix: '$', bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.08)' },
    success: { text: '#10b981',                 prefix: '✓', bg: 'rgba(16,185,129,0.06)', border: 'rgba(16,185,129,0.15)' },
    error:   { text: '#ef4444',                 prefix: '✗', bg: 'rgba(239,68,68,0.06)',  border: 'rgba(239,68,68,0.15)' },
    warn:    { text: '#f59e0b',                 prefix: '⚠', bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.15)' },
  };

  const style = colors[line.type] || colors.ai;

  return (
    <div style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      animation: 'fadeIn 0.25s ease-out',
    }}>
      <div style={{
        maxWidth: '72%',
        background: style.bg,
        border: `1px solid ${style.border}`,
        borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
        padding: '10px 14px',
        display: 'flex',
        gap: 8,
        alignItems: 'flex-start',
      }}>
        <span style={{
          fontSize: 12,
          color: style.text,
          opacity: 0.5,
          flexShrink: 0,
          fontFamily: '"PPSupplyMono", monospace',
          marginTop: 1,
        }}>
          {style.prefix}
        </span>
        <span style={{
          fontSize: 14,
          color: style.text,
          lineHeight: 1.6,
          fontFamily: isUser ? '"PPSupplyMono", monospace' : 'system-ui, sans-serif',
          whiteSpace: 'pre-line',
        }}>
          {line.text}
        </span>
      </div>
    </div>
  );
}
