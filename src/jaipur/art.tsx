import type { CSSProperties } from 'react';
import type { CardKind } from '../../shared/jaipur';

/** Hand-drawn SVG for 자이푸르: goods glyphs, the pink-city facade and kites. */

export function GoodGlyph({ kind, size = 24 }: { kind: CardKind; size?: number | string }) {
  const p = { width: size, height: size, viewBox: '0 0 40 40', 'aria-hidden': true as const, className: 'jp-glyph' };
  switch (kind) {
    case 'diamond':
      return <svg {...p}><path d="M8 15l6-8h12l6 8-12 18z" fill="currentColor" /><path d="M8 15h24M14 7l6 26M26 7l-6 26M14 7l-2 8 8 18 8-18-2-8" stroke="#fff" strokeWidth="1" fill="none" opacity=".55" /></svg>;
    case 'gold':
      return <svg {...p}><path d="M6 30l5-11h18l5 11z" fill="currentColor" /><path d="M12 19l4-8h10l3 8" fill="currentColor" opacity=".85" /><path d="M10 26h20M15 15h10" stroke="#fff" strokeWidth="1.3" opacity=".6" /></svg>;
    case 'silver':
      return <svg {...p}><circle cx="16" cy="22" r="10" fill="currentColor" /><circle cx="25" cy="17" r="10" fill="currentColor" opacity=".8" /><circle cx="25" cy="17" r="6" stroke="#fff" strokeWidth="1.3" fill="none" opacity=".6" /></svg>;
    case 'cloth':
      return <svg {...p}><path d="M6 12c6-4 22-4 28 0v6c-6-4-22-4-28 0z" fill="currentColor" /><path d="M6 20c6-4 22-4 28 0v6c-6-4-22-4-28 0z" fill="currentColor" opacity=".8" /><path d="M6 28c6-4 22-4 28 0v4H6z" fill="currentColor" opacity=".65" /><path d="M10 13l2 2 2-2 2 2 2-2 2 2 2-2 2 2 2-2 2 2 2-2" stroke="#ffd56b" strokeWidth="1" fill="none" /></svg>;
    case 'spice':
      return <svg {...p}><path d="M6 24h28c0 6-6 10-14 10S6 30 6 24z" fill="currentColor" opacity=".85" /><path d="M9 24c2-8 6-12 11-12s9 4 11 12z" fill="currentColor" /><circle cx="15" cy="19" r="1.4" fill="#fff" opacity=".6" /><circle cx="22" cy="16" r="1.2" fill="#fff" opacity=".6" /><circle cx="25" cy="21" r="1.3" fill="#fff" opacity=".6" /></svg>;
    case 'leather':
      return <svg {...p}><path d="M10 6c4 2 16 2 20 0l2 6c-2 3-2 6 0 9l-2 13c-4-2-16-2-20 0L8 21c2-3 2-6 0-9z" fill="currentColor" /><path d="M13 12c4 1 10 1 14 0M13 28c4-1 10-1 14 0" stroke="#fff" strokeWidth="1" strokeDasharray="2 2" opacity=".55" /></svg>;
    default:
      return <svg {...p}><path d="M5 21c0-4 3-6 6-6 1-4 3-6 5.5-6s4.5 2.4 5 6h2.5c.8-4 2.5-6.5 5-7.5 1.4-.6 2.5-2 4-2 1.6 0 2.5 1.4 2.5 2.8l-2.4.6-1.6 4.6V18c0 2.6-1.6 4.4-3.5 4.8V35h-2.5v-9.5h-9V35H14v-9.5c-1.5-.4-2.6-1.2-3.3-2.4L8.8 35H6.3L7 24.5c-1.3-.6-2-2-2-3.5z" fill="currentColor" /><circle cx="34.6" cy="9.4" r=".9" fill="#fff" opacity=".7" /></svg>;
  }
}

/** A row of arched little windows, the honeycomb front of a palace of winds. */
function Facade({ className }: { className: string }) {
  const rows = 6;
  return <svg className={className} viewBox="0 0 600 260" aria-hidden="true">
    <defs>
      <linearGradient id="jp-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e9858a" /><stop offset="1" stopColor="#c95a63" /></linearGradient>
    </defs>
    <path d="M0 260V70l60-30 60 30 60-46 60 46 60-60 60 60 60-46 60 46 60-30 60 30v190z" fill="url(#jp-wall)" />
    {Array.from({ length: rows }, (_, r) => Array.from({ length: 20 }, (_, c) => {
      const x = 12 + c * 30, y = 80 + r * 30;
      if (y < 60 + Math.abs(10 - c) * 6) return null;
      return <g key={`${r}-${c}`}>
        <path d={`M${x} ${y + 20}v-11a8 8 0 0 1 16 0v11z`} fill="#fbe1d4" opacity=".9" />
        <path d={`M${x + 3} ${y + 20}v-9a5 5 0 0 1 10 0v9z`} fill={(r * 7 + c * 3) % 5 === 0 ? '#ffd27a' : '#7b2d3a'} opacity={(r * 7 + c * 3) % 5 === 0 ? 0.95 : 0.55} />
      </g>;
    }))}
    {[60, 180, 300, 420, 540].map(x => <circle key={x} cx={x} cy={x % 120 === 60 ? 52 : 34} r="7" fill="#fbe1d4" />)}
  </svg>;
}

export function PinkCityBackdrop({ inGame }: { inGame: boolean }) {
  return <div className={`duel-backdrop jp-backdrop ${inGame ? 'is-game' : ''}`} aria-hidden="true">
    <div className="jp-sun" />
    <div className="jp-kites">{['#2c9e8f', '#f2b632', '#6b4bb3', '#e0533d'].map((color, i) => <svg key={i} viewBox="0 0 30 46" style={{ '--i': i, '--k': color } as CSSProperties}><path d="M15 0l13 15-13 15L2 15z" fill="var(--k)" /><path d="M15 0v30M2 15h26" stroke="#fff8" strokeWidth="1" /><path d="M15 30q4 6-2 10t2 6" stroke="#5a3a2a" strokeWidth="1" fill="none" /></svg>)}</div>
    <svg className="jp-garland" viewBox="0 0 600 60" preserveAspectRatio="none">
      <path d="M0 6Q150 54 300 6T600 6" stroke="#4f8a3a" strokeWidth="1.5" fill="none" />
      {Array.from({ length: 25 }, (_, i) => { const t = i / 24; const x = t * 600; const u = (t * 2) % 1; const y = 6 + 96 * u * (1 - u); return <circle key={i} cx={x} cy={y} r="5" fill={i % 2 ? '#f39a1e' : '#f7c531'} />; })}
    </svg>
    <div className="jp-facade">{[0, 1, 2, 3].map(i => <Facade key={i} className="jp-facade-tile" />)}</div>
  </div>;
}

/** Landing art: a fanned hand of goods in front of the facade. */
export function BazaarArt() {
  const kinds: CardKind[] = ['spice', 'cloth', 'diamond', 'gold', 'camel'];
  return <div className="jp-art">
    {kinds.map((kind, i) => <span key={kind} className={`jp-card jp-${kind}`} style={{ '--k': i - 2 } as CSSProperties}><GoodGlyph kind={kind} size="56%" /></span>)}
  </div>;
}
