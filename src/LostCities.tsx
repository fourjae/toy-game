import './lostCities.css';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import {
  ArrowLeft, ArrowRight, Check, ChevronRight, Clock3, Copy, HelpCircle, History, Layers,
  LayoutGrid, LogOut, Medal, Mountain, Plus, Pyramid, RotateCw, Users, WifiOff, X,
} from 'lucide-react';
import { useGame } from './useGame';
import { useCardFlight } from './useCardFlight';
import { CardBack, CardFace, SITE_ICON } from './lostCitiesCards';
import Dialog from './components/Dialog';
import CountUp from './duel/CountUp';
import {
  HAND_SIZE, SITES, SITE_INFO, scoreExpedition,
  type DrawSource, type LCCard, type LCView, type Site,
} from '../shared/lostCities';
import type { LCClientState, LCRoomView } from '../server/types';

const EMPTY_STATE: LCClientState = { me: null, rooms: [], room: null };
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');
const scoreTone = (n: number) => (n > 0 ? 'pos' : n < 0 ? 'neg' : 'zero');

/* ---------- decoration ---------- */

function FallingLeaves() {
  return <div className="lc-leaves" aria-hidden="true">{Array.from({ length: 9 }, (_, i) => <i key={i} style={{ '--i': i } as CSSProperties} />)}</div>;
}

function CardFan() {
  const cards: LCCard[] = [
    { id: 'f1', site: 'pompeii', value: 6 }, { id: 'f2', site: 'amazon', value: 0 }, { id: 'f3', site: 'himalaya', value: 9 },
    { id: 'f4', site: 'atlantis', value: 4 }, { id: 'f5', site: 'egypt', value: 8 },
  ];
  return <div className="lc-fan" aria-hidden="true">{cards.map((card, i) => <div key={card.id} style={{ '--k': i - 2 } as CSSProperties}><CardFace card={card} /></div>)}</div>;
}

function SiteLegend() {
  return <ul className="lc-site-legend">{SITES.map(site => {
    const Icon = SITE_ICON[site];
    return <li key={site} className={`site-${site}`}><Icon size={14} />{SITE_INFO[site].name}</li>;
  })}</ul>;
}

/* ---------- rules ---------- */

function RulesDialog({ onClose }: { onClose: () => void }) {
  return <Dialog title="탐험을 떠나기 전에" onClose={onClose} wide>
    <div className="lc-rules">
      <div className="lc-rules-intro">
        <span className="eyebrow">로스트 시티 · 2인 · 라이너 크니치아</span>
        <p>다섯 유적지에서 탐험을 이어 가며,<br /><strong>가장 높은 점수</strong>를 얻는 사람이 이겨요.</p>
        <SiteLegend />
      </div>
      <div className="lc-rules-steps">
        <div><span>01</span><h3>카드 한 장 내기</h3><p>손에서 한 장을 골라 <b>내 탐험에 놓거나</b>, 같은 색 <b>버린 더미</b>에 버려요.</p></div>
        <div><span>02</span><h3>카드 한 장 뽑기</h3><p><b>카드 더미</b> 맨 위나 <b>버린 더미</b> 맨 위에서 한 장 뽑아 손을 다시 8장으로 채워요.</p></div>
        <div><span>03</span><h3>더미가 바닥나면 끝</h3><p>카드 더미의 마지막 한 장을 뽑는 순간 그 라운드가 바로 끝나요.</p></div>
      </div>
      <h3 className="lc-rules-title">탐험에 카드를 놓는 법</h3>
      <ul className="lc-rules-list">
        <li>같은 유적지 카드끼리 한 줄로 이어요. 유적지마다 내 탐험이 하나씩 있어요.</li>
        <li><b>숫자는 계속 커져야</b> 해요. 이미 놓은 마지막 숫자보다 큰 카드만 이어 놓을 수 있고, 같은 숫자도 안 돼요. 중간을 건너뛰는 건 괜찮아요.</li>
        <li><b>악수 카드</b>(투자)는 그 탐험에 숫자 카드를 놓기 <b>전에만</b> 낼 수 있어요. 최대 3장이고, 점수를 곱해 줘요.</li>
        <li>한 번 놓은 카드는 되돌리거나 옮길 수 없어요.</li>
        <li>버린 더미는 둘이 같이 써요. 맨 위 카드만 가져올 수 있고, <b>방금 내가 버린 카드는 바로 도로 뽑을 수 없어요.</b></li>
      </ul>
      <h3 className="lc-rules-title">점수 계산</h3>
      <div className="lc-score-rules">
        <div><strong>−20</strong><p>탐험을 시작하면 비용 20점을 먼저 내요. 한 장도 안 놓은 유적지는 0점이에요.</p></div>
        <div><strong>＋숫자</strong><p>놓은 숫자 카드를 모두 더해요. 합이 20을 넘어야 이득이에요.</p></div>
        <div><strong>×2 ×3 ×4</strong><p>악수 카드가 1장이면 ×2, 2장이면 ×3, 3장이면 ×4로 곱해요. 손해도 곱해지니 조심하세요.</p></div>
        <div><strong>＋20</strong><p>한 탐험에 카드를 8장 이상 놓으면 보너스 20점을 받아요.</p></div>
      </div>
      <p className="lc-rules-note">예) 악수 1장 + 숫자 3·5·8 → (16 − 20) × 2 = <b>−8점</b><br />예) 악수 2장 + 숫자 합 40 → (40 − 20) × 3 = <b>60점</b></p>
      <h3 className="lc-rules-title">3라운드 승부</h3>
      <p className="lc-rules-note">정식 규칙은 세 라운드의 점수를 더해 승부를 가려요. 방을 만들 때 1판만 하는 것도 고를 수 있어요. 다음 라운드는 직전 라운드 점수가 낮은 쪽이 먼저 시작해요. 합계가 같으면 무승부예요.</p>
      <h3 className="lc-rules-title">이렇게 해 보세요</h3>
      <ul className="lc-rules-list">
        <li>손에 있는 카드로 어느 유적지를 갈지 일찍 정하면 좋아요. 모든 곳에 손대면 −20이 줄줄이 쌓여요.</li>
        <li>내가 필요 없는 카드가 상대에게 필요한 카드일 수도 있어요. 버린 더미를 잘 보세요.</li>
        <li>카드 더미가 얼마 안 남았다면 새로 시작하기엔 늦었을 수 있어요.</li>
      </ul>
    </div>
  </Dialog>;
}

