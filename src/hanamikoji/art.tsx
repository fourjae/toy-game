import type { CSSProperties } from 'react';
import { GEISHAS } from '../../shared/hanamikoji';

/** Hand-drawn SVG for 하나미코지: item glyphs, geisha portraits, and the lantern-lit street. */

export const GEISHA_COLORS: Record<string, { c: string; c2: string; soft: string }> = {
  plum: { c: '#9b4f8f', c2: '#6a2c63', soft: '#f1dcec' },
  teal: { c: '#2f8f8b', c2: '#1b5f5c', soft: '#d6efed' },
  rose: { c: '#d9667f', c2: '#a63c56', soft: '#f9dde3' },
  indigo: { c: '#4659ad', c2: '#2b3878', soft: '#dfe3f6' },
  amber: { c: '#dc9b2c', c2: '#a86c10', soft: '#f8e8c8' },
  jade: { c: '#4f9a62', c2: '#2e6a3d', soft: '#dcefe0' },
  crimson: { c: '#c63d33', c2: '#8d221b', soft: '#f6d6d2' },
};

export function geishaStyle(geisha: number): CSSProperties {
  const palette = GEISHA_COLORS[GEISHAS[geisha]!.color]!;
  return { '--g': palette.c, '--g2': palette.c2, '--gs': palette.soft } as CSSProperties;
}

/** One small glyph per geisha's item, drawn in currentColor on a 40x40 box. */
export function ItemGlyph({ geisha, size = 24 }: { geisha: number; size?: number | string }) {
  const common = { width: size, height: size, viewBox: '0 0 40 40', 'aria-hidden': true as const, className: 'hm-glyph' };
  switch (geisha) {
    case 0: // fan
      return <svg {...common}><path d="M20 34L5 16a21 21 0 0 1 30 0z" fill="currentColor" opacity=".9" /><path d="M20 34L9 12M20 34L15 9M20 34V8M20 34l5-25M20 34l11-22" stroke="#fff" strokeWidth="1.3" opacity=".7" /><circle cx="20" cy="33" r="2.2" fill="currentColor" /></svg>;
    case 1: // flute
      return <svg {...common}><rect x="18" y="2" width="5" height="36" rx="2.5" transform="rotate(35 20 20)" fill="currentColor" />{[0, 1, 2, 3].map(i => <circle key={i} cx={13.5 + i * 3.6} cy={26 - i * 5.1} r="1.1" fill="#fff" />)}</svg>;
    case 2: // teacup
      return <svg {...common}><path d="M7 15h26c0 9-5.5 15-13 15S7 24 7 15z" fill="currentColor" /><path d="M11 33h18" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /><path d="M15 11c0-3 3-3 3-6M22 11c0-3 3-3 3-6" stroke="currentColor" strokeWidth="1.6" fill="none" opacity=".55" strokeLinecap="round" /></svg>;
    case 3: // parasol
      return <svg {...common}><path d="M4 19a16 13 0 0 1 32 0z" fill="currentColor" /><path d="M20 6v13M12 8l8 11M28 8l-8 11" stroke="#fff" strokeWidth="1" opacity=".55" /><path d="M20 19v13a3 3 0 0 1-6 0" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" /></svg>;
    case 4: // bell
      return <svg {...common}><path d="M20 6c-7 0-10 6-10 13 0 5-2 7-4 9h28c-2-2-4-4-4-9 0-7-3-13-10-13z" fill="currentColor" /><circle cx="20" cy="31.5" r="3" fill="currentColor" /><path d="M17 4h6" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>;
    case 5: // scroll
      return <svg {...common}><rect x="9" y="7" width="22" height="26" fill="currentColor" opacity=".85" /><rect x="6" y="4" width="28" height="5" rx="2.5" fill="currentColor" /><rect x="6" y="31" width="28" height="5" rx="2.5" fill="currentColor" /><path d="M14 13h12M14 18h9M14 23h11" stroke="#fff" strokeWidth="1.5" opacity=".7" strokeLinecap="round" /></svg>;
    default: // biwa lute
      return <svg {...common}><path d="M27 4l4 4-6 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" /><path d="M24 14c-8-3-19 5-17 14 1 6 7 9 13 7 8-3 11-13 4-21z" fill="currentColor" /><path d="M24 14L12 30" stroke="#fff" strokeWidth=".9" opacity=".65" /><circle cx="15.5" cy="24.5" r="2" fill="#fff" opacity=".6" /></svg>;
  }
}

