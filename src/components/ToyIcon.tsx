import { useId } from 'react'

export interface ToyIconProps {
  type?: string | number
  color?: 'blue' | 'red' | string
  size?: number
  className?: string
}

function toyVariant(type: string | number) {
  if (typeof type === 'number') return Math.max(0, Math.min(11, Math.floor(type)))
  const value = type.toLowerCase()
  const types: Record<string, number> = { duck: 0, skeleton: 1, captain: 2, giant: 3, pirate: 4, robot: 5, unicorn: 6, dino: 7, ninja: 8, sapper: 9, knight: 10, bomb: 11 }
  return types[value] ?? 2
}

/** Original little wooden-toy portraits, shared by the board and troop cards. */
export function ToyIcon({ type = 'captain', color = 'blue', size = 56, className = '' }: ToyIconProps) {
  const uniqueId = useId().replaceAll(':', '')
  const variant = toyVariant(type)
  const isRed = color === 'red' || color === 'coral'
  const main = isRed ? '#b6573e' : '#446c97'
  const dark = isRed ? '#733827' : '#264864'
  const light = isRed ? '#dc8d68' : '#89acbf'
  const ivory = '#f5e9c8'
  const ink = '#343a38'
  const skin = '#d7aa7b'

  return (
    <svg className={`toy-icon ${className}`} width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={`${uniqueId}-body`} x1="30" y1="50" x2="75" y2="95" gradientUnits="userSpaceOnUse">
          <stop stopColor={light} />
          <stop offset=".4" stopColor={main} />
          <stop offset="1" stopColor={dark} />
        </linearGradient>
      </defs>
      <ellipse cx="51" cy="91" rx="32" ry="5" fill="#222b23" opacity=".15" />
      <path d="M31 79h15v12H29a3 3 0 0 1-3-3v-2a7 7 0 0 1 5-7ZM56 79h14a7 7 0 0 1 5 7v2a3 3 0 0 1-3 3H56V79Z" fill={dark} />
      <path d="M28 58a13 13 0 0 1 13-10h18a13 13 0 0 1 13 10l6 21-14 5H36l-14-5 6-21Z" fill={`url(#${uniqueId}-body)`} stroke={dark} strokeWidth="2" />
      <path d="M34 64v18m31-18v18" stroke={dark} strokeWidth="2" opacity=".7" />
      <path d="M45 57h10v24H45z" fill={ivory} opacity=".85" />
      <circle cx="50" cy="65" r="2" fill={main} />
      <circle cx="50" cy="73" r="2" fill={main} />
      <path d="M33 79h34v7H33z" fill={dark} />
      <rect x="46" y="78" width="9" height="9" rx="1.5" fill="#dab657" />
      {variant === 0 && <>
        <path d="M27 30C27 13 37 8 52 8s24 10 24 25v15c0 13-10 18-25 18S27 59 27 47V30Z" fill="#e5b94e" stroke="#967b3d" strokeWidth="2" />
        <path d="M30 21C35 8 43 8 53 8c9 0 15 4 19 11l-42 2Z" fill={main} />
        <path d="M27 21h48" stroke={dark} strokeWidth="6" strokeLinecap="round" />
        <circle cx="42" cy="35" r="3" fill={ink} />
        <circle cx="64" cy="35" r="3" fill={ink} />
        <path d="M40 44c3-8 28-7 30 0l-3 8H42l-2-8Z" fill="#c5773d" stroke="#96633a" strokeWidth="2" />
        <path d="M42 45h27" stroke="#96633a" strokeWidth="2" />
        <path d="M31 34c0-6 2-9 5-11" stroke="#f3d88b" strokeWidth="3" strokeLinecap="round" />
      </>}
      {variant === 1 && <>
        <path d="M29 24c0-13 42-13 42 0v18c0 9-9 17-21 17s-21-8-21-17V24Z" fill={ivory} stroke={ink} strokeWidth="2" />
        <path d="m26 25 5-11 9-2 2-6h16l3 6 9 2 5 11H26Z" fill={main} stroke={dark} strokeWidth="2" />
        <path d="M25 25h50v5H25z" fill={dark} />
        <ellipse cx="40" cy="38" rx="6" ry="7" fill={ink} />
        <ellipse cx="60" cy="38" rx="6" ry="7" fill={ink} />
        <path d="m50 42-4 6h8l-4-6Z" fill={ink} />
        <path d="M40 51h20m-15-3v7m10-7v7" stroke={ink} strokeWidth="2" strokeLinecap="round" />
      </>}
      {variant === 2 && <>
        <path d="M30 25h40v17c0 12-8 19-20 19s-20-7-20-19V25Z" fill={skin} stroke={dark} strokeWidth="2" />
        <path d="M25 27C25 9 35 6 50 6s25 8 25 21H25Z" fill={main} stroke={dark} strokeWidth="2" />
        <path d="M43 7v18M57 7v18" stroke={light} strokeWidth="6" />
        <rect x="24" y="25" width="52" height="8" rx="4" fill={dark} />
        <path d="M29 32v15m42-15v15" stroke={main} strokeWidth="6" strokeLinecap="round" />
        <rect x="32" y="31" width="16" height="12" rx="5" fill="#ebdbaf" stroke={dark} strokeWidth="3" />
        <rect x="52" y="31" width="16" height="12" rx="5" fill="#ebdbaf" stroke={dark} strokeWidth="3" />
        <path d="M47 36h6m-9 14c4 3 8 3 12 0" stroke={dark} strokeWidth="2" strokeLinecap="round" />
        <path d="M35 58h32l-9 9-23-9Z" fill="#d7b74f" />
        <path d="m61 61 16 2-10 10-6-12Z" fill="#d7b74f" />
      </>}
      {variant === 4 && <>
        <path d="M29 28c0-12 42-12 42 0v20c0 10-10 15-21 15s-21-5-21-15V28Z" fill={skin} stroke={dark} strokeWidth="2" />
        <path d="M21 26c6-5 7-9 5-14 11 2 17-6 24-6s13 8 24 6c-2 5-1 9 5 14l-29 5-29-5Z" fill={dark} stroke={ink} strokeWidth="2" />
        <path d="M23 25h54" stroke="#d8b65c" strokeWidth="4" strokeLinecap="round" />
        <path d="m50 12 2 4 5 1-4 3 1 5-4-2-4 2 1-5-4-3 5-1 2-4Z" fill={ivory} />
        <circle cx="39" cy="38" r="3" fill={ink} />
        <path d="M55 34h12v6a6 6 0 0 1-12 0v-6Z" fill={ink} />
        <path d="m29 30 36 9" stroke={ink} strokeWidth="2" />
        <path d="M36 48c6-10 10 0 14 0s8-10 14 0c-4 5-9 6-14 2-5 4-10 3-14-2Z" fill="#69503a" />
        <path d="M44 55h12" stroke={ink} strokeWidth="2" strokeLinecap="round" />
        <circle cx="72" cy="44" r="5" stroke="#e3bd5e" strokeWidth="3" />
      </>}
      {variant === 5 && <>
        <path d="M48 10V3m-5 0h10" stroke={dark} strokeWidth="3" strokeLinecap="round" />
        <rect x="25" y="13" width="49" height="47" rx="10" fill={light} stroke={dark} strokeWidth="3" />
        <path d="M26 25h47V17a5 5 0 0 0-5-5H31a5 5 0 0 0-5 5v8Z" fill={main} />
        <rect x="20" y="27" width="7" height="20" rx="3" fill={dark} />
        <rect x="73" y="27" width="7" height="20" rx="3" fill={dark} />
        <rect x="32" y="29" width="13" height="11" rx="3" fill={ivory} />
        <rect x="54" y="29" width="13" height="11" rx="3" fill={ivory} />
        <circle cx="39" cy="35" r="3" fill={dark} />
        <circle cx="60" cy="35" r="3" fill={dark} />
        <rect x="35" y="47" width="29" height="7" rx="2" fill={dark} />
        <path d="M42 47v7m8-7v7m7-7v7" stroke={ivory} strokeWidth="2" />
        <circle cx="33" cy="19" r="2" fill={ivory} />
        <circle cx="66" cy="19" r="2" fill={ivory} />
      </>}
      {variant === 3 && <>
        <path d="M22 27c0-17 56-17 56 0v23c0 12-12 17-28 17S22 62 22 50V27Z" fill={skin} stroke={dark} strokeWidth="2" />
        <path d="M20 28v-8C20 4 79 4 79 20v8H20Z" fill={main} stroke={dark} strokeWidth="2" />
        <path d="M45 8h10v20H45z" fill={light} />
        <path d="M18 27h64v7H18z" fill={dark} />
        <path d="m32 38 11 2m14 0 11-2" stroke={ink} strokeWidth="4" strokeLinecap="round" />
        <circle cx="39" cy="43" r="2.5" fill={ink} />
        <circle cx="61" cy="43" r="2.5" fill={ink} />
        <path d="M35 53c5-7 11-5 15-1 4-4 10-6 15 1l-15 7-15-7Z" fill="#776049" />
        <path d="M41 56h18" stroke={ivory} strokeWidth="3" strokeLinecap="round" />
        <path d="M22 58 13 70l11 10 14-16m40-6 9 12-11 10-14-16" fill={main} stroke={dark} strokeWidth="2" />
      </>}
      {variant === 6 && <>
        <path d="M38 20 27 8l-3 26m39-14L75 8l1 27" fill={ivory} stroke={dark} strokeWidth="2" />
        <path d="M29 31c0-16 43-16 43 0v14c0 16-7 21-21 21s-22-5-22-21V31Z" fill={ivory} stroke={dark} strokeWidth="2" />
        <path d="M27 40c-15-2-15 14-6 22-4 7 0 16 13 16l3-21-10-17Z" fill={light} stroke={dark} strokeWidth="2" />
        <path d="M67 36c15 2 15 14 9 23 6 12-2 19-12 17l1-21 2-19Z" fill={main} stroke={dark} strokeWidth="2" />
        <path d="m45 24 6-22 8 23" fill="#dbb655" stroke="#ae8b40" strokeWidth="2" />
        <path d="m49 14 7 3m-9 4 11 3" stroke="#f4dda0" strokeWidth="2" />
        <path d="M30 28c5-14 36-16 42 0-9-4-16-3-22 5-5-8-12-9-20-5Z" fill={light} />
        <path d="m35 39 8 2m16 0 8-2" stroke={ink} strokeWidth="2" strokeLinecap="round" />
        <ellipse cx="51" cy="53" rx="15" ry="10" fill="#e2cbaa" />
        <circle cx="44" cy="53" r="2" fill={dark} />
        <circle cx="58" cy="53" r="2" fill={dark} />
      </>}
      {variant === 8 && <>
        <path d="M29 26c0-15 42-15 42 0v20c0 12-9 19-21 19S29 58 29 46V26Z" fill={dark} stroke={ink} strokeWidth="2" />
        <path d="M31 33h38v10H31z" fill={skin} />
        <path d="M31 33h38" stroke={ink} strokeWidth="2" opacity=".5" />
        <ellipse cx="41" cy="38" rx="3.5" ry="3" fill={ink} />
        <ellipse cx="59" cy="38" rx="3.5" ry="3" fill={ink} />
        <path d="m35 33 5 2m20-2-5 2" stroke={ink} strokeWidth="2" strokeLinecap="round" />
        <path d="M30 24h40v5H30z" fill={main} />
        <path d="M69 24c8-4 14 2 18 8-6-1-10 1-13 4l-5-12Z" fill={main} stroke={dark} strokeWidth="1.5" />
        <path d="M45 10h10v6H45z" fill={light} opacity=".6" />
      </>}
      {variant === 9 && <>
        <path d="M30 30h40v14c0 11-9 19-20 19S30 55 30 44V30Z" fill={skin} stroke={dark} strokeWidth="2" />
        <path d="M24 30c0-16 11-24 26-24s26 8 26 24H24Z" fill="#e0b64a" stroke="#9a7a2c" strokeWidth="2" />
        <path d="M45 8h10v14H45z" fill="#f0cf6f" />
        <path d="M21 29h58v6H21z" fill="#c99a33" stroke="#9a7a2c" strokeWidth="1.5" />
        <circle cx="41" cy="42" r="2.5" fill={ink} />
        <circle cx="59" cy="42" r="2.5" fill={ink} />
        <path d="M38 52c4-5 20-5 24 0" stroke="#6b4b2c" strokeWidth="4" strokeLinecap="round" />
        <path d="M63 58c6-3 11 2 10 9-4-1-6 3-9 6l-1-15Z" fill="#8d8d95" stroke={ink} strokeWidth="1.5" />
        <circle cx="36" cy="36" r="4" stroke={dark} strokeWidth="2" />
      </>}
      {variant === 10 && <>
        <path d="M27 26c0-16 46-16 46 0v20c0 13-10 21-23 21S27 59 27 46V26Z" fill="#c9ccd3" stroke={dark} strokeWidth="2" />
        <path d="M27 26c0-16 46-16 46 0v3H27v-3Z" fill="#a7abb4" />
        <path d="M33 34h34v5H33z" fill={ink} />
        <path d="M50 39v12" stroke={ink} strokeWidth="2" />
        <path d="M33 47h34" stroke={dark} strokeWidth="1.5" opacity=".6" />
        <circle cx="42" cy="36.5" r="1.6" fill={ivory} />
        <circle cx="58" cy="36.5" r="1.6" fill={ivory} />
        <path d="M50 12c-2-8 4-12 9-9-3 3-3 6 0 9 4-2 9 0 8 6-6-1-11 1-14 6-3-5-8-8-14-6 0-6 5-8 11-6Z" fill={main} stroke={dark} strokeWidth="1.5" />
        <path d="M45 8v18" stroke={dark} strokeWidth="2" />
      </>}
      {variant === 11 && <>
        <circle cx="50" cy="38" r="24" fill="#3a3d45" stroke={ink} strokeWidth="2" />
        <path d="M36 26c4-6 12-8 18-6" stroke="#6a6e7a" strokeWidth="4" strokeLinecap="round" />
        <path d="M44 14h12v5H44z" fill="#6a6e7a" stroke={ink} strokeWidth="1.5" />
        <path d="M50 14c1-5-3-6-1-11" stroke="#8a6a3a" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        <path d="m49 3 3-3 1 3 3 1-3 2v3l-3-2-3 1 1-3-2-2h3Z" fill="#f2b23c" />
        <circle cx="42" cy="38" r="3" fill={ivory} />
        <circle cx="58" cy="38" r="3" fill={ivory} />
        <path d="M43 48c4 3 10 3 14 0" stroke={ivory} strokeWidth="2" strokeLinecap="round" />
        <path d="M31 34c2-6 6-10 11-12" stroke="#5a5e6a" strokeWidth="2" strokeLinecap="round" opacity=".7" />
      </>}
      {variant === 7 && <>
        <path d="m31 28-8-6 5-10 10 2 8-10 10 9 13-3 5 12 9 5-10 8" fill={dark} stroke={dark} strokeWidth="2" />
        <path d="M29 28c0-15 44-17 44-2v12l8 5v17c0 10-12 15-26 15S25 67 25 58V44l4-16Z" fill={main} stroke={dark} strokeWidth="2" />
        <path d="M32 29c2-8 9-12 16-13" stroke={light} strokeWidth="4" strokeLinecap="round" />
        <path d="m36 34 11 3m12 0 9-3" stroke={dark} strokeWidth="3" strokeLinecap="round" />
        <circle cx="43" cy="39" r="3" fill={ivory} />
        <circle cx="63" cy="39" r="3" fill={ivory} />
        <circle cx="43" cy="39" r="1.5" fill={ink} />
        <circle cx="63" cy="39" r="1.5" fill={ink} />
        <path d="M32 49h43v13c-11 8-29 7-43-1V49Z" fill={dark} />
        <path d="m36 49 3 7 5-7m8 0 4 8 4-8m5 0 5 7 3-7M40 64l4-6 4 7m10 0 3-7 5 6" fill={ivory} />
        <circle cx="69" cy="45" r="2" fill={dark} />
      </>}
    </svg>
  )
}

export default ToyIcon
