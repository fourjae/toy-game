import { Flame, Handshake, Leaf, Mountain, Pyramid, Waves, type LucideIcon } from 'lucide-react';
import { SITE_INFO, type LCCard, type Site } from '../shared/lostCities';

export const SITE_ICON: Record<Site, LucideIcon> = { pompeii: Flame, amazon: Leaf, himalaya: Mountain, atlantis: Waves, egypt: Pyramid };

/** Flat scenery for the lower half of a full-size card. Dark and light overlays pick up each site's own colour. */
function SiteArt({ site }: { site: Site }) {
  const dark = 'rgba(40,12,6,.34)';
  const mid = 'rgba(40,12,6,.2)';
  const light = 'rgba(255,255,255,.42)';
  return <svg className="lc-card-art" viewBox="0 0 100 64" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    {site === 'pompeii' && <>
      <circle cx="50" cy="14" r="13" fill="rgba(255,214,120,.5)" />
      <path d="M0 64V50l20-6 16-8 8-14h12l8 14 16 8 20 6v14z" fill={dark} />
      <path d="M44 22h12l-2 6h-8z" fill="rgba(255,150,60,.85)" />
      <path d="M36 36l8-14h12l8 14-14-4z" fill={mid} />
      <g fill={light}><rect x="8" y="46" width="4" height="14" /><rect x="15" y="44" width="4" height="16" /><rect x="82" y="45" width="4" height="15" /><rect x="89" y="47" width="4" height="13" /></g>
      <path d="M52 8c4-4 9-3 9 1s-5 5-8 3" fill="none" stroke={light} strokeWidth="2" strokeLinecap="round" />
    </>}
    {site === 'amazon' && <>
      <path d="M0 64V44c10-8 18 0 26-8 8 8 14 2 24 10 10-8 18-2 26-10 8 8 16 2 24 8v20z" fill={dark} />
      <path d="M18 64V40M52 64V30M84 64V38" stroke={mid} strokeWidth="3" />
      <g fill={light}>
        <path d="M18 40c-8-2-14-8-14-14 8 0 14 5 14 14zM18 40c8-2 14-8 14-14-8 0-14 5-14 14z" />
        <path d="M52 30c-9-2-16-9-16-16 9 0 16 6 16 16zM52 30c9-2 16-9 16-16-9 0-16 6-16 16z" />
        <path d="M84 38c-7-2-12-7-12-12 7 0 12 4 12 12zM84 38c7-2 12-7 12-12-7 0-12 4-12 12z" />
      </g>
    </>}
    {site === 'himalaya' && <>
      <path d="M0 64V40l16-16 12 12 22-30 24 34 10-10 16 16v18z" fill={dark} />
      <path d="M0 64V52l18-14 14 10 18-18 20 22 12-8 18 14v4z" fill={mid} />
      <path d="M50 6l9 12-5-2-4 4-4-4-5 2z" fill={light} />
      <path d="M16 24l5 6-3-1-2 2-2-2-3 1z" fill={light} />
    </>}
    {site === 'atlantis' && <>
      <path d="M0 18q12-8 25 0t25 0 25 0 25 0v46H0z" fill={mid} />
      <path d="M0 34q12-8 25 0t25 0 25 0 25 0v30H0z" fill={dark} />
      <g fill={light}><rect x="22" y="36" width="5" height="20" /><rect x="33" y="40" width="5" height="16" /><rect x="64" y="38" width="5" height="18" /><path d="M42 56a12 12 0 0 1 24 0z" opacity=".7" /></g>
      <g fill="none" stroke={light} strokeWidth="1.4"><circle cx="14" cy="26" r="2" /><circle cx="86" cy="22" r="1.6" /><circle cx="90" cy="32" r="2.2" /></g>
    </>}
    {site === 'egypt' && <>
      <circle cx="78" cy="16" r="9" fill="rgba(255,246,200,.75)" />
      <path d="M0 64V52c14-6 22-6 34 0 12-8 24-8 34 0 10-4 20-4 32 0v12z" fill={mid} />
      <path d="M12 56L40 20l28 36z" fill={dark} />
      <path d="M40 20l28 36H40z" fill="rgba(40,12,6,.18)" />
      <path d="M62 56l18-22 20 22z" fill={dark} />
    </>}
  </svg>;
}

interface CardFaceProps {
  card: LCCard;
  /** Marks the card the opponent just laid down. */
  recent?: boolean;
  zone?: string;
}

/** `data-card-id` and `data-zone` are what the flight animation measures. */
export function CardFace({ card, recent = false, zone }: CardFaceProps) {
  const Icon = SITE_ICON[card.site];
  const handshake = card.value === 0;
  const corner = handshake ? <Handshake size="1em" strokeWidth={2.4} /> : card.value;
  const className = `lc-card lc-card--hand site-${card.site} ${handshake ? 'is-handshake' : ''} ${recent ? 'is-recent' : ''}`;
  return <span className={className} data-card-id={card.id} data-zone={zone}>
    <span className="lc-card-panel">
      <SiteArt site={card.site} />
      <b className="lc-card-corner">{corner}</b>
      {handshake
        ? <span className="lc-card-seal"><Handshake strokeWidth={1.6} /><i>투자</i></span>
        : <span className="lc-card-num">{card.value}</span>}
      <b className="lc-card-corner lc-card-corner--end">{corner}</b>
      <span className="lc-card-name"><Icon size="1em" strokeWidth={2} />{SITE_INFO[card.site].name}</span>
    </span>
  </span>;
}

/** A face-down card; the size comes from --bh on the element or its parent. */
export function CardBack({ mini = false }: { mini?: boolean }) {
  return <span className={`lc-back ${mini ? 'lc-back--mini' : ''}`} aria-hidden="true"><i /></span>;
}