/** A stylised portrait: dark hair with a bun, a hairpin, a pale face and a kimono collar in her colour. */
export function GeishaPortrait({ geisha }: { geisha: number }) {
  const pin = ['#f2c14e', '#f3f0e8', '#f2c14e', '#e8495c', '#f3f0e8', '#f2c14e', '#ffd8e2'][geisha]!;
  return <svg viewBox="0 0 60 64" className="hm-portrait" aria-hidden="true">
    <path d="M6 64c2-12 10-18 24-18s22 6 24 18z" fill="var(--g)" />
    <path d="M22 46l8 12 8-12" fill="#fbf4ea" />
    <path d="M24 46l6 9 6-9" fill="var(--g2)" opacity=".5" />
    <ellipse cx="30" cy="31" rx="11.5" ry="13" fill="#fbf1e6" />
    <path d="M17.5 30c-1-12 5-18 12.5-18s13.5 6 12.5 18c-2-6-6-9-12.5-9s-10.5 3-12.5 9z" fill="#1d1820" />
    <ellipse cx="30" cy="10" rx="9" ry="7" fill="#1d1820" />
    <ellipse cx="19" cy="17" rx="4.5" ry="5.5" fill="#1d1820" />
    <ellipse cx="41" cy="17" rx="4.5" ry="5.5" fill="#1d1820" />
    <path d="M38 6l10-4" stroke={pin} strokeWidth="1.8" strokeLinecap="round" />
    <circle cx="48.5" cy="2.5" r="2.4" fill={pin} />
    <circle cx="23" cy="9" r="2.6" fill="var(--g)" />
    <path d="M25 33q1.6 1.2 3.2 0M31.8 33q1.6 1.2 3.2 0" stroke="#3b2a2a" strokeWidth="1" fill="none" strokeLinecap="round" />
    <path d="M28.4 38.6q1.6 1 3.2 0" stroke="#c0313a" strokeWidth="1.8" strokeLinecap="round" />
    <circle cx="24" cy="36.5" r="2" fill="#f2a6a6" opacity=".45" /><circle cx="36" cy="36.5" r="2" fill="#f2a6a6" opacity=".45" />
  </svg>;
}

/** A paper lantern; `--i` staggers the sway. */
export function Lantern({ i = 0, label }: { i?: number; label?: string }) {
  return <svg viewBox="0 0 40 70" className="hm-lantern" style={{ '--i': i } as CSSProperties} aria-hidden="true">
    <path d="M20 0v8" stroke="#2a1d1a" strokeWidth="1.4" />
    <rect x="12" y="8" width="16" height="5" rx="1.5" fill="#2a1d1a" />
    <ellipse cx="20" cy="36" rx="15" ry="23" fill="url(#hm-lantern-glow)" />
    {[-12, -6, 0, 6, 12].map(dy => <path key={dy} d={`M6 ${36 + dy}q14 3 28 0`} stroke="#8d1c14" strokeWidth=".8" fill="none" opacity=".45" />)}
    {label && <text x="20" y="41" textAnchor="middle" fontSize="11" fontFamily="'Gowun Batang',serif" fill="#3a0b06" opacity=".75">{label}</text>}
    <rect x="12" y="58" width="16" height="5" rx="1.5" fill="#2a1d1a" />
    <path d="M17 63v6M20 63v7M23 63v6" stroke="#c9302a" strokeWidth="1.2" />
  </svg>;
}

export function LanternDefs() {
  return <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
    <defs>
      <radialGradient id="hm-lantern-glow" cx="50%" cy="45%" r="60%"><stop offset="0" stopColor="#ffd58a" /><stop offset=".45" stopColor="#f2603c" /><stop offset="1" stopColor="#b3231a" /></radialGradient>
    </defs>
  </svg>;
}

/** Wooden townhouses along a lane at dusk, lanterns under the eaves, petals drifting through. */
export function KyotoBackdrop({ inGame }: { inGame: boolean }) {
  return <div className={`duel-backdrop hm-backdrop ${inGame ? 'is-game' : ''}`} aria-hidden="true">
    <LanternDefs />
    <div className="hm-moon" />
    <svg className="hm-street" viewBox="0 0 1200 300" preserveAspectRatio="xMidYMax slice">
      <path d="M0 160l90-40 90 40v140H0z" fill="#2a1f2d" />
      <path d="M150 140l120-52 120 52v160H150z" fill="#33263a" />
      <path d="M380 170l100-44 100 44v130H380z" fill="#2a1f2d" />
      <path d="M560 120l140-60 140 60v180H560z" fill="#3a2b40" />
      <path d="M820 165l100-44 100 44v135H820z" fill="#2a1f2d" />
      <path d="M990 140l110-48 110 48v160H990z" fill="#33263a" />
      {[[20, 190], [200, 175], [420, 200], [610, 160], [860, 195], [1030, 175]].map(([x, y], k) => <g key={k}>
        {Array.from({ length: 6 }, (_, j) => <rect key={j} x={x! + 8 + j * 16} y={y} width="9" height="44" fill="#ffcf8a" opacity={0.16 + (j % 3) * 0.06} />)}
        <rect x={x!} y={y! - 10} width="110" height="5" fill="#1b141e" />
      </g>)}
      <path d="M0 290h1200v10H0z" fill="#1b141e" />
    </svg>
    <div className="hm-lanterns">{Array.from({ length: 7 }, (_, i) => <Lantern key={i} i={i} label={i % 3 === 1 ? '花' : undefined} />)}</div>
    <div className="hm-petals">{Array.from({ length: 12 }, (_, i) => <i key={i} style={{ '--i': i } as CSSProperties} />)}</div>
  </div>;
}

/** Landing / lobby art: three geishas behind a row of their items. */
export function TeahouseArt() {
  return <div className="hm-art">
    <div className="hm-art-row">{[6, 3, 0].map(g => <div key={g} className="hm-art-geisha" style={geishaStyle(g)}><GeishaPortrait geisha={g} /></div>)}</div>
    <div className="hm-art-items">{GEISHAS.map((_, g) => <span key={g} style={geishaStyle(g)}><ItemGlyph geisha={g} size={22} /></span>)}</div>
  </div>;
}
