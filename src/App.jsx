import { useState, useEffect, useRef, useCallback } from 'react';
import { MODEL_DATABASE } from './modelDatabase';
import { detectHardware } from './hardwareDetection';
import {
  classifyAllModels,
  findBottleneck,
  getUpgradeTiers,
  detectPlatform,
} from './recommendationEngine';

/* ═══════════════════════════════════════════════════════════
   PRIMITIVES
═══════════════════════════════════════════════════════════ */

function AnimatedNumber({ value, duration = 1000 }) {
  const [display, setDisplay] = useState(0);
  const raf = useRef(null);
  useEffect(() => {
    const num = parseFloat(value);
    if (isNaN(num)) { setDisplay(value); return; }
    let start = null;
    const step = (ts) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      const e = 1 - Math.pow(1 - p, 3);
      setDisplay(Number.isInteger(num) ? Math.round(e * num) : (e * num).toFixed(1));
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => raf.current && cancelAnimationFrame(raf.current);
  }, [value, duration]);
  return <span>{display}</span>;
}

function CopyButton({ text, children }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async (e) => {
    e.stopPropagation();
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);
  return (
    <button onClick={copy} style={{ position: 'relative', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}>
      {copied && <span className="copy-tip">Copied!</span>}
      {children ?? (copied
        ? <CheckIcon size={15} color="var(--green)" />
        : <CopyIcon size={15} color="var(--text-3)" />
      )}
    </button>
  );
}

/* ── SVG Icons ─────────────────────────────────────────── */
const CopyIcon = ({ size = 16, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
  </svg>
);
const CheckIcon = ({ size = 16, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6L9 17l-5-5"/>
  </svg>
);
const ExternalIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
  </svg>
);
const ChevronIcon = ({ open }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2"
    style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .2s' }}>
    <polyline points="6 9 12 15 18 9"/>
  </svg>
);

/* ── Code line with copy ───────────────────────────────── */
function CodeLine({ code }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      background: '#F8F9FB', border: '1px solid var(--border)',
      borderRadius: 8, padding: '8px 12px',
    }}>
      <code style={{ flex: 1, fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#1e40af', wordBreak: 'break-all' }}>
        {code}
      </code>
      <CopyButton text={code} />
    </div>
  );
}

/* ── Tier chip ──────────────────────────────────────────── */
function TierChip({ tier, label, emoji }) {
  const styles = {
    smooth:   { bg: 'var(--green-bg)',  color: 'var(--green)',  border: 'var(--green-border)' },
    balanced: { bg: 'var(--amber-bg)', color: 'var(--amber)', border: 'var(--amber-border)' },
    heavy:    { bg: 'var(--red-bg)',   color: 'var(--red)',   border: 'var(--red-border)' },
  }[tier] || {};
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 10px', borderRadius: 999,
      background: styles.bg, color: styles.color,
      border: `1px solid ${styles.border}`,
      fontSize: 12, fontWeight: 600, letterSpacing: '0.02em',
    }}>
      {emoji} {label}
    </span>
  );
}

/* ── Pill tag ───────────────────────────────────────────── */
function Tag({ children }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 999,
      background: 'var(--accent-bg)', color: 'var(--accent)',
      border: '1px solid var(--accent-light)',
      fontSize: 12, fontWeight: 500,
    }}>
      {children}
    </span>
  );
}

/* ── Filter pill button ─────────────────────────────────── */
function FilterBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: '6px 16px', borderRadius: 999, cursor: 'pointer',
      fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 500,
      background: active ? 'var(--accent)' : 'var(--surface)',
      color: active ? '#fff' : 'var(--text-2)',
      border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
      transition: 'all .15s',
    }}>
      {children}
    </button>
  );
}

/* ── Section label ──────────────────────────────────────── */
function SectionLabel({ children }) {
  return (
    <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 6 }}>
      {children}
    </p>
  );
}

/* ── Stat box ───────────────────────────────────────────── */
function StatBox({ label, value, accent }) {
  return (
    <div style={{ padding: '12px 16px', background: 'var(--surface-2)', borderRadius: 10 }}>
      <p style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 500, marginBottom: 2 }}>{label}</p>
      <p style={{ fontSize: 15, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: accent || 'var(--text-1)' }}>{value}</p>
    </div>
  );
}

