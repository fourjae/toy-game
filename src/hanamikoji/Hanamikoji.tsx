import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Coffee, Flower2, Gift, HelpCircle, History, Lock, Medal, RotateCw, Swords, Trash2, Users, X } from 'lucide-react';
import Dialog from '../components/Dialog';
import DuelShell, { LeaveDialog, LogDialog, ReadyButtons, type DuelTheme, type TableProps } from '../duel/DuelShell';
import {
  ACTION_INFO, ACTIONS, GEISHAS, WIN_CHARM, WIN_GEISHAS,
  type HMActionKind, type HMCard, type HMView,
} from '../../shared/hanamikoji';
import { GeishaPortrait, ItemGlyph, KyotoBackdrop, TeahouseArt, geishaStyle } from './art';
import './hanamikoji.css';

type Options = Record<string, never>;
type Props = TableProps<HMView, Options>;

const ACTION_ICON: Record<HMActionKind, typeof Lock> = { secret: Lock, tradeoff: Trash2, gift: Gift, competition: Swords };

function ItemCard({ card, small = false, selected = false, tag, fresh = false }: { card: HMCard; small?: boolean; selected?: boolean; tag?: string; fresh?: boolean }) {
  const g = GEISHAS[card.geisha]!;
  return <span className={`hm-card ${small ? 'is-small' : ''} ${selected ? 'is-selected' : ''} ${fresh ? 'is-fresh' : ''}`} style={geishaStyle(card.geisha)}>
    <span className="hm-card-charm">{g.charm}</span>
    <ItemGlyph geisha={card.geisha} size="58%" />
    {!small && <span className="hm-card-name">{g.item}</span>}
    {tag && <em className="hm-card-tag">{tag}</em>}
  </span>;
}

function CardBack({ small = false }: { small?: boolean }) {
  return <span className={`hm-card hm-card--back ${small ? 'is-small' : ''}`}><Flower2 size="46%" strokeWidth={1.4} /></span>;
}

function RulesDialog({ onClose }: { onClose: () => void }) {
  return <Dialog title="꽃길 찻집의 규칙" onClose={onClose} wide>
    <div className="duel-rules">
      <p>일곱 명의 게이샤가 좋아하는 물건을 더 많이 모아 <b>호감</b>을 얻어요. <b>매력 {WIN_CHARM}점</b> 이상이나 <b>게이샤 {WIN_GEISHAS}명</b> 이상의 호감을 얻으면 이겨요.</p>
      <div className="hm-rules-geishas">{GEISHAS.map((g, i) => <span key={i} style={geishaStyle(i)}><ItemGlyph geisha={i} size={18} />{g.name}·{g.item}<b>{g.charm}</b></span>)}</div>
      <p className="duel-rules-note">게이샤의 숫자는 매력 점수이자 그 게이샤 물건 카드의 장수예요. 모두 21장이에요.</p>
      <h3>라운드 준비</h3>
      <ul>
        <li>카드 1장을 아무도 모르게 빼 두고, 6장씩 나눠 가져요. 남은 8장이 더미예요.</li>
        <li>차례마다 <b>먼저 1장을 뽑고</b>, 아직 쓰지 않은 행동 하나를 해요. 행동은 라운드마다 하나씩, 모두 네 번이에요.</li>
      </ul>
      <h3>네 가지 행동</h3>
      <div className="duel-rules-steps">
        {ACTIONS.map((kind, i) => <div key={kind}><span>0{i + 1}</span><h4>{ACTION_INFO[kind].name} · {ACTION_INFO[kind].cards}장</h4><p>{ACTION_INFO[kind].short}</p></div>)}
      </div>
      <h3>라운드 끝</h3>
      <ul>
        <li>두 사람이 네 행동을 모두 쓰면 비밀 카드를 공개해 각자 자리에 놓아요.</li>
        <li>게이샤마다 물건을 <b>더 많이</b> 놓은 쪽으로 호감 표식이 옮겨 와요. 같으면 표식은 <b>제자리</b>에 있어요.</li>
        <li>매력 {WIN_CHARM}점 이상이면 승리, 아니면 게이샤 {WIN_GEISHAS}명 이상이면 승리. 둘 다 해당하면 <b>매력이 우선</b>이에요.</li>
        <li>아무도 못 이기면 표식은 그대로 두고 새 라운드를 해요. 선은 번갈아 잡아요.</li>
      </ul>
      <h3>이렇게 해 보세요</h3>
      <ul>
        <li>선물과 경쟁은 상대가 고르니, 상대가 무엇을 가져가도 괜찮게 짝을 지어 보세요.</li>
        <li>포기한 카드와 빼 둔 1장 때문에 정확히 셀 수 없는 게이샤가 생겨요. 그게 이 게임의 묘미예요.</li>
      </ul>
    </div>
  </Dialog>;
}

