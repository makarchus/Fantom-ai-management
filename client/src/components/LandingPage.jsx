import {
  Shield, Users, ListChecks, Zap, Lock, ArrowRight,
  Check, Building2, User, Mail, BarChart3, EyeOff, KeyRound,
} from 'lucide-react';
import { PRICING_PLANS } from '../lib/pricing.js';

const PLAN_ICONS = { solo: User, team: Users, business: Building2, enterprise: Building2 };

const FEATURES = [
  {
    icon: Lock,
    title: 'AES-256 encrypted vault',
    desc: 'Meetings, transcripts, and API keys are encrypted before storage. Only your account can decrypt them — not even us.',
  },
  {
    icon: Zap,
    title: 'Fathom-powered import',
    desc: 'Sync recordings in one click. AI extracts action items, commitments, and next steps from every meeting.',
  },
  {
    icon: Users,
    title: 'Assign & collaborate',
    desc: 'Assign by email, notify instantly, and track progress with a shared comment history on every action.',
  },
  {
    icon: ListChecks,
    title: 'Action queue',
    desc: 'Overdue items surface first. Your team always knows what needs attention — right in the sidebar.',
  },
  {
    icon: Shield,
    title: 'Email 2FA every sign-in',
    desc: 'Two-factor authentication on every login. A verification code is emailed each time you sign in.',
  },
  {
    icon: BarChart3,
    title: 'Commitments tracker',
    desc: 'See promises across all meetings. Nothing falls through the cracks between calls.',
  },
];

function FeatureCard({ icon: Icon, title, desc }) {
  return (
    <div style={{
      padding: 24,
      borderRadius: 14,
      background: 'var(--navy-800)',
      border: '1px solid var(--navy-600)',
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: 'var(--indigo-dim)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 14,
      }}>
        <Icon size={20} color="var(--indigo-light)" />
      </div>
      <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: 'var(--white-soft)' }}>{title}</h3>
      <p style={{ fontSize: 13, color: 'var(--slate-300)', lineHeight: 1.55 }}>{desc}</p>
    </div>
  );
}

