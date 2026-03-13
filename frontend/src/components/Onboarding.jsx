import React, { useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { Rocket, Globe, Users, Lightbulb, MessageCircle, ArrowRight, ArrowLeft, Loader2, Zap, ShieldAlert } from 'lucide-react';
import axios from 'axios';
import outrenchLogo from '../assets/outrench.png';

// ── Profanity & Content Safeguards ────────────────────────────────────────────
const PROFANITY_LIST = [
  'fuck','shit','ass','bitch','damn','dick','cock','cunt','bastard','slut',
  'whore','fag','nigger','nigga','retard','piss','wank','twat','bollocks',
  'motherfuck','bullshit','asshole','dumbass','jackass','goddamn','shitty',
  'fucking','fucker','bitches','dicks','asses','cunts','sluts','faggot',
  'rape','rapist','kill','murder','suicide','porn','xxx','naked','nude',
  'hentai','onlyfans','escort','prostitut','trafficking','molest',
  'pedophil','childporn','cocaine','heroin','meth','fentanyl','weed',
  'marijuana','cannabis','drug deal','narcotics',
];

const BANNED_KEYWORDS = [
  'gambling','casino','betting','poker','slot machine',
  'adult','pornography','escort service','sex work','onlyfans',
  'weapon','firearm','gun shop','ammunition','explosive',
  'drug','narcotic','dispensary','psychedelic',
  'pyramid scheme','mlm','multi-level','ponzi',
  'hate group','supremacist','extremis','terroris',
  'counterfeit','fraud','scam','phishing','money launder',
  'dark web','darknet','black market',
  'tobacco','vape','e-cigarette','nicotine',
  'crypto pump','rug pull',
];

function containsProfanity(text) {
  if (!text) return false;
  const lower = text.toLowerCase().replace(/[^a-z\s]/g, '');
  const words = lower.split(/\s+/);
  return PROFANITY_LIST.some(p => 
    words.some(w => w === p || w.includes(p))
  );
}

function containsBannedContent(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  return BANNED_KEYWORDS.find(k => lower.includes(k)) || null;
}

function validateField(key, value) {
  if (!value || typeof value !== 'string') return null;
  
  // Profanity check on all text fields
  if (containsProfanity(value)) {
    return 'Please keep it professional. Inappropriate language detected.';
  }

  // Banned content check (industry restrictions)
  const banned = containsBannedContent(value);
  if (banned) {
    return `Outrench cannot be used for "${banned}"-related businesses. We support legitimate startups only.`;
  }

  // Field-specific validation
  if (key === 'name' && value.trim().length < 2) {
    return 'Startup name must be at least 2 characters.';
  }

  if (key === 'website_url' && value.trim()) {
    const urlPattern = /^https?:\/\/.+\..+/;
    if (!urlPattern.test(value.trim())) {
      return 'Please enter a valid URL starting with https://';
    }
  }

  if (key === 'one_liner' && value.trim().length < 10) {
    return 'Give us a bit more detail — at least 10 characters.';
  }

  if (key === 'target_audience' && value.trim().length < 10) {
    return 'Be more specific about your audience — at least 10 characters.';
  }

  return null; // All good
}

// ── Step Definitions ──────────────────────────────────────────────────────────
const STEPS = [
  {
    key: 'name',
    label: 'What is your startup called?',
    subtitle: 'The Ghost needs to know who it\'s fighting for.',
    placeholder: 'e.g. Acme AI',
    icon: Rocket,
    type: 'text',
  },
  {
    key: 'one_liner',
    label: 'Describe it in one line.',
    subtitle: 'The elevator pitch. Keep it razor-sharp.',
    placeholder: 'e.g. AI-powered website builder for non-technical founders',
    icon: Zap,
    type: 'text',
  },
  {
    key: 'website_url',
    label: 'Got a website?',
    subtitle: 'Drop the URL. The Ghost will study it.',
    placeholder: 'e.g. https://acme.ai',
    icon: Globe,
    type: 'url',
  },
  {
    key: 'category',
    label: 'What category does it fall under?',
    subtitle: 'This helps the Ghost know which hunting grounds to patrol.',
    placeholder: '',
    icon: Lightbulb,
    type: 'select',
    options: ['SaaS', 'E-Commerce', 'Fintech', 'Health & Wellness', 'Education', 'Developer Tools', 'Marketing', 'AI / ML', 'Social / Community', 'Other'],
  },
  {
    key: 'target_audience',
    label: 'Who is this for?',
    subtitle: 'Be specific. The Ghost needs a target.',
    placeholder: 'e.g. Solo founders who can\'t code but need a landing page fast',
    icon: Users,
    type: 'textarea',
  },
  {
    key: 'problem_solved',
    label: 'What pain does it kill?',
    subtitle: 'What problem keeps your users up at night?',
    placeholder: 'e.g. Founders spend weeks building websites instead of selling their product',
    icon: Lightbulb,
    type: 'textarea',
  },
  {
    key: 'unique_value',
    label: 'Why you and not the competition?',
    subtitle: 'Your one unfair advantage.',
    placeholder: 'e.g. Ship a full website in 60 seconds with AI — no templates, no drag-and-drop',
    icon: Rocket,
    type: 'textarea',
  },
  {
    key: 'tone',
    label: 'How should the Ghost talk?',
    subtitle: 'Pick the voice for your outreach messages.',
    placeholder: '',
    icon: MessageCircle,
    type: 'select',
    options: ['Casual & Friendly', 'Professional', 'Bold & Provocative', 'Empathetic & Helpful', 'Witty & Playful'],
  },
];

// ── Onboarding Component ──────────────────────────────────────────────────────
export default function Onboarding({ onComplete }) {
  const { user } = useUser();
  const [step, setStep] = useState(0);
  const [formData, setFormData] = useState({
    name: '',
    one_liner: '',
    website_url: '',
    category: '',
    target_audience: '',
    problem_solved: '',
    unique_value: '',
    tone: 'Casual & Friendly',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const isFirst = step === 0;
  const value = formData[current.key];

  const canProceed = current.type === 'select' 
    ? !!value 
    : (current.key === 'website_url' ? true : value.trim().length > 0); // website_url is optional-ish

  const updateField = (val) => {
    setFormData(prev => ({ ...prev, [current.key]: val }));
    setError('');

    // Real-time warning (not blocking, just flagging)
    if (typeof val === 'string' && val.length > 2) {
      if (containsProfanity(val)) {
        setWarning('⚠️ Inappropriate language detected. This will be rejected.');
      } else if (containsBannedContent(val)) {
        setWarning('⚠️ This type of business is not supported by Outrench.');
      } else {
        setWarning('');
      }
    } else {
      setWarning('');
    }
  };

  const handleNext = () => {
    if (!canProceed) return;

    // Validate before proceeding
    const validationError = validateField(current.key, value);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (isLast) {
      handleSubmit();
    } else {
      setWarning('');
      setStep(s => s + 1);
    }
  };

  const handleBack = () => {
    if (!isFirst) {
      setStep(s => s - 1);
      setError('');
      setWarning('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && canProceed) {
      e.preventDefault();
      handleNext();
    }
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError('');
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const res = await axios.post(`${apiUrl}/api/onboarding`, {
        clerk_id: user.id,
        ...formData,
        tone: formData.tone.toLowerCase().split(' ')[0],
      });
      
      if (res.data.status === 'rejected') {
        setError(res.data.reason || 'Your submission was flagged. Please revise.');
        setSaving(false);
        return;
      }

      onComplete();
    } catch (err) {
      console.error('Onboarding error:', err);
      const serverMsg = err.response?.data?.detail;
      setError(serverMsg || 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const Icon = current.icon;
  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0a',
      backgroundImage: `
        radial-gradient(circle at 20% 80%, rgba(99, 102, 241, 0.06) 0%, transparent 50%),
        radial-gradient(circle at 80% 20%, rgba(236, 40, 165, 0.06) 0%, transparent 50%)
      `,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      color: '#fff',
    }}>
      {/* Logo */}
      <img src={outrenchLogo} alt="Outrench" style={{ height: 36, marginBottom: 48, opacity: 0.8 }} />

      {/* Progress bar */}
      <div style={{
        width: '100%', maxWidth: 480, height: 3, borderRadius: 99,
        background: 'rgba(255,255,255,0.06)', marginBottom: 48, overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', borderRadius: 99,
          background: 'linear-gradient(90deg, #6366f1, #ec28a5)',
          width: `${progress}%`,
          transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        }} />
      </div>

      {/* Card */}
      <div style={{
        width: '100%', maxWidth: 520,
        animation: 'fadeSlideIn 0.4s ease-out',
      }}>
        {/* Step indicator */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12,
          color: 'rgba(255,255,255,0.3)', fontSize: 13, fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: '0.1em',
        }}>
          <Icon size={16} style={{ color: '#818cf8' }} />
          Step {step + 1} of {STEPS.length}
        </div>

        {/* Question */}
        <h1 style={{
          fontSize: 28, fontWeight: 800, letterSpacing: '-0.5px',
          marginBottom: 10, lineHeight: 1.2,
        }}>
          {current.label}
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 15, marginBottom: 36, lineHeight: 1.5 }}>
          {current.subtitle}
        </p>

        {/* Input */}
        {current.type === 'select' ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 40 }}>
            {current.options.map(opt => (
              <button
                key={opt}
                onClick={() => updateField(opt)}
                style={{
                  padding: '12px 20px',
                  borderRadius: 12,
                  border: value === opt ? '1px solid rgba(99,102,241,0.6)' : '1px solid rgba(255,255,255,0.08)',
                  background: value === opt ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.03)',
                  color: value === opt ? '#a5b4fc' : 'rgba(255,255,255,0.6)',
                  fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                {opt}
              </button>
            ))}
          </div>
        ) : current.type === 'textarea' ? (
          <textarea
            value={value}
            onChange={e => updateField(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={current.placeholder}
            rows={3}
            autoFocus
            style={{
              width: '100%', background: warning ? 'rgba(248,113,113,0.04)' : 'rgba(255,255,255,0.04)',
              border: warning ? '1px solid rgba(248,113,113,0.3)' : '1px solid rgba(255,255,255,0.08)',
              borderRadius: 16,
              padding: '18px 20px', color: '#fff', fontSize: 16, outline: 'none',
              resize: 'none', transition: 'all 0.2s', boxSizing: 'border-box',
              lineHeight: 1.6,
            }}
            onFocus={e => { if (!warning) e.target.style.borderColor = 'rgba(99,102,241,0.5)'; }}
            onBlur={e => { if (!warning) e.target.style.borderColor = 'rgba(255,255,255,0.08)'; }}
          />
        ) : (
          <input
            type={current.type === 'url' ? 'text' : current.type}
            value={value}
            onChange={e => updateField(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={current.placeholder}
            autoFocus
            style={{
              width: '100%', background: warning ? 'rgba(248,113,113,0.04)' : 'rgba(255,255,255,0.04)',
              border: warning ? '1px solid rgba(248,113,113,0.3)' : '1px solid rgba(255,255,255,0.08)',
              borderRadius: 16,
              padding: '18px 20px', color: '#fff', fontSize: 16, outline: 'none',
              transition: 'all 0.2s', boxSizing: 'border-box',
            }}
            onFocus={e => { if (!warning) e.target.style.borderColor = 'rgba(99,102,241,0.5)'; }}
            onBlur={e => { if (!warning) e.target.style.borderColor = 'rgba(255,255,255,0.08)'; }}
          />
        )}

        {/* Warning (real-time, while typing) */}
        {warning && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginTop: 12,
            color: '#fbbf24', fontSize: 13, fontWeight: 500,
            background: 'rgba(251,191,36,0.06)', padding: '10px 14px', borderRadius: 10,
          }}>
            <ShieldAlert size={14} style={{ flexShrink: 0 }} />
            {warning}
          </div>
        )}

        {/* Error (on submit/next attempt) */}
        {error && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginTop: 12,
            color: '#f87171', fontSize: 13, fontWeight: 500,
            background: 'rgba(248,113,113,0.06)', padding: '10px 14px', borderRadius: 10,
          }}>
            <ShieldAlert size={14} style={{ flexShrink: 0 }} />
            {error}
          </div>
        )}

        {/* Navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 40, gap: 12 }}>
          <button
            onClick={handleBack}
            disabled={isFirst}
            style={{
              padding: '14px 24px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)',
              background: 'transparent', color: isFirst ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.5)',
              fontWeight: 600, fontSize: 14, cursor: isFirst ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.2s',
            }}
          >
            <ArrowLeft size={16} /> Back
          </button>

          <button
            onClick={handleNext}
            disabled={!canProceed || saving || !!warning}
            style={{
              padding: '14px 32px', borderRadius: 12, border: 'none',
              background: (canProceed && !warning) ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(255,255,255,0.08)',
              color: (canProceed && !warning) ? '#fff' : 'rgba(255,255,255,0.3)',
              fontWeight: 700, fontSize: 15, cursor: (canProceed && !warning) ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', gap: 8,
              boxShadow: (canProceed && !warning) ? '0 8px 24px rgba(99,102,241,0.4)' : 'none',
              transition: 'all 0.3s ease',
            }}
          >
            {saving ? (
              <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Saving...</>
            ) : isLast ? (
              <><Zap size={16} /> Launch Ghost</>
            ) : (
              <>Continue <ArrowRight size={16} /></>
            )}
          </button>
        </div>

        {/* Hint */}
        <p style={{
          textAlign: 'center', marginTop: 32,
          color: 'rgba(255,255,255,0.15)', fontSize: 12,
        }}>
          Press <span style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 600 }}>Enter ↵</span> to continue
        </p>
      </div>

      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