function TokenRow({ used, mine, active, onPick, disabled }: { used: Record<HMActionKind, boolean>; mine: boolean; active: HMActionKind | null; onPick?: (kind: HMActionKind) => void; disabled?: boolean }) {
  return <div className={`hm-tokens ${mine ? 'is-mine' : 'is-opp'}`} role={mine ? 'group' : undefined} aria-label={mine ? '내 행동 토큰' : '상대 행동 토큰'}>
    {ACTIONS.map(kind => {
      const Icon = ACTION_ICON[kind];
      const spent = used[kind];
      const label = `${ACTION_INFO[kind].name} ${ACTION_INFO[kind].cards}장${spent ? ', 사용함' : ''}`;
      if (!mine) return <span key={kind} className={`hm-token ${spent ? 'is-used' : ''}`} title={label} aria-label={label}><Icon size={13} /><b>{ACTION_INFO[kind].name}</b></span>;
      return <button key={kind} type="button" className={`hm-token ${spent ? 'is-used' : ''} ${active === kind ? 'is-active' : ''}`} disabled={disabled || spent} onClick={() => onPick?.(kind)} aria-pressed={active === kind} aria-label={label}>
        <Icon size={16} /><b>{ACTION_INFO[kind].name}</b><small>{ACTION_INFO[kind].cards}장</small>
      </button>;
    })}
  </div>;
}