/* ── Resource bar ───────────────────────────────────────── */
function ResourceBar({ label, used, total, color }) {
  const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{label}</span>
        <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-2)' }}>{used} / {total} GB</span>
      </div>
      <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width .5s ease' }} />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MODEL CARD
═══════════════════════════════════════════════════════════ */
function ModelCard({ model, index, hardware }) {
  const [open, setOpen] = useState(false);
  const { classification: c, isTopPick } = model;

  const tierColor = { smooth: 'var(--green)', balanced: 'var(--amber)', heavy: 'var(--red)' }[c.tier];
  const borderStyle = isTopPick
    ? `2px solid ${tierColor}`
    : open ? '1.5px solid var(--border-2)' : '1.5px solid var(--border)';

  return (
    <div
      className="model-card card-in"
      style={{
        background: 'var(--surface)',
        border: borderStyle,
        borderRadius: 14,
        overflow: 'hidden',
        boxShadow: isTopPick ? `0 0 0 3px ${tierColor}18, var(--shadow)` : 'var(--shadow-sm)',
        animationDelay: `${index * 60}ms`,
      }}
      onClick={() => setOpen(!open)}
    >
      {/* Top Pick banner */}
      {isTopPick && (
        <div style={{
          background: `linear-gradient(90deg, ${tierColor}18, transparent)`,
          borderBottom: `1px solid ${tierColor}30`,
          padding: '5px 16px',
          fontSize: 12, fontWeight: 600, color: tierColor,
        }}>
          ⭐ Top Pick for Your Hardware
        </div>
      )}

      {/* Card header */}
      <div style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
              <TierChip tier={c.tier} label={c.label} emoji={c.emoji} />
              {c.inferenceMode && (
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
                  background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)',
                }}>
                  {c.inferenceMode === 'GPU' ? '⚡ GPU' : '🧠 CPU'}
                </span>
              )}
            </div>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-1)', marginBottom: 2 }}>
              {model.name}
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-3)' }}>
              {model.family} · {model.parameterCount} · {model.fileSizeGB} GB
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: 15, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: tierColor }}>
                {c.speed > 0 ? `~${c.speed}` : '—'}
              </p>
              <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>tok/s</p>
            </div>
            <ChevronIcon open={open} />
          </div>
        </div>

        {/* Real talk */}
        <div style={{
          marginTop: 10, padding: '8px 12px', borderRadius: 8,
          background: `${tierColor}0D`,
          borderLeft: `3px solid ${tierColor}`,
          fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5,
        }}>
          {c.realTalk}
        </div>
      </div>

      {/* Expanded panel */}
      {open && (
        <div className="expand-panel" style={{ borderTop: '1px solid var(--border)', padding: '16px 20px' }}
          onClick={e => e.stopPropagation()}>

          {/* Stats grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
            <StatBox label="Download" value={`${model.fileSizeGB} GB`} />
            <StatBox label="Speed" value={c.speed > 0 ? `~${c.speed} t/s` : 'Slow'} accent={tierColor} />
            <StatBox label="Context" value={`${(model.contextLength / 1024).toFixed(0)}K`} />
            <StatBox label="Inference" value={c.inferenceMode || 'GPU'} />
          </div>

          {/* Resource bars */}
          {hardware && (
            <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {hardware.vram > 0 && !hardware.isIntegrated && (
                <ResourceBar label="VRAM usage" used={+(model.fileSizeGB + model.kvCacheGB).toFixed(1)} total={hardware.vram} color={tierColor} />
              )}
              <ResourceBar label="RAM usage" used={model.ramRequiredGB} total={hardware.systemRAM || 16} color="var(--accent)" />
            </div>
          )}

          {/* Tags */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {model.bestFor.map(t => <Tag key={t}>{t}</Tag>)}
          </div>

          {/* Why */}
          <p style={{ fontSize: 13, color: 'var(--text-2)', fontStyle: 'italic', marginBottom: 16, lineHeight: 1.5 }}>
            "{model.whyThisModel}"
          </p>

          {/* Commands */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            <div>
              <p style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, marginBottom: 4 }}>STEP 1 — PULL MODEL</p>
              <CodeLine code={model.ollamaCommand} />
            </div>
            <div>
              <p style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, marginBottom: 4 }}>STEP 2 — RUN IT</p>
              <CodeLine code={model.runCommand} />
            </div>
          </div>

          {/* CTA buttons */}
          <div style={{ display: 'flex', gap: 8 }}>
            <a
              href={model.ollamaUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '10px 0', borderRadius: 8, textDecoration: 'none',
                background: 'var(--accent)', color: '#fff',
                fontSize: 13, fontWeight: 600,
                transition: 'opacity .15s',
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.88'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >
              View on Ollama <ExternalIcon />
            </a>
            <CopyButton text={model.ollamaCommand}>
              <span style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '10px 18px', borderRadius: 8,
                background: 'var(--surface-2)', color: 'var(--text-2)',
                border: '1px solid var(--border)',
                fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
              }}>
                <CopyIcon size={14} /> Copy Pull
              </span>
            </CopyButton>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   WORKLOAD TOGGLE