/* ---------- entry, lobby, waiting room ---------- */

function Landing({ onEnter, busy, connected, onRules, invite }: { onEnter: (name: string) => void; busy: boolean; connected: boolean; onRules: () => void; invite: string | null }) {
  const [name, setName] = useState('');
  function submit(e: FormEvent) { e.preventDefault(); if (name.trim()) onEnter(name.trim()); }
  return <main className="lc-landing lc-width">
    <div className="lc-landing-main">
      <section className="lc-landing-copy">
        <div className="eyebrow"><span className="tiny-line" /> 잊혀진 다섯 도시로</div>
        <h1>오늘,<br />탐험 한 판 <span className="serif-word">어때요?</span></h1>
        <p className="lc-intro">카드를 한 장씩 이어 놓으며 유적지를 파고들어요.<br />친구 한 명이면 떠날 준비 끝.</p>
        <form className="lc-form" onSubmit={submit}>
          <label htmlFor="lc-nickname">어떤 이름으로 불러드릴까요?</label>
          <div className="lc-input-action">
            <input id="lc-nickname" placeholder="이름을 입력해 주세요" maxLength={16} autoComplete="nickname" value={name} onChange={e => setName(e.target.value)} required />
            <button className="lc-button primary" disabled={!name.trim() || busy || !connected} type="submit">{busy ? '들어가는 중' : '떠나 보기'}<ArrowRight size={18} /></button>
          </div>
          <span className="lc-note">{invite ? `초대받은 방 ${invite}에 이름만 입력하고 들어가세요.` : '가입 없이, 이름만 있으면 돼요.'}</span>
        </form>
        <div className="lc-meta"><span><Users size={16} /> 2명</span><span><Clock3 size={16} /> 약 20분</span><button type="button" onClick={onRules}><HelpCircle size={16} /> 어떻게 하나요?</button></div>
      </section>
      <div className="lc-landing-art"><CardFan /><SiteLegend /><p>폼페이에서 이집트까지, 다섯 곳 중 어디를 파고들까?</p></div>
    </div>
  </main>;
}

