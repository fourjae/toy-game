import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Anchor, ArrowLeft, Flag, Gauge, HelpCircle, History, Sailboat, Trophy, Undo2, Users, Waves } from 'lucide-react';
import Dialog from '../components/Dialog';
import CountUp from '../duel/CountUp';
import DuelShell, { LeaveDialog, LogDialog, ReadyButtons, type DuelTheme, type TableProps } from '../duel/DuelShell';
import { EDGE, LANES, speedOf, squareOf, WIN_PIECES, type SQPiece, type SQView } from '../../shared/squadro';
import './squadro.css';

type Options = Record<string, never>;
type Props = TableProps<SQView, Options>;
const SEAT_CLASS = ['sq-yellow', 'sq-coral'] as const;

/** A little rowing boat pointing up; CSS rotates it to the way it is heading. */
function Boat({ seat }: { seat: number }) {
  return <svg viewBox="0 0 40 60" className={`sq-boat ${SEAT_CLASS[seat]}`} aria-hidden="true">
    <path d="M20 2C30 12 33 26 32 44c0 8-5 13-12 13S8 52 8 44C7 26 10 12 20 2z" fill="var(--hull)" stroke="var(--hull2)" strokeWidth="2" />
    <path d="M20 9c6 8 8 18 7.5 32-.3 6-3.5 9-7.5 9s-7.2-3-7.5-9C12 27 14 17 20 9z" fill="var(--deck)" />
    <rect x="13" y="26" width="14" height="3.4" rx="1.5" fill="var(--hull2)" />
    <rect x="13" y="36" width="14" height="3.4" rx="1.5" fill="var(--hull2)" />
    <circle cx="20" cy="17" r="2.6" fill="var(--hull2)" />
  </svg>;
}

function Pips({ n }: { n: number }) {
  return <span className="sq-pips" aria-label={`속도 ${n}`}>{Array.from({ length: n }, (_, i) => <i key={i} />)}</span>;
}

function RulesDialog({ onClose }: { onClose: () => void }) {
  return <Dialog title="호수 왕복 경주 규칙" onClose={onClose} wide>
    <div className="duel-rules">
      <p>내 배 다섯 척 가운데 <b>네 척</b>을 먼저 건너편에 다녀오게 하면 이겨요.</p>
      <div className="duel-rules-steps">
        <div><span>01</span><h4>한 척 움직이기</h4><p>차례마다 내 배 하나를 골라 앞으로 보내요. 나머지는 그대로예요.</p></div>
        <div><span>02</span><h4>점만큼 가기</h4><p>출발한 가장자리에 찍힌 <b>점의 수</b>만큼 칸을 가요. 갈 때 1·3·2·3·1(상대는 3·1·2·1·3)이고, 돌아올 땐 반대 가장자리의 점을 따라요.</p></div>
        <div><span>03</span><h4>반환점</h4><p>건너편 가장자리에 닿으면 남은 칸이 있어도 거기서 멈추고 뱃머리를 돌려요.</p></div>
      </div>
      <h3>상대 배 뛰어넘기</h3>
      <ul>
        <li>가는 길에 상대 배를 만나면 <b>뛰어넘어 바로 다음 빈칸</b>에 멈춰요. 남은 칸은 버려요.</li>
        <li>붙어 있는 상대 배 여러 척은 한꺼번에 뛰어넘어요.</li>
        <li>뛰어넘긴 배는 <b>마지막으로 출발했던 가장자리</b>로 되돌아가요. 가는 중이면 출발선, 돌아오는 중이면 반환점이에요.</li>
      </ul>
      <h3>화면 쓰는 법</h3>
      <ul>
        <li>내 배를 누르면 도착할 칸이 점선 배로 보여요. 한 번 더 누르거나 점선 배를 누르면 출발해요.</li>
        <li>내 배가 늘 아래에서 위로 가도록 판을 돌려서 보여 줘요.</li>
      </ul>
    </div>
  </Dialog>;
}