═══════════════════════════════════════════════════════════ */
function WorkloadBtn({ icon, title, desc, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, textAlign: 'left', padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
      background: active ? 'var(--accent-bg)' : 'var(--surface)',
      border: `1.5px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
      transition: 'all .15s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <span style={{ fontSize: 14, fontWeight: 600, color: active ? 'var(--accent)' : 'var(--text-1)' }}>{title}</span>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.4 }}>{desc}</p>
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════
   SPEC LINE
═══════════════════════════════════════════════════════════ */
function SpecRow({ label, value, delay, note }) {
  return (
    <div className="spec-line" style={{ animationDelay: `${delay}ms`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 13, color: 'var(--text-3)', fontWeight: 500 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {note && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'var(--amber-bg)', color: 'var(--amber)', border: '1px solid var(--amber-border)', fontWeight: 500 }}>{note}</span>}
        <span style={{ fontSize: 13, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-1)' }}>{value}</span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MANUAL INPUT
═══════════════════════════════════════════════════════════ */
function ManualInput({ specs, setSpecs, onApply }) {
  const sel = {
    fontFamily: 'Inter, sans-serif', fontSize: 13, padding: '8px 12px',
    borderRadius: 8, border: '1.5px solid var(--border)',
    background: 'var(--surface)', color: 'var(--text-1)', width: '100%', cursor: 'pointer',
  };
  return (
    <div style={{ marginTop: 16, padding: 16, background: 'var(--surface-2)', borderRadius: 12, border: '1.5px solid var(--border)' }}>
      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginBottom: 12 }}>Enter your actual specs</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 14 }}>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, display: 'block', marginBottom: 4 }}>GPU TYPE</label>
          <select style={sel} value={specs.isIntegrated ? 'integrated' : 'discrete'}
            onChange={e => setSpecs({ ...specs, isIntegrated: e.target.value === 'integrated' })}>
            <option value="integrated">Integrated (Intel / AMD iGPU)</option>
            <option value="discrete">Discrete (NVIDIA / AMD)</option>
          </select>
        </div>
        {!specs.isIntegrated && (
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, display: 'block', marginBottom: 4 }}>VRAM</label>
            <select style={sel} value={specs.vram} onChange={e => setSpecs({ ...specs, vram: +e.target.value })}>
              {[2, 4, 6, 8, 10, 12, 16, 24].map(v => <option key={v} value={v}>{v} GB</option>)}
            </select>
          </div>
        )}
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, display: 'block', marginBottom: 4 }}>SYSTEM RAM</label>
          <select style={sel} value={specs.systemRAM} onChange={e => setSpecs({ ...specs, systemRAM: +e.target.value })}>
            {[4, 8, 16, 32, 64].map(v => <option key={v} value={v}>{v} GB</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, display: 'block', marginBottom: 4 }}>CPU CORES</label>
          <select style={sel} value={specs.cpuCores} onChange={e => setSpecs({ ...specs, cpuCores: +e.target.value })}>
            {[2, 4, 6, 8, 12, 16].map(v => <option key={v} value={v}>{v} cores</option>)}
          </select>
        </div>
      </div>
      <button onClick={onApply} style={{
        padding: '8px 20px', borderRadius: 8, cursor: 'pointer',
        background: 'var(--accent)', color: '#fff',
        fontSize: 13, fontWeight: 600, border: 'none',
      }}>
        Apply Specs
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN APP
═══════════════════════════════════════════════════════════ */
export default function App() {
  const [phase, setPhase] = useState('idle');  // idle | scanning | done
  const [hardware, setHardware] = useState(null);
  const [mode, setMode] = useState('office');
  const [models, setModels] = useState([]);
  const [progress, setProgress] = useState(0);
  const [filterUse, setFilterUse] = useState('All');
  const [filterTier, setFilterTier] = useState('All');
  const [manual, setManual] = useState(false);
  const [manualSpecs, setManualSpecs] = useState({ vram: 8, systemRAM: 16, cpuCores: 8, isIntegrated: false });

  const profileRef = useRef(null);

  useEffect(() => {
    if (!hardware) return;
    setModels(classifyAllModels(MODEL_DATABASE, hardware, mode));
  }, [hardware, mode]);

  const scan = useCallback(async () => {
    setPhase('scanning'); setProgress(0);
    const tick = setInterval(() => setProgress(p => Math.min(p + 3, 90)), 40);
    const hw = await detectHardware();
    clearInterval(tick); setProgress(100);
    setTimeout(() => {
      setHardware(hw); setPhase('done');
      setTimeout(() => profileRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    }, 350);
  }, []);

  const applyManual = useCallback(() => {
    setHardware(prev => ({
      ...(prev || {}),
      gpu: prev?.gpu || 'Manual entry',
      vram: manualSpecs.isIntegrated ? 0 : manualSpecs.vram,
      systemRAM: manualSpecs.systemRAM,
      cpuCores: manualSpecs.cpuCores,
      browser: prev?.browser || 'Unknown',
      webgpuSupported: prev?.webgpuSupported || false,
      isAppleSilicon: false,
      isIntegrated: manualSpecs.isIntegrated,
      gpuType: manualSpecs.isIntegrated ? 'integrated' : 'discrete',
      _ramMayBeCapped: false,
    }));
    setPhase('done'); setManual(false);
    setTimeout(() => profileRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  }, [manualSpecs]);

  const fixRAM = useCallback(v => {
    setHardware(p => p ? { ...p, systemRAM: v, _ramMayBeCapped: false } : p);
  }, []);

  const isIntegrated = hardware?.isIntegrated || hardware?.gpuType === 'integrated';
  const platform = detectPlatform();
  const bottleneck = hardware ? findBottleneck(hardware) : '';
  const upgradeTiers = hardware ? getUpgradeTiers(hardware) : [];
  const topPick = models.find(m => m.isTopPick);

  const filtered = models.filter(m => {
    if (filterUse !== 'All' && !m.bestFor.includes(filterUse)) return false;
    if (filterTier !== 'All') {
      const map = { '🟢 Smooth': 'smooth', '🟡 Balanced': 'balanced', '🔴 Heavy': 'heavy' };
      if (m.classification.tier !== map[filterTier]) return false;
    }
    return true;
  });

  const smooth   = models.filter(m => m.classification.tier === 'smooth').length;
  const balanced = models.filter(m => m.classification.tier === 'balanced').length;
  const heavy    = models.filter(m => m.classification.tier === 'heavy').length;

  /* ─────── RENDER ─────── */
  return (
    <div style={{ minHeight: '100vh' }}>

      {/* ══ NAV ══ */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(248,249,251,0.85)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border)',
        padding: '0 32px', display: 'flex', alignItems: 'center', height: 56,
      }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 18, color: 'var(--text-1)' }}>
          <span style={{ color: 'var(--accent)' }}>Run</span>Local
        </span>
        {phase === 'done' && (
          <button onClick={scan} style={{
            marginLeft: 'auto', padding: '6px 16px', borderRadius: 8,
            background: 'var(--surface)', border: '1px solid var(--border)',
            fontSize: 13, fontWeight: 500, color: 'var(--text-2)', cursor: 'pointer',
          }}>
            ↺ Rescan
          </button>
        )}
      </nav>

      {/* ══ HERO ══ */}
      <section className="hero-bg" style={{ padding: '80px 24px 72px', textAlign: 'center' }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <h1 className="fade-up fade-up-1" style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 'clamp(40px, 6vw, 64px)',
            fontWeight: 800, letterSpacing: '-1px', color: 'var(--text-1)', lineHeight: 1.1,
          }}>
            <span style={{ color: 'var(--accent)' }}>Run</span>Local
          </h1>

          <p className="fade-up fade-up-2" style={{
            marginTop: 20, fontSize: 'clamp(17px, 2.5vw, 20px)',
            color: 'var(--text-2)', fontWeight: 400, lineHeight: 1.5, maxWidth: 480, margin: '20px auto 0',
          }}>
            Know exactly which AI models your machine can run — before you download anything.
          </p>

          <p className="fade-up fade-up-3" style={{ marginTop: 10, fontSize: 14, color: 'var(--text-3)' }}>
            Free · Instant · No installs · Works in your browser
          </p>

          <div className="fade-up fade-up-4" style={{ marginTop: 36 }}>
            {phase === 'idle' && (
              <button
                onClick={scan}
                className="cta-pulse"
                style={{
                  padding: '14px 36px', borderRadius: 12, cursor: 'pointer',
                  background: 'var(--accent)', color: '#fff',
                  fontSize: 16, fontWeight: 700, border: 'none',
                  transition: 'opacity .15s, transform .15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '0.9'; e.currentTarget.style.transform = 'scale(1.02)'; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'scale(1)'; }}
              >
                Scan My Hardware
              </button>
            )}

            {phase === 'scanning' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
                <div style={{ position: 'relative', width: 56, height: 56 }}>
                  <div className="scan-ring" style={{
                    position: 'absolute', inset: 0, borderRadius: '50%',
                    border: '2px solid var(--accent)', opacity: 0.6,
                  }} />
                  <div style={{
                    position: 'absolute', inset: 8, borderRadius: '50%',
                    background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span style={{ fontSize: 18 }}>⚡</span>
                  </div>
                </div>
                <div style={{ width: 220, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${progress}%`, background: 'var(--accent)', borderRadius: 2, transition: 'width .1s' }} />
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Scanning hardware…</p>
              </div>
            )}
          </div>

          <p className="fade-up fade-up-5" style={{ marginTop: 18, fontSize: 12, color: 'var(--text-3)' }}>
            Uses WebGPU API · No data leaves your browser
          </p>
        </div>
      </section>

      {/* ══ HARDWARE PROFILE ══ */}
      {phase === 'done' && hardware && (
        <section ref={profileRef} style={{ padding: '0 24px 64px' }}>
          <div style={{ maxWidth: 680, margin: '0 auto' }}>
            <div style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 16, boxShadow: 'var(--shadow)', overflow: 'hidden' }}>

              {/* Card header */}
              <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-3)', textTransform: 'uppercase' }}>System Profile</p>
                  <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)', marginTop: 2 }}>Detected Hardware</h2>
                </div>
                <button onClick={() => setManual(!manual)} style={{
                  fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500,
                }}>
                  {manual ? 'Cancel' : 'Edit specs'}
                </button>
              </div>

              {/* Spec rows */}
              <div style={{ padding: '0 24px' }}>
                <SpecRow label="GPU" value={hardware.gpu || 'Unknown'} delay={0}
                  note={isIntegrated ? 'Integrated' : null} />
                <SpecRow label="VRAM" value={isIntegrated ? 'Shared (system RAM)' : `${hardware.vram ?? '?'} GB`} delay={80} />
                <SpecRow label="System RAM" value={`${hardware.systemRAM ?? '?'} GB`} delay={160}
                  note={hardware._ramMayBeCapped ? 'browser capped' : null} />
                <SpecRow label="CPU Cores" value={hardware.cpuCores ? `${hardware.cpuCores} threads` : 'Unknown'} delay={240} />
                <SpecRow label="Browser" value={hardware.browser} delay={320} />
                <SpecRow label="WebGPU" value={hardware.webgpuSupported ? '✓ Supported' : '✗ Unavailable'} delay={400} />
              </div>

              {/* Alerts */}
              <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {hardware._ramMayBeCapped && (
                  <div style={{ padding: 14, background: 'var(--amber-bg)', border: '1px solid var(--amber-border)', borderRadius: 10 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--amber)', marginBottom: 8 }}>
                      Browsers report max 8 GB RAM. How much do you actually have?
                    </p>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {[8, 16, 32, 64].map(v => (
                        <button key={v} onClick={() => fixRAM(v)} style={{
                          padding: '5px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                          background: v === hardware.systemRAM ? 'var(--accent)' : 'var(--surface)',
                          color: v === hardware.systemRAM ? '#fff' : 'var(--text-2)',
                          border: `1.5px solid ${v === hardware.systemRAM ? 'var(--accent)' : 'var(--border)'}`,
                        }}>
                          {v} GB
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {isIntegrated && (
                  <div style={{ padding: 12, background: 'var(--amber-bg)', border: '1px solid var(--amber-border)', borderRadius: 10 }}>
                    <p style={{ fontSize: 13, color: 'var(--amber)', fontWeight: 600, marginBottom: 2 }}>Integrated GPU detected</p>
                    <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.4 }}>
                      LLMs run on your CPU using system RAM. Works well for smaller models — speed depends on your RAM amount.
                    </p>
                  </div>
                )}
                {hardware.isAppleSilicon && (
                  <div style={{ padding: 12, background: 'var(--green-bg)', border: '1px solid var(--green-border)', borderRadius: 10 }}>
                    <p style={{ fontSize: 13, color: 'var(--green)', fontWeight: 600, marginBottom: 2 }}>Apple Silicon — unified memory</p>
                    <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.4 }}>
                      Your RAM is shared between CPU and GPU. Great for local LLMs. Using ~70% of total as effective VRAM.
                    </p>
                  </div>
                )}
              </div>

              {manual && (
                <div style={{ padding: '0 24px 20px' }}>
                  <ManualInput specs={manualSpecs} setSpecs={setManualSpecs} onApply={applyManual} />
                </div>
              )}

              {/* Workload mode */}
              <div style={{ padding: '16px 24px 24px', borderTop: '1px solid var(--border)' }}>
                <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 10 }}>
                  Workload Mode
                </p>
                <div style={{ display: 'flex', gap: 10 }}>
                  <WorkloadBtn icon="💼" title="Office Mode"
                    desc="Alongside Chrome, Zoom & Slack"
                    active={mode === 'office'} onClick={() => setMode('office')} />
                  <WorkloadBtn icon="🔬" title="Dedicated Mode"
                    desc="Close everything else"
                    active={mode === 'dedicated'} onClick={() => setMode('dedicated')} />
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ══ MODELS ══ */}
      {phase === 'done' && models.length > 0 && (
        <section style={{ padding: '0 24px 80px' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>

            {/* Section header */}
            <div style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-1)', marginBottom: 6 }}>
                Models You Can Run
              </h2>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <span style={{ fontSize: 13, padding: '3px 10px', borderRadius: 999, background: 'var(--green-bg)', color: 'var(--green)', border: '1px solid var(--green-border)', fontWeight: 600 }}>
                    {smooth} smooth
                  </span>
                  <span style={{ fontSize: 13, padding: '3px 10px', borderRadius: 999, background: 'var(--amber-bg)', color: 'var(--amber)', border: '1px solid var(--amber-border)', fontWeight: 600 }}>
                    {balanced} balanced
                  </span>
                  <span style={{ fontSize: 13, padding: '3px 10px', borderRadius: 999, background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid var(--red-border)', fontWeight: 600 }}>
                    {heavy} too heavy
                  </span>
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Click any card for install instructions</p>
              </div>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: 24, marginBottom: 24, flexWrap: 'wrap' }}>
              <div>
                <SectionLabel>Use case</SectionLabel>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {['All', 'Chat', 'Coding', 'Creative', 'Summarization'].map(o => (
                    <FilterBtn key={o} active={filterUse === o} onClick={() => setFilterUse(o)}>{o}</FilterBtn>
                  ))}
                </div>
              </div>
              <div>
                <SectionLabel>Tier</SectionLabel>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {['All', '🟢 Smooth', '🟡 Balanced', '🔴 Heavy'].map(o => (
                    <FilterBtn key={o} active={filterTier === o} onClick={() => setFilterTier(o)}>{o}</FilterBtn>
                  ))}
                </div>
              </div>
            </div>

            {/* Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(480px, 1fr))', gap: 14 }}>
              {filtered.map((m, i) => (
                <ModelCard key={m.id} model={m} index={i} hardware={hardware} />
              ))}
            </div>

            {filtered.length === 0 && (
              <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-3)' }}>
                <p style={{ fontSize: 15 }}>No models match these filters.</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ══ UPGRADE PATH ══ */}
      {phase === 'done' && hardware && (
        <section style={{ padding: '0 24px 80px' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <div style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 16, boxShadow: 'var(--shadow)', padding: '28px 32px' }}>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)', marginBottom: 4 }}>Want to Run Bigger Models?</h2>
              <p style={{ fontSize: 14, color: 'var(--text-3)', marginBottom: 24 }}>
                Your current bottleneck: <strong style={{ color: 'var(--amber)', fontFamily: "'JetBrains Mono', monospace" }}>{bottleneck}</strong>
              </p>
              <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4 }}>
                {upgradeTiers.map((tier, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                    <div style={{
                      minWidth: 180, padding: '16px 18px', borderRadius: 12,
                      background: tier.isCurrent ? 'var(--accent-bg)' : 'var(--surface-2)',
                      border: `1.5px solid ${tier.isCurrent ? 'var(--accent)' : 'var(--border)'}`,
                    }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: tier.isCurrent ? 'var(--accent)' : 'var(--text-3)', marginBottom: 4, letterSpacing: '0.05em' }}>
                        {tier.isCurrent ? '📍 YOU ARE HERE' : tier.label.toUpperCase()}
                      </p>
                      <p style={{ fontSize: 22, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-1)', marginBottom: 10 }}>{tier.mem} GB</p>
                      <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {tier.models.map(m => (
                          <li key={m} style={{ fontSize: 12, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ color: 'var(--border-2)' }}>›</span> {m}
                          </li>
                        ))}
                      </ul>
                    </div>
                    {i < upgradeTiers.length - 1 && (
                      <span style={{ color: 'var(--border-2)', fontSize: 20, flexShrink: 0 }}>→</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ══ GET STARTED ══ */}
      {phase === 'done' && topPick && (
        <section style={{ padding: '0 24px 80px' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)', marginBottom: 20, textAlign: 'center' }}>
              Get Started in 3 Steps
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              {/* Step 1 */}
              <div style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 14, padding: '22px 24px', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent-bg)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>1</span>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>Install Ollama</h3>
                </div>
                {platform === 'mac'     && <CodeLine code="brew install ollama" />}
                {platform === 'linux'   && <CodeLine code="curl -fsSL https://ollama.com/install.sh | sh" />}
                {platform === 'windows' && (
                  <a href="https://ollama.com/download/windows" target="_blank" rel="noopener noreferrer" style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    padding: '10px', borderRadius: 8, background: 'var(--accent)', color: '#fff',
                    fontSize: 13, fontWeight: 600, textDecoration: 'none',
                  }}>
                    Download Ollama for Windows <ExternalIcon />
                  </a>
                )}
              </div>
              {/* Step 2 */}
              <div style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 14, padding: '22px 24px', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent-bg)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>2</span>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>Pull your top pick</h3>
                </div>
                <CodeLine code={topPick.ollamaCommand} />
                <p style={{ marginTop: 8, fontSize: 12, color: 'var(--text-3)' }}>{topPick.name} — {topPick.fileSizeGB} GB download</p>
              </div>
              {/* Step 3 */}
              <div style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 14, padding: '22px 24px', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent-bg)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>3</span>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>Start chatting</h3>
                </div>
                <CodeLine code={topPick.runCommand} />
                <p style={{ marginTop: 8, fontSize: 12, color: 'var(--text-3)', lineHeight: 1.4 }}>
                  That's it. Local AI. No cloud. No API keys. No subscription.
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ══ FOOTER ══ */}
      <footer style={{ borderTop: '1px solid var(--border)', padding: '32px 24px', textAlign: 'center' }}>
        <p style={{ fontSize: 14, color: 'var(--text-2)' }}>
          Built by <strong style={{ color: 'var(--text-1)' }}>Praveen Kumar</strong>
        </p>
        <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>No data collected. Everything runs in your browser.</p>
        <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 10, maxWidth: 520, margin: '10px auto 0', lineHeight: 1.5 }}>
          Hardware estimates are based on WebGPU API data and may vary. Model performance depends on your system configuration.
        </p>
      </footer>

    </div>
  );
}