function Lobby({ client, onRules }: { client: ReturnType<typeof useLC>; onRules: () => void }) {
  const { me, rooms, busy, send, connected } = client;
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [title, setTitle] = useState('');
  const [rounds, setRounds] = useState(3);
  const [code, setCode] = useState('');
  const [filter, setFilter] = useState<'waiting' | 'all'>('waiting');
  const shown = rooms.filter(r => filter === 'all' || r.canJoin);
  async function create(e: FormEvent) {
    e.preventDefault();
    if (await send('rooms:create', { title: title.trim() || `${me!.name}의 원정대`, rounds })) { setCreating(false); setTitle(''); }
  }
  async function join(e: FormEvent) {
    e.preventDefault();
    if (await send('rooms:join', { code: code.trim().toUpperCase() })) { setJoining(false); setCode(''); }
  }
  return <main className="lc-lobby lc-width">
    <div className="lc-lobby-heading">
      <div><div className="eyebrow"><span className="lc-dot" /> 플레이어 대기실</div><h1>반가워요, {me!.name}님<span className="lc-punct">.</span></h1><p>빈자리에 앉거나, 새 원정을 시작해 보세요.</p></div>
      <button className="lc-button primary" onClick={() => setCreating(true)}><Plus size={18} /> 방 만들기</button>
    </div>
    <div className="lc-lobby-grid">
      <section className="lc-panel lc-feature">
        <CardFan />
        <div className="lc-feature-note"><div><span className="eyebrow">LOST CITIES</span><h2>로스트 시티</h2><p>어디까지 갈지, 언제 멈출지.</p></div><button className="lc-round-arrow" onClick={onRules} aria-label="로스트 시티 게임 방법"><ArrowRight size={22} /></button></div>
        <div className="lc-facts"><span><Users size={15} /> 2인 대전</span><span><Clock3 size={15} /> 약 20분</span><span><Layers size={15} /> 카드 60장</span><span><Medal size={15} /> 3라운드 합산</span></div>
      </section>
      <section className="lc-panel lc-rooms">
        <div className="lc-rooms-top"><h2>열린 방 <span>{rooms.length}</span></h2><button className="lc-text-button" onClick={() => setJoining(true)}>코드로 입장 <ArrowRight size={14} /></button></div>
        <div className="lc-filters"><button className={filter === 'waiting' ? 'active' : ''} onClick={() => setFilter('waiting')}>기다리는 방</button><button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>모든 방</button></div>
        <div className="lc-room-list">
          {shown.map(r => <button key={r.id} className="lc-room-row" disabled={!r.canJoin || busy} onClick={() => send('rooms:join', { id: r.id })}>
            <span className="lc-room-icon"><Mountain size={20} /></span>
            <span className="lc-room-name"><strong>{r.title}</strong><span>{r.hostName} · {r.rounds}라운드</span></span>
            <span className={r.canJoin ? 'lc-badge open' : 'lc-badge'}>{r.canJoin ? '참가 가능' : r.phase === 'playing' ? '게임 중' : '자리 없음'}</span>
            <span className="lc-room-count"><Users size={13} />{r.playerCount}/2</span>
            {r.canJoin && <ChevronRight size={16} />}
          </button>)}
          {shown.length === 0 && <div className="lc-empty"><Pyramid size={40} strokeWidth={1.4} /><h3>{filter === 'all' ? '아직 펼쳐진 판이 없어요' : '아직 기다리는 방이 없어요'}</h3><p>첫 번째 방의 주인이 되어 보세요.</p><button className="lc-text-button" onClick={() => setCreating(true)}>우리 방 만들기 <ArrowRight size={14} /></button></div>}
        </div>
        <div className="lc-rooms-foot"><span className="lc-dot" /> 방 목록은 실시간으로 바뀌어요</div>
      </section>
    </div>
    {creating && <Dialog title="새 원정을 펼쳐요" onClose={() => setCreating(false)}>
      <form onSubmit={create} className="lc-dialog-form">
        <label htmlFor="lc-room-title">방 이름</label>
        <input id="lc-room-title" placeholder={`${me!.name}의 원정대`} maxLength={32} value={title} onChange={e => setTitle(e.target.value)} autoFocus />
        <RoundsPicker value={rounds} onChange={setRounds} />
        <button className="lc-button primary full" disabled={busy || !connected} type="submit">방 만들기 <ArrowRight size={18} /></button>
      </form>
    </Dialog>}
    {joining && <Dialog title="친구가 기다리고 있나요?" onClose={() => setJoining(false)}>
      <form onSubmit={join} className="lc-dialog-form">
        <label htmlFor="lc-invite-code">6자리 초대 코드</label>
        <input id="lc-invite-code" className="lc-code-input" autoCapitalize="characters" autoComplete="off" placeholder="ABC123" maxLength={6} value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} autoFocus />
        <button className="lc-button primary full" type="submit" disabled={code.length !== 6 || busy}>방 들어가기 <ArrowRight size={18} /></button>
      </form>
    </Dialog>}
  </main>;
}

function RoundsPicker({ value, onChange, disabled = false }: { value: number; onChange: (rounds: number) => void; disabled?: boolean }) {
  return <div className="lc-rounds" role="group" aria-label="라운드 수">
    <span>승부 방식</span>
    <div>{[3, 1].map(n => <button type="button" key={n} disabled={disabled} className={value === n ? 'active' : ''} aria-pressed={value === n} onClick={() => onChange(n)}>{n === 3 ? '3라운드 합산' : '1판 승부'}</button>)}</div>
    <small>{value === 3 ? '정식 규칙이에요. 세 판의 점수를 더해요. 약 20분.' : '한 판만 가볍게. 약 7분.'}</small>
  </div>;
}