function Table({ room, meId, client }: Props) {
  const view = room.game;
  const { busy, send } = client;
  const oppId = view.opponentId;
  const names = Object.fromEntries(room.players.map(p => [p.id, p.name]));
  const oppName = names[oppId] ?? '상대';
  const myName = names[meId] ?? '나';
  const [mode, setMode] = useState<HMActionKind | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [showLog, setShowLog] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [resultHidden, setResultHidden] = useState(false);
  const [rotateDismissed, setRotateDismissed] = useState(false);
  useEffect(() => { setMode(null); setPicked([]); }, [view.revision]);
  useEffect(() => { setResultHidden(false); }, [view.status, view.round]);

  const playing = view.status === 'playing';
  const myTurn = playing && !view.pending && view.currentPlayerId === meId;
  const hand = useMemo(() => [...view.hand].sort((a, b) => a.geisha - b.geisha || a.id.localeCompare(b.id)), [view.hand]);
  const need = mode ? ACTION_INFO[mode].cards : 0;

  function pickAction(kind: HMActionKind) {
    if (!myTurn) return;
    setMode(mode === kind ? null : kind);
    setPicked([]);
  }
  function toggle(id: string) {
    if (!mode) { client.setError(myTurn ? '먼저 아래 행동 토큰을 골라 주세요.' : '내 차례가 되면 고를 수 있어요.'); return; }
    setPicked(current => current.includes(id) ? current.filter(x => x !== id) : current.length >= need ? current : [...current, id]);
  }
  async function confirm() {
    if (!mode || picked.length !== need) return;
    if (mode === 'competition') await send('game:action', { type: 'competition', groups: [picked.slice(0, 2), picked.slice(2, 4)] });
    else await send('game:action', { type: mode, cardIds: picked });
  }

  const tagFor = (id: string) => {
    const i = picked.indexOf(id);
    if (i < 0) return undefined;
    return mode === 'competition' ? (i < 2 ? 'A' : 'B') : String(i + 1);
  };

  const hint = !playing ? '라운드가 끝났어요.'
    : view.mustChoose ? `${oppName}님이 내민 카드 가운데 하나를 골라 주세요.`
      : view.pending ? `${oppName}님이 고르는 중이에요.`
        : !myTurn ? `${oppName}님 차례예요.`
          : !mode ? '새 카드를 한 장 받았어요. 쓸 행동을 골라 주세요.'
            : mode === 'competition' ? `두 장씩 두 묶음 (A, A, B, B 순서로) · ${picked.length}/4`
              : `${ACTION_INFO[mode].name}: ${need}장 고르기 · ${picked.length}/${need}`;

  const column = (g: number) => {
    const holder = view.favor[g];
    const theirs = view.placed[oppId]![g]!;
    const mine = view.placed[meId]![g]!;
    const info = GEISHAS[g]!;
    return <div key={g} className="hm-col" style={geishaStyle(g)}>
      <div className="hm-stack is-opp" aria-label={`${info.name} 상대 쪽 ${theirs.length}장`}>{theirs.map(c => <ItemCard key={c.id} card={c} small />)}</div>
      <div className={`hm-geisha favor-${holder === meId ? 'me' : holder === oppId ? 'opp' : 'none'}`} aria-label={`${info.name}, 매력 ${info.charm}, 호감 ${holder === meId ? '내 쪽' : holder === oppId ? '상대 쪽' : '아직 없음'}`}>
        <span className="hm-favor" aria-hidden="true" />
        <GeishaPortrait geisha={g} />
        <span className="hm-geisha-name">{info.name}</span>
        <span className="hm-geisha-charm">{info.charm}</span>
        <span className="hm-geisha-count"><b>{theirs.length}</b><i>:</i><b>{mine.length}</b></span>
      </div>
      <div className="hm-stack is-mine" aria-label={`${info.name} 내 쪽 ${mine.length}장`}>{mine.map(c => <ItemCard key={c.id} card={c} small />)}</div>
    </div>;
  };

  const player = (id: string, name: string, own: boolean) => <div className={`hm-player ${own ? 'is-me' : ''} ${playing && (view.pending ? view.pending.by !== id : view.currentPlayerId === id) ? 'is-turn' : ''}`}>
    <strong>{name}{own && <small>나</small>}</strong>
    <span className="hm-player-stat" title="매력 점수"><Flower2 size={12} />{view.charm[id]}</span>
    <span className="hm-player-stat" title="호감을 얻은 게이샤"><Users size={12} />{view.geishaCount[id]}</span>
  </div>;

  const pending = view.pending;
  return <main className="hm-game">
    <header className="hm-topbar">
      <button className="duel-icon-btn" onClick={() => setLeaving(true)} aria-label="방 나가기"><ArrowLeft size={17} /></button>
      {player(oppId, oppName, false)}
      <span className="hm-round"><b>{view.round}</b>라운드<small>더미 {view.deckCount}</small></span>
      {player(meId, myName, true)}
      <button className="duel-icon-btn" onClick={() => setShowLog(true)} aria-label="지난 차례 기록"><History size={17} /></button>
      <button className="duel-icon-btn" onClick={() => setShowRules(true)} aria-label="게임 방법"><HelpCircle size={17} /></button>
    </header>
    <section className="hm-strip is-opp">
      <span className="hm-opp-hand" aria-label={`상대 손패 ${view.opponentHandCount}장`}>{Array.from({ length: view.opponentHandCount }, (_, i) => <CardBack key={i} small />)}</span>
      <TokenRow used={view.used[oppId]!} mine={false} active={null} />
      <span className="hm-hidden-cards">
        {view.opponentHasSecret && <span title="상대의 비밀 카드"><CardBack small /><Lock size={11} /></span>}
        {view.opponentDiscardedCount > 0 && <span title="상대가 포기한 카드"><CardBack small /><Trash2 size={11} />{view.opponentDiscardedCount}</span>}
      </span>
    </section>
    <section className="hm-board" aria-label="게이샤 일곱 명">{GEISHAS.map((_, g) => column(g))}</section>
    <section className="hm-strip is-mine">
      <TokenRow used={view.used[meId]!} mine active={mode} onPick={pickAction} disabled={!myTurn || busy} />
      <span className="hm-hidden-cards">
        {view.mySecret && <span title="내 비밀 카드 (라운드 끝에 공개)"><ItemCard card={view.mySecret} small /><Lock size={11} /></span>}
        {view.myDiscarded.length > 0 && <span title="내가 포기한 카드">{view.myDiscarded.map(c => <ItemCard key={c.id} card={c} small />)}<Trash2 size={11} /></span>}
      </span>
    </section>
    <section className={`hm-hand ${myTurn ? 'is-mine' : ''}`}>
      <div className={`hm-status ${myTurn || view.mustChoose ? 'is-mine' : ''}`}>
        <span className="duel-dot" /><strong>{!playing ? '라운드 종료' : myTurn || view.mustChoose ? '내 차례' : '상대 차례'}</strong><span>{hint}</span>
        {mode && <span className="hm-status-actions">
          <button className="duel-button primary compact" disabled={busy || picked.length !== need} onClick={() => void confirm()}><Check size={14} />{ACTION_INFO[mode].name}</button>
          <button className="duel-icon-btn" aria-label="행동 취소" onClick={() => { setMode(null); setPicked([]); }}><X size={15} /></button>
        </span>}
      </div>
      <div className="hm-hand-cards" role="group" aria-label={`내 손패 ${hand.length}장`}>
        {hand.map(c => <button key={c.id} type="button" className="hm-hand-card" aria-pressed={picked.includes(c.id)} disabled={busy || !playing}
          aria-label={`${GEISHAS[c.geisha]!.name}의 ${GEISHAS[c.geisha]!.item}, 매력 ${GEISHAS[c.geisha]!.charm}`} onClick={() => toggle(c.id)}>
          <ItemCard card={c} selected={picked.includes(c.id)} tag={tagFor(c.id)} fresh={c.id === view.drawnId} />
        </button>)}
        {!hand.length && <p className="hm-hand-empty">손에 남은 카드가 없어요.</p>}
      </div>
    </section>

    {pending && playing && <div className={`hm-offer ${view.mustChoose ? 'is-choosing' : 'is-waiting'}`} role="dialog" aria-label={pending.kind === 'gift' ? '선물 고르기' : '경쟁 고르기'}>
      <div className="hm-offer-card">
        <span className="eyebrow">{pending.kind === 'gift' ? '선물' : '경쟁'}</span>
        <h2>{view.mustChoose ? (pending.kind === 'gift' ? '마음에 드는 한 장을 가져가요' : '한 묶음을 골라 가져가요') : `${oppName}님이 고르고 있어요`}</h2>
        <p>{view.mustChoose ? '고르지 않은 카드는 상대 쪽에 놓여요.' : pending.kind === 'gift' ? '고르고 남은 두 장이 내 쪽에 놓여요.' : '남은 묶음이 내 쪽에 놓여요.'}</p>
        <div className="hm-offer-options">
          {pending.kind === 'gift'
            ? pending.cards.map((c, i) => <button key={c.id} type="button" className="hm-offer-option" disabled={!view.mustChoose || busy} onClick={() => void send('game:action', { type: 'choose', index: i })} aria-label={`${GEISHAS[c.geisha]!.name}의 ${GEISHAS[c.geisha]!.item} 가져가기`}><ItemCard card={c} /></button>)
            : pending.groups.map((group, i) => <button key={i} type="button" className="hm-offer-option is-pair" disabled={!view.mustChoose || busy} onClick={() => void send('game:action', { type: 'choose', index: i })} aria-label={`${i === 0 ? 'A' : 'B'} 묶음 가져가기: ${group.map(c => GEISHAS[c.geisha]!.item).join(', ')}`}>
              <b>{i === 0 ? 'A' : 'B'}</b>{group.map(c => <ItemCard key={c.id} card={c} />)}
            </button>)}
        </div>
      </div>
    </div>}

    <div className={`duel-rotate ${rotateDismissed ? 'is-dismissed' : ''}`} role="status"><RotateCw size={34} /><strong>폰을 세로로 돌려 주세요</strong><span>세로 화면에서 게이샤 일곱 명이 한눈에 보여요.</span><button className="duel-button secondary compact" onClick={() => setRotateDismissed(true)}>이대로 할게요</button></div>
    {!playing && !resultHidden && <ResultDialog room={room} meId={meId} client={client} onHide={() => setResultHidden(true)} />}
    {!playing && resultHidden && <button className="duel-button primary hm-show-result" onClick={() => setResultHidden(false)}>결과 다시 보기</button>}
    {showLog && <LogDialog log={view.log} meId={meId} names={names} onClose={() => setShowLog(false)} />}
    {showRules && <RulesDialog onClose={() => setShowRules(false)} />}
    {leaving && <LeaveDialog client={client as never} inGame finished={view.status === 'finished'} onClose={() => setLeaving(false)} />}
  </main>;
}