function PricingCard({ plan, onSelect }) {
  const Icon = PLAN_ICONS[plan.id] || User;
  return (
    <div style={{
      padding: 28,
      borderRadius: 16,
      background: plan.highlight ? 'linear-gradient(160deg, #1e2a5a 0%, #1a2440 100%)' : 'var(--navy-800)',
      border: plan.highlight ? '2px solid var(--indigo)' : '1px solid var(--navy-600)',
      boxShadow: plan.highlight ? 'var(--shadow-glow)' : 'none',
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {plan.badge && (
        <span style={{
          position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--indigo)', color: 'white', fontSize: 11, fontWeight: 700,
          padding: '4px 12px', borderRadius: 20, whiteSpace: 'nowrap',
        }}>
          {plan.badge}
        </span>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <Icon size={20} color="var(--indigo-light)" />
        <span style={{ fontSize: 18, fontWeight: 700 }}>{plan.name}</span>
      </div>
      <div style={{ marginBottom: 4 }}>
        {plan.price != null ? (
          <>
            <span style={{ fontSize: 36, fontWeight: 800, color: 'var(--white-soft)' }}>${plan.price}</span>
            <span style={{ fontSize: 13, color: 'var(--slate-300)', marginLeft: 4 }}>{plan.unit}</span>
          </>
        ) : (
          <span style={{ fontSize: 28, fontWeight: 800, color: 'var(--white-soft)' }}>Custom</span>
        )}
      </div>
      <div style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600, marginBottom: 4 }}>{plan.trial}</div>
      <div style={{ fontSize: 11, color: 'var(--slate-300)', marginBottom: plan.volume ? 4 : 16 }}>{plan.users} · {plan.commitment}</div>
      {plan.volume && (
        <div style={{ fontSize: 11, color: 'var(--amber)', fontWeight: 600, marginBottom: 16 }}>{plan.volume}</div>
      )}
      <ul style={{ listStyle: 'none', margin: '0 0 24px', flex: 1 }}>
        {plan.features.map((f) => (
          <li key={f} style={{ display: 'flex', gap: 8, fontSize: 13, color: 'var(--slate-200)', marginBottom: 8 }}>
            <Check size={14} color="var(--green)" style={{ flexShrink: 0, marginTop: 2 }} />
            {f}
          </li>
        ))}
      </ul>
      <button
        type="button"
        className={plan.highlight ? 'btn btn-primary' : 'btn btn-ghost'}
        style={{ width: '100%', justifyContent: 'center' }}
        onClick={() => onSelect(plan.id)}
      >
        {plan.price != null ? 'Start free trial' : 'Contact sales'}
      </button>
    </div>
  );
}

export default function LandingPage({ onGetStarted }) {
  return (
    <div style={{ background: 'var(--navy-950)' }}>
      {/* Hero */}
      <section style={{
        textAlign: 'center', padding: '64px 24px 48px',
        background: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(99,102,241,0.25) 0%, transparent 70%)',
      }}>
        <div className="badge badge-indigo" style={{ marginBottom: 20, fontSize: 12, padding: '6px 14px' }}>
          3 months free · No credit card required
        </div>
        <h1 style={{
          fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 800, lineHeight: 1.15,
          color: 'var(--white-soft)', maxWidth: 720, margin: '0 auto 20px',
        }}>
          Every meeting becomes<br />
          <span style={{ color: 'var(--indigo-light)' }}>clear, accountable action</span>
        </h1>
        <p style={{
          fontSize: 18, color: 'var(--slate-300)', maxWidth: 560, margin: '0 auto 36px', lineHeight: 1.6,
        }}>
          Connect Fathom, auto-extract action items, assign owners by email, and track progress until done — in a private, encrypted workspace only you can access.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary" style={{ padding: '12px 28px', fontSize: 15 }} onClick={onGetStarted}>
            Get started free <ArrowRight size={16} />
          </button>
          <a href="#pricing" className="btn btn-ghost" style={{ padding: '12px 28px', fontSize: 15, textDecoration: 'none' }}>
            View pricing
          </a>
        </div>
      </section>

      {/* Security — primary trust message */}
      <section style={{ padding: '0 24px 64px', maxWidth: 920, margin: '0 auto' }}>
        <div style={{
          padding: '40px 32px',
          borderRadius: 20,
          background: 'linear-gradient(135deg, rgba(34,197,94,0.07) 0%, rgba(99,102,241,0.1) 100%)',
          border: '1px solid rgba(34,197,94,0.35)',
          textAlign: 'center',
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14, margin: '0 auto 20px',
            background: 'var(--green-dim)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Lock size={28} color="var(--green)" />
          </div>
          <h2 style={{ fontSize: 26, fontWeight: 800, color: 'var(--white-soft)', marginBottom: 12 }}>
            Your data is encrypted. Only you can read it.
          </h2>
          <p style={{
            fontSize: 16, color: 'var(--slate-200)', maxWidth: 640, margin: '0 auto 28px', lineHeight: 1.65,
          }}>
            Every meeting, transcript, summary, and API key is encrypted with <strong>AES-256-GCM</strong> before it reaches our servers.
            We cannot decrypt your vault — our team has <strong>zero access</strong> to your meeting content.
          </p>
          <div style={{
            display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap',
            fontSize: 13, color: 'var(--slate-200)',
          }}>
            {[
              { icon: Lock, label: 'AES-256-GCM at rest' },
              { icon: Shield, label: 'Email 2FA every sign-in' },
              { icon: KeyRound, label: 'Private recovery key' },
              { icon: EyeOff, label: 'Zero server-side plaintext' },
            ].map(({ icon: Icon, label }) => (
              <span key={label} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 8,
                background: 'rgba(6,11,23,0.5)', border: '1px solid var(--navy-600)',
              }}>
                <Icon size={14} color="var(--green)" /> {label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section style={{ padding: '64px 24px', maxWidth: 900, margin: '0 auto' }}>
        <h2 style={{ textAlign: 'center', fontSize: 28, fontWeight: 700, marginBottom: 40, color: 'var(--white-soft)' }}>
          How it works
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 24 }}>
          {[
            { step: '01', title: 'Connect Fathom', desc: 'Link your recorder. Meetings sync with one Refresh click.' },
            { step: '02', title: 'AI extracts actions', desc: 'Summaries become assignable action items with priorities and due dates.' },
            { step: '03', title: 'Team executes', desc: 'Assignees get email alerts. Progress comments build a resolution history.' },
          ].map((s) => (
            <div key={s.step} style={{ textAlign: 'center', padding: 24 }}>
              <div style={{
                fontSize: 40, fontWeight: 800, color: 'var(--indigo)',
                opacity: 0.4, marginBottom: 12, fontFamily: 'var(--font-mono)',
              }}>{s.step}</div>
              <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>{s.title}</h3>
              <p style={{ fontSize: 14, color: 'var(--slate-300)', lineHeight: 1.55 }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section style={{ padding: '64px 24px', background: 'var(--navy-900)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <h2 style={{ textAlign: 'center', fontSize: 28, fontWeight: 700, marginBottom: 12, color: 'var(--white-soft)' }}>
            Built for teams that ship
          </h2>
          <p style={{ textAlign: 'center', color: 'var(--slate-300)', marginBottom: 40, fontSize: 15 }}>
            Stop losing decisions in meeting notes. Start closing the loop.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
            {FEATURES.map((f) => <FeatureCard key={f.title} {...f} />)}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" style={{ padding: '80px 24px', maxWidth: 1200, margin: '0 auto' }}>
        <h2 style={{ textAlign: 'center', fontSize: 28, fontWeight: 700, marginBottom: 8, color: 'var(--white-soft)' }}>
          Simple, transparent pricing
        </h2>
        <p style={{ textAlign: 'center', color: 'var(--slate-300)', marginBottom: 12, fontSize: 15 }}>
          Every plan includes a <strong style={{ color: 'var(--green)' }}>3-month free trial</strong>. Solo is one flat price with full features; team plans scale per seat.
        </p>
        <p style={{ textAlign: 'center', color: 'var(--amber)', marginBottom: 40, fontSize: 13, fontWeight: 600 }}>
          <Building2 size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
          Company plans (Business & Enterprise): volume discounts with a 1-year minimum commitment
        </p>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 20,
          alignItems: 'stretch',
        }}>
          {PRICING_PLANS.map((p) => (
            <PricingCard key={p.id} plan={p} onSelect={(id) => {
              if (id === 'enterprise') {
                window.location.href = 'mailto:sales@meetingintelligence.app?subject=Enterprise%20pricing';
              } else {
                onGetStarted();
              }
            }} />
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{
        padding: '64px 24px 80px',
        textAlign: 'center',
        background: 'linear-gradient(180deg, transparent 0%, rgba(99,102,241,0.08) 100%)',
      }}>
        <Mail size={32} color="var(--indigo-light)" style={{ marginBottom: 16 }} />
        <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12, color: 'var(--white-soft)' }}>
          Ready to turn talk into action?
        </h2>
        <p style={{ color: 'var(--slate-300)', marginBottom: 28, fontSize: 16, maxWidth: 480, margin: '0 auto 28px' }}>
          Join in under 2 minutes. Your first 90 days are on us — your data stays encrypted from day one.
        </p>
        <button type="button" className="btn btn-primary" style={{ padding: '14px 32px', fontSize: 16 }} onClick={onGetStarted}>
          Create free account <ArrowRight size={18} />
        </button>
      </section>

      <footer style={{
        padding: '24px 32px', borderTop: '1px solid var(--navy-700)',
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        fontSize: 12, color: 'var(--slate-400)',
      }}>
        <span>© {new Date().getFullYear()} Meeting Intelligence</span>
      </footer>
    </div>
  );
}