function Waiting({ room, meId, client }: { room: LCRoomView; meId: string; client: ReturnType<typeof useLC> }) {
  const { busy, connected, send } = client;
  const [copied, setCopied] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const host = room.hostId === meId;
  async function copyInvite() {
    const url = new URL(window.location.href);
    url.search = '';
    url.searchParams.set('room', room.code);
    try { await navigator.clipboard.writeText(url.toString()); setCopied(true); setTimeout(() => setCopied(false), 2500); }
    catch { client.setError(`초대 코드는 ${room.code}예요. 친구에게 알려 주세요.`); }
  }
  return <main className="lc-waiting lc-width">
    <div className="lc-topline"><button className="lc-text-button" onClick={() => setLeaving(true)}><ArrowLeft size={15} /> 대기실로</button><span className="eyebrow">ROOM {room.code}</span></div>
    <div className="lc-waiting-heading"><span className="eyebrow">자, 자리를 잡아 볼까요?</span><h1>{room.title}</h1><p>{room.players.length === 2 ? '둘 다 모였네요. 이제 출발해 볼까요?' : '한 자리 비워 뒀어요. 같이 떠날 친구를 불러 주세요.'}</p></div>
    <div className="lc-waiting-grid">
      <section className="lc-panel lc-feature"><CardFan /><SiteLegend /></section>
      <section className="lc-panel lc-seats">
        <div className="lc-panel-label"><h2>오늘의 탐험가</h2><span>{room.players.length} / 2</span></div>
        {[0, 1].map(i => {
          const p = room.players[i];
          return <div key={i} className={`lc-seat ${p ? 'filled' : ''}`}>
            <div className={`lc-avatar a${i}`}>{p ? p.name.slice(0, 1) : <Plus size={22} />}</div>
            <div><strong>{p ? p.name : '친구를 기다리는 중'}{p?.id === meId && <small>나</small>}</strong><span>{p ? `${p.isHost ? '방장 · ' : ''}${p.connected ? '준비됐어요' : '다시 연결하는 중'}` : '초대 링크를 보내 보세요'}</span></div>
            {p && <span className={`lc-ready ${p.connected ? '' : 'off'}`}>{p.connected ? <Check size={16} /> : <WifiOff size={16} />}</span>}
          </div>;
        })}
        <div className="lc-invite"><div><span>친구에게 이 코드를 알려 주세요</span><strong>{room.code}</strong></div><button className="lc-button secondary compact" onClick={copyInvite}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? '복사했어요' : '초대 링크'}</button></div>
        <RoundsPicker value={room.rounds} disabled={!host || busy || !connected} onChange={rounds => void send('rooms:rounds', { rounds })} />
        <button className="lc-button primary full" disabled={busy || !connected || room.players.length !== 2 || room.players.some(p => !p.connected) || !host} onClick={() => send('game:start')}>
          {!host ? '방장이 시작하기를 기다리는 중' : room.players.length < 2 ? '친구가 오면 시작할 수 있어요' : '탐험 시작'}<ArrowRight size={18} />
        </button>
        {room.notice && <p className="lc-notice">{room.notice}</p>}
      </section>
    </div>
    {leaving && <Dialog title="이 방에서 나갈까요?" onClose={() => setLeaving(false)}>
      <p className="lc-dialog-copy">나가면 대기실에서 새 방을 만들거나 다른 방에 들어갈 수 있어요.</p>
      <div className="lc-dialog-buttons"><button className="lc-button secondary" onClick={() => setLeaving(false)}>계속 있을게요</button><button className="lc-button primary" disabled={busy} onClick={async () => { if (await send('rooms:leave')) { setLeaving(false); window.history.replaceState({}, '', window.location.pathname); } }}>나가기 <LogOut size={15} /></button></div>
    </Dialog>}
  </main>;
}

/* ---------- the table ---------- */

const sortHand = (hand: LCCard[]) =>
  [...hand].sort((a, b) => SITES.indexOf(a.site) - SITES.indexOf(b.site) || a.value - b.value || a.id.localeCompare(b.id));