function ResultDialog({ room, meId, client, onHide }: { room: Props['room']; meId: string; client: Props['client']; onHide: () => void }) {
  const view = room.game;
  const oppId = view.opponentId;
  const name = (id: string) => room.players.find(p => p.id === id)?.name ?? '플레이어';
  const result = view.results.at(-1)!;
  const me = view.playerIds.indexOf(meId);
  const finished = view.status === 'finished';
  const title = !finished ? `${view.round}라운드 끝` : view.winnerId === meId ? '꽃길의 주인공은 나!' : '좋은 승부였어요';
  const headline = finished
    ? `${name(view.winnerId!)}님이 ${view.winReason === 'charm' ? `매력 ${WIN_CHARM}점 이상` : `게이샤 ${WIN_GEISHAS}명`}으로 이겼어요`
    : '아직 아무도 승리 조건에 닿지 못했어요';
  return <Dialog title={title} onClose={onHide} wide>
    <div className="hm-result">
      <h3>{headline}</h3>
      <div className="hm-result-grid">
        {GEISHAS.map((g, i) => {
          const [a, b] = result.counts[i]!;
          const mine = me === 0 ? a : b;
          const theirs = me === 0 ? b : a;
          const after = result.after[i];
          const moved = result.before[i] !== after;
          return <div key={i} className={`hm-result-geisha ${after === meId ? 'is-me' : after === oppId ? 'is-opp' : ''}`} style={geishaStyle(i)}>
            <GeishaPortrait geisha={i} />
            <strong>{g.name}<small>{g.charm}</small></strong>
            <span>{theirs} : {mine}</span>
            <em>{after === meId ? '내 편' : after === oppId ? '상대 편' : '없음'}{moved && ' ✦'}</em>
          </div>;
        })}
      </div>
      <table className="hm-result-table">
        <thead><tr><th /><th>{name(meId)}<small>나</small></th><th>{name(oppId)}</th></tr></thead>
        <tbody>
          <tr><th><Flower2 size={13} /> 매력</th><td>{result.charm[me]}</td><td>{result.charm[1 - me]}</td></tr>
          <tr><th><Users size={13} /> 게이샤</th><td>{result.geishas[me]}</td><td>{result.geishas[1 - me]}</td></tr>
        </tbody>
      </table>
      {view.removed && <p className="hm-result-note"><Coffee size={13} /> 이번 라운드에 빼 둔 카드: {GEISHAS[view.removed.geisha]!.name}의 {GEISHAS[view.removed.geisha]!.item}</p>}
      {!finished && <p className="hm-result-note"><Medal size={13} /> 호감 표식은 그대로 남고, 다음 라운드는 선을 바꿔 시작해요.</p>}
      <ReadyButtons room={room as never} meId={meId} client={client as never} finished={finished} nextLabel={`${view.round + 1}라운드 시작`} />
    </div>
  </Dialog>;
}