function LakeArt() {
  return <svg viewBox="0 0 320 200" aria-hidden="true">
    <rect width="320" height="200" rx="22" fill="#2c8a8f" />
    {[0, 1, 2, 3, 4].map(i => <line key={`h${i}`} x1="40" x2="280" y1={44 + i * 28} y2={44 + i * 28} stroke="#ffffff22" />)}
    {[0, 1, 2, 3, 4].map(i => <line key={`v${i}`} y1="24" y2="176" x1={92 + i * 34} x2={92 + i * 34} stroke="#ffffff22" />)}
    <ellipse cx="60" cy="160" rx="18" ry="8" fill="#5fae6b" /><ellipse cx="264" cy="40" rx="14" ry="6" fill="#5fae6b" />
    {[[92, 120, 0], [160, 70, 0], [228, 140, 0], [130, 100, 90], [200, 44, 90]].map(([x, y, r], i) => <g key={i} transform={`translate(${x} ${y}) rotate(${r}) translate(-9 -14)`}>
      <path d="M9 0C14 5 16 12 15.5 21c0 4-3 7-6.5 7S3 25 3 21C2.5 12 4 5 9 0z" fill={r ? '#e0533d' : '#f2b632'} stroke={r ? '#9e2f1f' : '#a8740c'} strokeWidth="1.2" />
    </g>)}
    <path d="M14 200c4-30 8-50 10-70M26 200c0-24 4-44 12-60M300 200c-2-30-6-48-12-66" stroke="#2a5a3a" strokeWidth="3" fill="none" strokeLinecap="round" />
  </svg>;
}

function Backdrop({ inGame }: { inGame: boolean }) {
  return <div className={`duel-backdrop sq-backdrop ${inGame ? 'is-game' : ''}`} aria-hidden="true">
    {Array.from({ length: 6 }, (_, i) => <span key={i} className="sq-ripple" style={{ '--i': i } as CSSProperties} />)}
    <svg className="sq-reeds left" viewBox="0 0 120 220"><path d="M20 220c2-60 6-110 18-170M40 220c0-50 4-90 22-140M60 220c-2-40-4-70 6-110M8 220c-4-40-2-80 2-120" stroke="#2a5a3a" strokeWidth="5" fill="none" strokeLinecap="round" /><ellipse cx="38" cy="50" rx="5" ry="16" fill="#6b4a2c" /><ellipse cx="62" cy="80" rx="5" ry="14" fill="#6b4a2c" /></svg>
    <svg className="sq-reeds right" viewBox="0 0 120 220"><path d="M100 220c-2-60-6-110-18-170M80 220c0-50-4-90-22-140M110 220c4-40 2-80-2-120" stroke="#2a5a3a" strokeWidth="5" fill="none" strokeLinecap="round" /><ellipse cx="82" cy="50" rx="5" ry="16" fill="#6b4a2c" /></svg>
    <span className="sq-pad p1" /><span className="sq-pad p2" /><span className="sq-pad p3" />
  </div>;
}