function GameTable({ room, meId, client }: { room: LCRoomView; meId: string; client: ReturnType<typeof useLC> }) {
  const view = room.game!;
  const { busy, send } = client;
  const tableRef = useRef<HTMLElement>(null);
  const recent = useCardFlight(tableRef, view, meId);
  const [selected, setSelected] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [inspect, setInspect] = useState<Site | null>(null);
  const [rotateDismissed, setRotateDismissed] = useState(false);
  const [resultHidden, setResultHidden] = useState(false);
  const mine = view.currentPlayerId === meId && view.status === 'playing';
  const oppId = view.opponentId;
  const oppName = room.players.find(p => p.id === oppId)?.name ?? '상대';
  const myName = room.players.find(p => p.id === meId)?.name ?? '나';
  const hand = useMemo(() => sortHand(view.hand), [view.hand]);
  const card = hand.find(c => c.id === selected) ?? null;
  const drawing = mine && view.phase === 'draw';
  const playing = mine && view.phase === 'play';
  useEffect(() => { setSelected(null); }, [view.revision]);
  useEffect(() => { setResultHidden(false); }, [view.status, view.round]);

  const canLay = Boolean(playing && card && view.playable[card.id]);
  async function lay(site: Site) {
    if (!playing || !card || card.site !== site || busy) return;
    if (!view.playable[card.id]) { client.setError('이 탐험에는 더 큰 숫자만 이어서 놓을 수 있어요.'); return; }
    await send('game:action', { type: 'play', cardId: card.id });
  }
  async function pile(site: Site) {
    if (busy) return;
    if (playing && card && card.site === site) await send('game:action', { type: 'discard', cardId: card.id });
    else if (drawing && view.drawable.includes(site)) await send('game:action', { type: 'draw', from: site satisfies DrawSource });
    else setInspect(site);
  }
  const last = view.log.at(-1);
  const lastByOpp = last && last.playerId === oppId ? last.text : '';
  const hint = view.status !== 'playing' ? '라운드가 끝났어요.'
    : !mine ? `${oppName}님이 생각하는 중.${lastByOpp ? ` 방금 ${lastByOpp}` : ''}`
      : drawing ? '카드 더미나 버린 더미에서 한 장 뽑아요.'
        : !card ? '손에서 카드를 골라 주세요.'
          : canLay ? '아래쪽 칸을 눌러 놓거나, 가운데 더미에 버려요.'
            : '탐험에 이을 수 없는 카드예요. 가운데 더미에 버려요.';

  const half = (id: string, own: boolean, site: Site) => {
    const cards = view.expeditions[id]![site];
    const score = view.siteScores[id]![site];
    const target = own && canLay && card?.site === site;
    const Icon = SITE_ICON[site];
    const className = `lc-half ${own ? 'lc-half--mine' : 'lc-half--opp'} ${target ? 'is-target' : ''}`;
    const label = `${SITE_INFO[site].name} ${own ? '내' : '상대'} 탐험, ${cards.length}장${target ? ', 눌러서 놓기' : ''}`;
    return <button type="button" className={className} style={{ '--n': cards.length } as CSSProperties} disabled={busy} aria-label={label}
      onClick={() => { if (target) void lay(site); else setInspect(site); }}>
      {cards.length === 0 && <span className="lc-slot"><Icon size="40%" strokeWidth={1.4} />{target && <em>놓기</em>}</span>}
      {cards.map(c => <CardFace key={c.id} card={c} zone={`${own ? 'mine' : 'opp'}-${site}`} recent={recent.includes(c.id)} />)}
      {cards.length > 0 && <span className={`lc-lane-score ${scoreTone(score)}`}>{signed(score)}</span>}
    </button>;
  };

  const discardCell = (site: Site) => {
    const stack = view.discards[site];
    const top = stack.at(-1);
    const Icon = SITE_ICON[site];
    const discardTarget = playing && card?.site === site;
    const drawTarget = drawing && view.drawable.includes(site);
    return <button type="button" className={`lc-pile ${discardTarget ? 'is-discard-target' : ''} ${drawTarget ? 'is-draw-target' : ''}`} disabled={busy} onClick={() => void pile(site)}
      aria-label={`${SITE_INFO[site].name} 버린 더미, ${stack.length}장${discardTarget ? ', 여기에 버리기' : drawTarget ? ', 여기서 뽑기' : ''}`}>
      <span className="lc-pile-label"><Icon size={12} /><span>{SITE_INFO[site].name}</span></span>
      <span className="lc-pile-slot">
        {top ? <CardFace card={top} zone={`pile-${site}`} recent={recent.includes(top.id)} /> : <span className="lc-pile-empty" />}
        {stack.length > 1 && <i className="lc-pile-count">{stack.length}</i>}
        {(discardTarget || drawTarget) && <em className="lc-pile-action">{discardTarget ? '버리기' : '뽑기'}</em>}
      </span>
    </button>;
  };

  const status = (id: string, name: string, own: boolean) => <div className={`lc-player ${own ? 'is-me' : ''} ${view.currentPlayerId === id && view.status === 'playing' ? 'is-turn' : ''}`}>
    <strong>{name}{own && <small>나</small>}</strong>
    <span className="lc-player-score">{signed(view.totals[id]!)}</span>
    {view.rounds > 1 && <span className="lc-player-match" title="지난 라운드까지의 합계"><Medal size={11} />{view.matchTotals[view.playerIds.indexOf(id)]}</span>}
    {!own && <span className="lc-opp-fan" data-anchor="opp-hand" title={`상대의 손패 ${view.opponentHandCount}장`}>{Array.from({ length: view.opponentHandCount }, (_, i) => <CardBack key={i} mini />)}<b className="lc-opp-count">×{view.opponentHandCount}</b></span>}
  </div>;

  const deckClickable = drawing && view.drawable.includes('deck') && !busy;
  const finishedDialog = view.status !== 'playing' && !resultHidden;
  return <main className="lc-game" ref={tableRef}>
    <header className="lc-topbar">
      <div className="lc-topbar-side lc-topbar-side--opp"><button className="lc-icon-btn" onClick={() => setLeaving(true)} aria-label="방 나가기"><ArrowLeft size={17} /></button>{status(oppId, oppName, false)}</div>
      <div className="lc-topbar-center">
        <button type="button" className={`lc-deck ${deckClickable ? 'is-draw-target' : ''}`} disabled={!deckClickable} onClick={() => void send('game:action', { type: 'draw', from: 'deck' })} aria-label={`카드 더미 ${view.deckCount}장${deckClickable ? ', 눌러서 뽑기' : ''}`}>
          <span className="lc-deck-stack" data-anchor="deck">{view.deckCount > 2 && <CardBack />}{view.deckCount > 1 && <CardBack />}{view.deckCount > 0 ? <CardBack /> : <span className="lc-back lc-back--empty" />}</span><b>{view.deckCount}</b>{deckClickable && <em>뽑기</em>}
        </button>
        <span className="lc-round">{view.rounds > 1 ? `${view.round} / ${view.rounds} 라운드` : '단판'}</span>
      </div>
      <div className="lc-topbar-side lc-topbar-side--me">{status(meId, myName, true)}<button className="lc-icon-btn" onClick={() => setShowLog(true)} aria-label="지난 차례 기록"><History size={17} /></button><button className="lc-icon-btn" onClick={() => setShowRules(true)} aria-label="게임 방법"><HelpCircle size={17} /></button></div>
    </header>
    <section className="lc-board" aria-label="유적지 탐험 판">
      {SITES.map(site => <div key={site} className={`lc-col site-${site}`}>{half(oppId, false, site)}{discardCell(site)}{half(meId, true, site)}</div>)}
    </section>
    <section className={`lc-hand ${mine ? 'is-mine' : ''}`}>
      <div className={`lc-status ${mine ? 'is-mine' : ''}`}><span className="lc-dot" /><strong>{view.status !== 'playing' ? '라운드 종료' : mine ? '내 차례' : '상대 차례'}</strong><span>{hint}</span></div>
      <div className="lc-hand-cards" role="group" aria-label={`내 손패 ${hand.length}/${HAND_SIZE}`}>
        {hand.map(c => <button key={c.id} type="button" className={`lc-hand-card ${selected === c.id ? 'selected' : ''} ${playing && !view.playable[c.id] ? 'is-dead' : ''}`}
          aria-pressed={selected === c.id} aria-label={`${SITE_INFO[c.site].name} ${c.value === 0 ? '악수 카드' : c.value}`} onClick={() => setSelected(selected === c.id ? null : c.id)} disabled={busy || view.status !== 'playing'}>
          <CardFace card={c} zone="hand" />
        </button>)}
      </div>
    </section>
    <div className={`lc-rotate ${rotateDismissed ? 'is-dismissed' : ''}`} role="status"><RotateCw size={34} /><strong>폰을 세로로 돌려 주세요</strong><span>토이 배틀처럼 세로 화면에서 카드가 가장 크게 보여요.</span><button className="lc-button secondary compact" onClick={() => setRotateDismissed(true)}>이대로 할게요</button></div>
    {finishedDialog && <ResultDialog room={room} view={view} meId={meId} client={client} onHide={() => setResultHidden(true)} />}
    {view.status !== 'playing' && resultHidden && <button className="lc-button primary lc-show-result" onClick={() => setResultHidden(false)}>결과 다시 보기</button>}
    {showLog && <Dialog title="지난 차례" onClose={() => setShowLog(false)}>
      <div className="lc-log">{[...view.log].reverse().map(entry => <div key={entry.id}><span className={entry.playerId === meId ? 'me' : 'opp'} /><p><strong>{entry.playerId === meId ? myName : oppName}</strong>{entry.text}</p><small>{entry.round}R</small></div>)}{!view.log.length && <p className="lc-dialog-copy">아직 아무도 움직이지 않았어요.</p>}</div>
    </Dialog>}
    {inspect && <Dialog title={`${SITE_INFO[inspect].name} 한눈에 보기`} onClose={() => setInspect(null)} wide>
      <div className="lc-inspect">
        {([[oppId, `${oppName}의 탐험`], [meId, '내 탐험']] as const).map(([id, title]) => <section key={id}>
          <h3>{title}<span className={scoreTone(view.siteScores[id]![inspect])}>{signed(view.siteScores[id]![inspect])}점</span></h3>
          <div className="lc-inspect-row">{view.expeditions[id]![inspect].map(c => <CardFace key={c.id} card={c} />)}{!view.expeditions[id]![inspect].length && <p>아직 놓은 카드가 없어요.</p>}</div>
        </section>)}
        <section>
          <h3>버린 더미<span>{view.discards[inspect].length}장 · 맨 오른쪽이 맨 위</span></h3>
          <div className="lc-inspect-row">{view.discards[inspect].map(c => <CardFace key={c.id} card={c} />)}{!view.discards[inspect].length && <p>아직 버린 카드가 없어요.</p>}</div>
        </section>
      </div>
    </Dialog>}
    {showRules && <RulesDialog onClose={() => setShowRules(false)} />}
    {leaving && <Dialog title="이 방에서 나갈까요?" onClose={() => setLeaving(false)}>
      <p className="lc-dialog-copy">{view.status === 'finished' ? '대기실로 돌아가요.' : '지금 나가면 진행 중인 게임이 끝나고 상대도 대기실로 돌아가요.'}</p>
      <div className="lc-dialog-buttons"><button className="lc-button secondary" onClick={() => setLeaving(false)}>계속 있을게요</button><button className="lc-button primary" disabled={busy} onClick={async () => { if (await send('rooms:leave')) { setLeaving(false); window.history.replaceState({}, '', window.location.pathname); } }}>나가기 <LogOut size={15} /></button></div>
    </Dialog>}
  </main>;
}