const theme: DuelTheme<HMView, Options> = {
  key: 'hm',
  name: '하나미코지',
  latin: 'HANAMIKOJI',
  documentTitle: '하나미코지 — 꽃길 찻집',
  namespace: '/hanamikoji',
  tokenKey: 'hanamikoji.session',
  minutes: '약 15분',
  landing: {
    eyebrow: '등불 켜진 꽃길로',
    title: <>오늘 밤,<br />게이샤의 <span className="serif-word">호감을</span></>,
    intro: <>네 가지 행동 토큰으로 물건을 주고받으며<br />일곱 게이샤의 마음을 얻어요.</>,
    cta: '찻집 들어가기',
    caption: '부채, 피리, 찻잔, 우산, 방울, 두루마리, 비파',
  },
  lobbyLine: '빈 다다미에 앉거나, 새 찻집을 열어 보세요.',
  createTitle: '새 찻집을 열어요',
  defaultRoomTitle: name => `${name}의 찻집`,
  seatsTitle: '오늘의 손님',
  startLabel: '꽃길 걷기 시작',
  facts: [
    { icon: <Users size={15} />, text: '2인 대전' },
    { icon: <Flower2 size={15} />, text: '게이샤 7명' },
    { icon: <Gift size={15} />, text: '행동 토큰 4개' },
    { icon: <Medal size={15} />, text: `매력 ${WIN_CHARM} · 게이샤 ${WIN_GEISHAS}` },
  ],
  roomIcon: <Flower2 size={20} />,
  emptyIcon: <Coffee size={40} strokeWidth={1.4} />,
  defaultOptions: {},
  Art: TeahouseArt,
  Backdrop: KyotoBackdrop,
  Rules: RulesDialog,
  Table,
};

export default function Hanamikoji({ onHome }: { onHome: () => void }) {
  return <DuelShell theme={theme} onHome={onHome} />;
}