function Table({ room, meId, client }: Props) {
  const view = room.game;
  const { busy, send } = client;
  const names = Object.fromEntries(room.players.map(p => [p.id, p.name]));
  const oppId = view.opponentId;
  const mySeat = view.playerIds.indexOf(meId);
  const [selected, setSelected] = useState<number | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [resultHidden, setResultHidden] = useState(false);
  useEffect(() => { setSelected(null); }, [view.revision]);
  useEffect(() => { setResultHidden(false); }, [view.status]);
  const mine = view.status === 'playing' && view.currentPlayerId === meId;

  // Turn the board so my boats always set off from the bottom edge.
  const toScreen = ({ x, y }: { x: number; y: number }) => mySeat === 0 ? { x, y } : { x: y, y: EDGE - x };
  const headingDeg = (seat: number, returning: boolean) => {
    const base = seat === 0 ? 0 : 90; // seat 0 goes up, seat 1 goes right (board coordinates)
    const raw = base + (returning ? 180 : 0);
    return mySeat === 0 ? raw : raw - 90;
  };
  const place = (seat: number, lane: number, piece: SQPiece) => {
    const s = toScreen(squareOf(seat, lane, piece.pos));
    return { '--x': s.x, '--y': s.y, '--r': `${headingDeg(seat, piece.returning)}deg` } as CSSProperties;
  };

  const preview = selected !== null ? view.previews[selected] ?? null : null;
  const sentSet = new Set(preview?.sent ?? []);
  const lastSent = new Set(view.lastMove?.sent.map(s => s.lane) ?? []);

  async function go(lane: number) {
    if (!mine || busy || !view.previews[lane]) return;
    await send('game:action', { type: 'move', lane });
  }
  function tapBoat(lane: number) {
    if (!mine) { client.setError('상대 차례예요.'); return; }
    if (!view.previews[lane]) return;
    if (selected === lane) void go(lane);
    else setSelected(lane);
  }

  // Edge squares with speed dots: each lane's start edge and its turn-around edge.
  const edges = useMemo(() => {
    const out: Array<{ key: string; style: CSSProperties; n: number; seat: number }> = [];
    for (let seat = 0; seat < 2; seat++) for (let lane = 0; lane < LANES; lane++) {
      for (const [pos, returning] of [[0, false], [EDGE, true]] as const) {
        const s = toScreen(squareOf(seat, lane, pos));
        out.push({ key: `${seat}-${lane}-${pos}`, style: { '--x': s.x, '--y': s.y } as CSSProperties, n: speedOf(seat, lane, returning), seat });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mySeat]);

  const hint = view.status === 'finished' ? '경주가 끝났어요.'
    : !mine ? `${names[oppId] ?? '상대'}님이 배를 고르는 중이에요.`
      : selected === null ? '움직일 내 배를 눌러 주세요.'
        : preview?.sent.length ? `출발하면 상대 배 ${preview.sent.length}척을 되돌려 보내요. 한 번 더 눌러 출발!` : '점선 배 자리로 가요. 한 번 더 눌러 출발!';

  const homeDock = (id: string) => {
    const seat = view.playerIds.indexOf(id);
    return <span className="sq-home" aria-label={`귀환 ${view.homeCount[id]} / ${WIN_PIECES}`}>
      {Array.from({ length: WIN_PIECES }, (_, i) => <i key={i} className={`${SEAT_CLASS[seat]} ${i < view.homeCount[id]! ? 'is-home' : ''}`} />)}
    </span>;
  };
  const chip = (id: string) => {
    const seat = view.playerIds.indexOf(id);
    return <div className={`sq-player ${view.currentPlayerId === id && view.status === 'playing' ? 'is-turn' : ''}`}>
      <span className={`sq-flag ${SEAT_CLASS[seat]}`}><Flag size={12} /></span>
      <strong>{names[id] ?? '플레이어'}</strong>{id === meId && <small>나</small>}
      {homeDock(id)}
    </div>;
  };

  return <main className="sq-game">
    <header className="sq-topbar">
      <button className="duel-icon-btn" onClick={() => setLeaving(true)} aria-label="방 나가기"><ArrowLeft size={17} /></button>
      <span className="sq-turn">{view.turn}<small>턴</small></span>
      <span className="sq-spacer" />
      <button className="duel-icon-btn" onClick={() => setShowLog(true)} aria-label="지난 차례 기록"><History size={17} /></button>
      <button className="duel-icon-btn" onClick={() => setShowRules(true)} aria-label="게임 방법"><HelpCircle size={17} /></button>
    </header>
    {chip(oppId)}
    <section className="sq-board-wrap">
      <div className="sq-board" role="group" aria-label="경주 호수">
        <div className="sq-water" />
        {edges.map(e => <span key={e.key} className={`sq-edge ${SEAT_CLASS[e.seat]}`} style={e.style}><Pips n={e.n} /></span>)}
        {view.lastMove && <span className={`sq-wake ${SEAT_CLASS[view.playerIds.indexOf(view.lastMove.playerId)]}`} style={(() => {
          const seat = view.playerIds.indexOf(view.lastMove.playerId);
          const a = toScreen(squareOf(seat, view.lastMove.lane, view.lastMove.from.pos));
          const b = toScreen(squareOf(seat, view.lastMove.lane, view.lastMove.to.pos));
          return { '--x': Math.min(a.x, b.x), '--y': Math.min(a.y, b.y), '--w': Math.abs(a.x - b.x) + 1, '--h': Math.abs(a.y - b.y) + 1 } as CSSProperties;
        })()} />}
        {preview && selected !== null && (() => {
          // Dashed route from the chosen boat to where it would stop.
          const a = toScreen(squareOf(mySeat, selected, view.pieces[meId]![selected]!.pos));
          const b = toScreen(squareOf(mySeat, selected, preview.to.pos));
          return <span key={`route-${selected}`} className={`sq-route ${SEAT_CLASS[mySeat]}`} style={{ '--x': Math.min(a.x, b.x), '--y': Math.min(a.y, b.y), '--w': Math.abs(a.x - b.x) + 1, '--h': Math.abs(a.y - b.y) + 1 } as CSSProperties} />;
        })()}
        {preview && selected !== null && !preview.to.done && <button type="button" className={`sq-piece sq-ghost`} style={place(mySeat, selected, preview.to)} onClick={() => void go(selected)} aria-label="여기로 출발"><Boat seat={mySeat} /></button>}
        {view.playerIds.map((id, seat) => view.pieces[id]!.map((piece, lane) => {
          if (piece.done) return null;
          const own = id === meId;
          const movable = own && mine && Boolean(view.previews[lane]);
          const cls = ['sq-piece', own ? 'is-mine' : 'is-opp', movable ? 'is-movable' : '', own && selected === lane ? 'is-selected' : '', !own && sentSet.has(lane) ? 'is-threatened' : '', view.lastMove && view.lastMove.playerId !== id && lastSent.has(lane) ? 'is-sent' : ''].join(' ');
          return <button key={`${seat}-${lane}`} type="button" className={cls} style={place(seat, lane, piece)} disabled={busy || !own}
            onClick={() => tapBoat(lane)} aria-label={`${own ? '내' : '상대'} ${lane + 1}번 배, ${piece.returning ? '돌아오는 중' : '가는 중'}, 속도 ${speedOf(seat, lane, piece.returning)}${own && selected === lane ? ', 한 번 더 누르면 출발' : ''}`}>
            <Boat seat={seat} /><b>{speedOf(seat, lane, piece.returning)}</b>
          </button>;
        }))}
      </div>
    </section>
    {chip(meId)}
    <section className={`sq-status ${mine ? 'is-mine' : ''}`}>
      <span className="duel-dot" /><strong>{view.status === 'finished' ? '경주 끝' : mine ? '내 차례' : '상대 차례'}</strong><span>{hint}</span>
      {selected !== null && <button className="duel-icon-btn" onClick={() => setSelected(null)} aria-label="선택 취소"><Undo2 size={15} /></button>}
    </section>
    {view.status === 'finished' && !resultHidden && <Dialog title={view.winnerId === meId ? '결승선 통과!' : '아깝게 졌어요'} onClose={() => setResultHidden(true)}>
      <div className="sq-result">
        <Trophy size={40} className="duel-trophy" />
        <h3>{names[view.winnerId!] ?? '플레이어'}님이 먼저 네 척을 돌려보냈어요</h3>
        <p><CountUp value={view.turn} delayMs={300} />턴 만에 끝난 경주</p>
        <table className="duel-stats">
          <thead><tr><th /><th>{names[meId] ?? '나'}<small>나</small></th><th>{names[oppId] ?? '상대'}</th></tr></thead>
          <tbody>
            <tr className="duel-reveal" style={{ '--i': 2 } as CSSProperties}>
              <th><Anchor size={13} />돌아온 배</th>
              {[meId, oppId].map(id => <td key={id} className={view.winnerId === id ? 'is-lead' : ''}><span className="sq-result-boats">
                {Array.from({ length: WIN_PIECES }, (_, i) => <i key={i} className={`${SEAT_CLASS[view.playerIds.indexOf(id)]} ${i < view.homeCount[id]! ? 'is-home' : ''}`} style={{ '--i': i } as CSSProperties} />)}
              </span></td>)}
            </tr>
            <tr className="duel-reveal" style={{ '--i': 3 } as CSSProperties}>
              <th><Undo2 size={13} />되돌려 보낸 배</th>
              <td className={(view.sentBack[meId] ?? 0) > (view.sentBack[oppId] ?? 0) ? 'is-lead' : ''}><CountUp value={view.sentBack[meId] ?? 0} delayMs={600} /></td>
              <td className={(view.sentBack[oppId] ?? 0) > (view.sentBack[meId] ?? 0) ? 'is-lead' : ''}><CountUp value={view.sentBack[oppId] ?? 0} delayMs={600} /></td>
            </tr>
          </tbody>
        </table>
        <ReadyButtons room={room as never} meId={meId} client={client as never} finished nextLabel="" />
      </div>
    </Dialog>}
    {view.status === 'finished' && resultHidden && <button className="duel-button primary sq-show-result" onClick={() => setResultHidden(false)}>결과 다시 보기</button>}
    {showLog && <LogDialog log={view.log} meId={meId} names={names} onClose={() => setShowLog(false)} />}
    {showRules && <RulesDialog onClose={() => setShowRules(false)} />}
    {leaving && <LeaveDialog client={client as never} inGame finished={view.status === 'finished'} onClose={() => setLeaving(false)} />}
  </main>;
}

const theme: DuelTheme<SQView, Options> = {
  key: 'sq',
  name: '스쿼드로',
  latin: 'SQUADRO',
  documentTitle: '스쿼드로 — 호수 왕복 경주',
  namespace: '/squadro',
  tokenKey: 'squadro.session',
  minutes: '약 10분',
  landing: {
    eyebrow: '잔잔한 호수 위의 경주',
    title: <>건너편에<br />먼저 <span className="serif-word">다녀오기</span></>,
    intro: <>빠른 배, 느린 배, 엇갈리는 물길.<br />상대 배를 뛰어넘어 출발선으로 돌려보내요.</>,
    cta: '호숫가로 가기',
    caption: '다섯 척 중 네 척이 먼저 돌아오면 승리',
  },
  lobbyLine: '빈 선착장에 들어가거나, 새 경주를 열어 보세요.',
  createTitle: '새 경주를 열어요',
  defaultRoomTitle: name => `${name}의 호수`,
  seatsTitle: '오늘의 선수',
  startLabel: '출발 신호',
  facts: [
    { icon: <Users size={15} />, text: '2인 대전' },
    { icon: <Sailboat size={15} />, text: '배 5척씩' },
    { icon: <Gauge size={15} />, text: '속도 1·2·3' },
    { icon: <Anchor size={15} />, text: '4척 귀환' },
  ],
  roomIcon: <Sailboat size={20} />,
  emptyIcon: <Waves size={40} strokeWidth={1.4} />,
  defaultOptions: {},
  Art: LakeArt,
  Backdrop,
  Rules: RulesDialog,
  Table,
};

export default function Squadro({ onHome }: { onHome: () => void }) {
  return <DuelShell theme={theme} onHome={onHome} />;
}