function ResultDialog({ room, view, meId, client, onHide }: { room: LCRoomView; view: LCView; meId: string; client: ReturnType<typeof useLC>; onHide: () => void }) {
  const { busy, send } = client;
  const oppId = view.opponentId;
  const name = (id: string) => room.players.find(p => p.id === id)?.name ?? '플레이어';
  const finished = view.status === 'finished';
  const voted = room.readyVotes.includes(meId);
  const oppOnline = room.players.find(p => p.id === oppId)?.connected;
  const oppVoted = room.readyVotes.includes(oppId);
  // 라운드 사이에 나가면 매치 전체가 끝나므로 한 번 더 묻는다.
  const [confirmLeave, setConfirmLeave] = useState(false);
  async function leave() {
    if (!finished && !confirmLeave) { setConfirmLeave(true); return; }
    if (await send('rooms:leave')) window.history.replaceState({}, '', window.location.pathname);
  }
  const myIndex = view.playerIds.indexOf(meId);
  const lastRound = view.roundScores.at(-1) ?? [0, 0];
  const myRound = lastRound[myIndex]!;
  const oppRound = lastRound[1 - myIndex]!;
  const title = !finished ? `${view.round}라운드 끝!` : view.winnerId === meId ? '이번 탐험은, 내 승리!' : view.winnerId ? '좋은 탐험이었어요.' : '막상막하, 무승부!';
  const headline = !finished ? (myRound === oppRound ? '이번 라운드는 동점이에요' : myRound > oppRound ? '이번 라운드는 내가 앞섰어요' : `이번 라운드는 ${name(oppId)}님이 앞섰어요`)
    : view.winnerId ? `${name(view.winnerId)}님의 승리` : '두 사람의 점수가 같아요';
  return <Dialog title={title} onClose={onHide} wide>
    <div className="lc-result">
      <h3>{headline}</h3>
      <table className="lc-result-table">
        <thead><tr><th>유적지</th><th>{name(meId)}<small>나</small></th><th>{name(oppId)}</th></tr></thead>
        <tbody>
          {SITES.map((site, i) => {
            const Icon = SITE_ICON[site];
            const mineCards = view.expeditions[meId]![site];
            const oppCards = view.expeditions[oppId]![site];
            return <tr key={site} className="lc-reveal" style={{ '--i': i } as CSSProperties}>
              <th className={`site-${site}`}><Icon size={13} />{SITE_INFO[site].name}</th>
              <td className={scoreTone(scoreExpedition(mineCards))}>{mineCards.length ? <>{signed(scoreExpedition(mineCards))}<small>{mineCards.length}장</small></> : '–'}</td>
              <td className={scoreTone(scoreExpedition(oppCards))}>{oppCards.length ? <>{signed(scoreExpedition(oppCards))}<small>{oppCards.length}장</small></> : '–'}</td>
            </tr>;
          })}
          <tr className="total lc-reveal" style={{ '--i': SITES.length } as CSSProperties}><th>이번 라운드</th><td className={scoreTone(myRound)}><CountUp value={myRound} format={signed} delayMs={650} className="lc-count" /></td><td className={scoreTone(oppRound)}><CountUp value={oppRound} format={signed} delayMs={650} className="lc-count" /></td></tr>
          {view.rounds > 1 && <tr className="match lc-reveal" style={{ '--i': SITES.length + 1 } as CSSProperties}><th>전체 합계</th><td><CountUp value={view.matchTotals[myIndex]!} delayMs={850} className="lc-count" /></td><td><CountUp value={view.matchTotals[1 - myIndex]!} delayMs={850} className="lc-count" /></td></tr>}
        </tbody>
      </table>
      {view.rounds > 1 && view.roundScores.length > 1 && <p className="lc-result-rounds">{view.roundScores.map((r, i) => `${i + 1}R ${signed(r[myIndex]!)} : ${signed(r[1 - myIndex]!)}`).join('  ·  ')}</p>}
      {!finished && <p className="lc-result-note">다음 라운드는 이번 점수가 낮은 쪽이 먼저 시작해요.</p>}
      {oppVoted && !voted && <p className="lc-ready-hint" role="status">{name(oppId)}님이 {finished ? '한 판 더 하고 싶어 해요' : '다음 라운드를 기다려요'}</p>}
      <button className="lc-button primary full" disabled={busy || voted || !oppOnline} onClick={() => send('game:ready')}>
        {voted ? '친구의 답을 기다리는 중' : finished ? (oppVoted ? '좋아요, 한 판 더!' : '한 판 더 하기') : `${view.round + 1}라운드 시작`}<ArrowRight size={17} />
      </button>
      <button className={`lc-text-button lc-result-leave ${confirmLeave ? 'confirming' : ''}`} onClick={leave}>{confirmLeave ? '매치를 끝내고 나가기 · 한 번 더 누르세요' : '대기실로 나가기'} <ArrowRight size={14} /></button>
    </div>
  </Dialog>;
}

/* ---------- shell ---------- */

function useLC() {
  return useGame<LCClientState>({ namespace: '/lost-cities', tokenKey: 'lost-cities.session' }, EMPTY_STATE);
}

export default function LostCities({ onHome }: { onHome: () => void }) {
  const client = useLC();
  const { me, room, busy, connected, restoring, replaced, error, setError, send } = client;
  const [rules, setRules] = useState(false);
  const invite = useRef(new URLSearchParams(window.location.search).get('room'));
  const attempted = useRef('');
  useEffect(() => {
    if (!me || !connected || room || !invite.current || attempted.current === me.id) return;
    attempted.current = me.id;
    void send('rooms:join', { code: invite.current });
  }, [me, connected, room, send]);
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(''), 5500);
    return () => clearTimeout(timer);
  }, [error, setError]);
  useEffect(() => {
    const previous = document.title;
    document.title = '로스트 시티 — 둘이서 탐험';
    return () => { document.title = previous; };
  }, []);
  const playing = Boolean(room?.game);
  return <div className={`lc-app ${playing ? 'in-game' : ''}`}>
    {!playing && <FallingLeaves />}
    {!playing && <header className="lc-header lc-width">
      <div className="lc-brand"><span className="lc-brand-mark"><i /><i /><i /></span><span>로스트 시티<small>LOST CITIES</small></span></div>
      <nav>
        <button className="lc-text-button" onClick={onHome} aria-label="게임 선택"><LayoutGrid size={16} /><span>게임 선택</span></button>
        {me && <span className="lc-header-player"><span className="lc-dot" />{me.name}<small>님</small></span>}
        <button className="lc-text-button" onClick={() => setRules(true)} aria-label="게임 방법"><HelpCircle size={16} /><span>게임 방법</span></button>
        {me && !room && <button className="lc-icon-btn" onClick={client.logout} aria-label="이름 바꾸기" title="이름 바꾸기"><LogOut size={17} /></button>}
      </nav>
    </header>}
    {replaced ? <div className="lc-banner" role="status"><WifiOff size={14} /> 다른 탭에서 접속해서 이 탭은 잠시 쉬고 있어요.<button onClick={client.reconnect}>여기서 계속하기</button></div>
      : !connected && <div className="lc-banner" role="status"><WifiOff size={14} /> 서버에 연결하는 중이에요. 잠시만 기다려 주세요.</div>}
    {restoring ? <main className="lc-loading"><span>⚄</span><p>자리를 찾고 있어요.</p></main>
      : !me ? <Landing onEnter={name => void send('session:enter', { name })} busy={busy} connected={connected} onRules={() => setRules(true)} invite={invite.current} />
        : room?.game ? <GameTable room={room} meId={me.id} client={client} />
          : room ? <Waiting room={room} meId={me.id} client={client} />
            : <Lobby client={client} onRules={() => setRules(true)} />}
    {rules && <RulesDialog onClose={() => setRules(false)} />}
    {error && <div className="lc-toast" role="status" aria-live="polite"><span>{error}</span><button aria-label="알림 닫기" onClick={() => setError('')}><X size={15} /></button></div>}
  </div>;
}
