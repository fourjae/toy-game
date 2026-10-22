import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, Box, Camera, Castle, Grid3x3, HelpCircle, History, Layers, Mountain, Sailboat, Sun, Trophy, Users, X } from 'lucide-react';
import Dialog from '../components/Dialog';
import CountUp from '../duel/CountUp';
import DuelShell, { LeaveDialog, LogDialog, ReadyButtons, type DuelTheme, type TableProps } from '../duel/DuelShell';
import { cellName, type STView } from '../../shared/santorini';
import { IslandScene, SEAT_COLORS, type Highlight } from './scene';
import './santorini.css';

type Options = Record<string, never>;

// 평면 보기: 3D가 버거운 기기(GPU 없는 브라우저, 오래된 폰)를 위해 같은 판을 위에서 본 2D 격자로 그린다.
// 고른 값은 기기에 기억해 두고, 주소에 ?flat 이 있으면 처음부터 평면으로 연다.
const FLAT_KEY = 'santorini.flat';
function readFlat() {
  try { return new URLSearchParams(window.location.search).has('flat') || window.localStorage.getItem(FLAT_KEY) === '1'; } catch { return false; }
}
function saveFlat(flat: boolean) {
  try { window.localStorage.setItem(FLAT_KEY, flat ? '1' : '0'); } catch { /* 저장 못 해도 이번 판엔 적용됨 */ }
}
type Props = TableProps<STView, Options>;

function RulesDialog({ onClose }: { onClose: () => void }) {
  return <Dialog title="하얀 섬의 규칙" onClose={onClose} wide>
    <div className="duel-rules">
      <p>내 일꾼을 <b>3층 건물 꼭대기</b>에 먼저 올려 놓으면 이겨요. 신 카드 없는 기본 규칙이에요.</p>
      <div className="duel-rules-steps">
        <div><span>01</span><h4>일꾼 놓기</h4><p>선이 일꾼 둘을 빈칸에 놓고, 이어서 상대가 둘을 놓아요.</p></div>
        <div><span>02</span><h4>움직이기</h4><p>일꾼 하나를 골라 주변 8칸 중 한 칸으로 옮겨요. <b>한 층까지만 올라갈 수</b> 있고, 내려가는 건 몇 층이든 괜찮아요.</p></div>
        <div><span>03</span><h4>짓기</h4><p>방금 움직인 일꾼 주변 빈칸에 한 층을 올려요. 3층 위에는 <b>돔</b>을 얹어 막을 수 있어요.</p></div>
      </div>
      <h3>이기고 지는 법</h3>
      <ul>
        <li>움직여서 <b>3층에 올라서는</b> 순간 승리예요. (3층에서 3층으로 옮기는 건 해당하지 않아요.)</li>
        <li>내 차례에 움직일 수 있는 일꾼이 없거나, 움직인 뒤 지을 곳이 없으면 져요.</li>
        <li>일꾼이나 돔이 있는 칸으로는 갈 수도, 지을 수도 없어요.</li>
        <li>블록은 1층 22개, 2층 18개, 3층 14개, 돔 18개뿐이에요. 다 쓰면 그 층은 더 못 지어요.</li>
      </ul>
      <h3>화면 쓰는 법</h3>
      <ul>
        <li>한 손가락으로 끌면 섬이 돌아가고, 두 손가락(또는 휠)으로 확대해요.</li>
        <li>내 일꾼을 누르고, 빛나는 칸을 눌러 옮기세요. 짓기도 빛나는 칸을 누르면 돼요.</li>
        <li>화면이 버벅이면 오른쪽 <b>평면으로 보기</b> 단추로 위에서 본 판으로 바꿀 수 있어요.</li>
      </ul>
      <p className="duel-rules-note">상대가 3층 바로 옆 2층에 서 있다면, 그 3층에 돔을 얹어 막는 게 가장 급해요.</p>
    </div>
  </Dialog>;
}

function IslandArt() {
  return <svg viewBox="0 0 320 200" className="st-art" aria-hidden="true">
    <defs>
      <linearGradient id="st-art-sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5bb4e0" /><stop offset="1" stopColor="#1f6fa8" /></linearGradient>
    </defs>
    <circle cx="258" cy="46" r="22" fill="#ffd77a" />
    <rect y="120" width="320" height="80" fill="url(#st-art-sea)" />
    <path d="M40 132c30-40 210-40 240 0z" fill="#f4f0e7" />
    <path d="M40 132c30 14 210 14 240 0" fill="#d8d2c4" />
    {[[96, 92, 40, 30], [140, 70, 44, 52], [190, 88, 38, 34]].map(([x, y, w, h], i) => <g key={i}>
      <rect x={x} y={y} width={w} height={h} fill="#fff" stroke="#d9e3ea" />
      <rect x={x! + w! / 2 - 5} y={y! + h! / 2 - 6} width="10" height="12" fill="#3a5c8c" />
    </g>)}
    <path d="M140 70a22 22 0 0 1 44 0z" fill="#2b5cad" />
    <path d="M190 88a19 19 0 0 1 38 0z" fill="#2b5cad" />
    <g fill={SEAT_COLORS[0]}><rect x="108" y="76" width="10" height="16" rx="5" /><circle cx="113" cy="72" r="6" /></g>
    {[0, 1, 2].map(i => <path key={i} d={`M${20 + i * 100} ${160 + i * 10}q12 -6 24 0t24 0`} stroke="#ffffff88" strokeWidth="2" fill="none" />)}
  </svg>;
}

function Backdrop({ inGame }: { inGame: boolean }) {
  return <div className={`duel-backdrop st-backdrop ${inGame ? 'is-game' : ''}`} aria-hidden="true">
    <div className="st-sun" />
    <div className="st-cloud c1" /><div className="st-cloud c2" /><div className="st-cloud c3" />
    {!inGame && <div className="st-sea"><i /><i /><i /></div>}
    {!inGame && <div className="st-gulls">{[0, 1, 2].map(i => <svg key={i} viewBox="0 0 30 10"><path d="M0 8q7-8 15 0q8-8 15 0" stroke="#33506d" strokeWidth="1.6" fill="none" /></svg>)}</div>}
  </div>;
}

function Table({ room, meId, client }: Props) {
  const view = room.game;
  const { busy, send } = client;
  const names = Object.fromEntries(room.players.map(p => [p.id, p.name]));
  const oppId = view.opponentId;
  const seat = view.playerIds.indexOf(meId);
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<IslandScene | null>(null);
  const pickRef = useRef<(cell: number) => void>(() => undefined);
  const [selected, setSelected] = useState<number | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [resultHidden, setResultHidden] = useState(false);
  const [topView, setTopView] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);
  const [flat, setFlat] = useState(readFlat);
  const gridMode = flat || webglFailed;
  useEffect(() => { setSelected(null); }, [view.revision]);
  useEffect(() => { setResultHidden(false); }, [view.status]);

  const mine = view.status === 'playing' && view.currentPlayerId === meId;
  const myWorkers = view.workers[meId]!;
  const occupied = new Set(Object.values(view.workers).flat().filter((c): c is number => c !== null));
  const selectedWorker = selected === null ? -1 : myWorkers.indexOf(selected);

  const highlights = useMemo(() => {
    const map = new Map<number, Highlight>();
    if (!mine) return map;
    if (view.phase === 'place') for (let c = 0; c < 25; c++) { if (!occupied.has(c)) map.set(c, 'place'); }
    else if (view.phase === 'build') for (const c of view.myBuilds) map.set(c, 'build');
    else if (selectedWorker >= 0) for (const c of view.myMoves[selectedWorker]?.to ?? []) map.set(c, 'move');
    else view.myMoves.forEach((m, w) => { const at = myWorkers[w]; if (at !== null && at !== undefined && m.to.length) map.set(at, 'worker'); });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.revision, mine, selectedWorker]);

  pickRef.current = (cell: number) => {
    if (!mine || busy) return;
    if (view.phase === 'place') { if (!occupied.has(cell)) void send('game:action', { type: 'place', cell }); return; }
    if (view.phase === 'build') {
      if (view.myBuilds.includes(cell)) void send('game:action', { type: 'build', cell });
      else client.setError('방금 움직인 일꾼 옆의 빛나는 칸에 지어 주세요.');
      return;
    }
    const w = myWorkers.indexOf(cell);
    if (w >= 0) { setSelected(selected === cell ? null : view.myMoves[w]!.to.length ? cell : (client.setError('이 일꾼은 갈 곳이 없어요.'), null)); return; }
    if (selectedWorker >= 0 && view.myMoves[selectedWorker]!.to.includes(cell)) { void send('game:action', { type: 'move', worker: selectedWorker, to: cell }); return; }
    // No worker chosen yet: if exactly one worker can reach the cell, move it.
    const able = view.myMoves.filter(m => m.to.includes(cell));
    if (able.length === 1) void send('game:action', { type: 'move', worker: able[0]!.worker, to: cell });
    else client.setError(able.length ? '어느 일꾼을 움직일지 먼저 눌러 주세요.' : '그 칸으로는 갈 수 없어요.');
  };

  useEffect(() => {
    if (!hostRef.current || flat) return;
    try {
      sceneRef.current = new IslandScene(hostRef.current, cell => pickRef.current(cell), seat);
    } catch {
      setWebglFailed(true);
    }
    return () => { sceneRef.current?.dispose(); sceneRef.current = null; };
  }, [seat, flat]);

  useEffect(() => {
    sceneRef.current?.sync({
      levels: view.levels, domes: view.domes,
      workers: view.playerIds.map(id => view.workers[id]!),
      highlights, selectedCell: selected, lastBuild: view.lastBuild?.cell ?? null,
    });
  }, [view, highlights, selected, flat]);

  const placedCount = myWorkers.filter(c => c !== null).length;
  const hint = view.status === 'finished' ? '게임이 끝났어요.'
    : !mine ? `${names[oppId] ?? '상대'}님이 ${view.phase === 'place' ? '일꾼을 놓는' : view.phase === 'build' ? '짓는' : '움직이는'} 중이에요.`
      : view.phase === 'place' ? `빈칸을 눌러 일꾼을 놓아요 (${placedCount + 1}/2).`
        : view.phase === 'build' ? '빛나는 칸을 눌러 한 층 올려요. 3층 위엔 돔이 얹혀요.'
          : selectedWorker >= 0 ? '빛나는 칸으로 옮겨요. 한 층까지만 올라갈 수 있어요.' : '움직일 내 일꾼을 눌러 주세요.';

  const chip = (id: string) => {
    const s = view.playerIds.indexOf(id);
    return <div className={`st-player ${view.currentPlayerId === id && view.status === 'playing' ? 'is-turn' : ''}`}>
      <span className="st-swatch" style={{ background: SEAT_COLORS[s] }} />
      <strong>{names[id] ?? '플레이어'}</strong>{id === meId && <small>나</small>}
      {view.firstPlayerId === id && <em>선</em>}
    </div>;
  };

  const winnerName = view.winnerId ? names[view.winnerId] ?? '플레이어' : '';
  // Both players read this line, so name the stuck player instead of saying "상대".
  const loserName = view.winnerId ? (view.winnerId === meId ? '상대' : '내') : '';
  const reason = view.winReason === 'climb' ? '3층에 먼저 올라섰어요'
    : view.winReason === 'stuck' ? `${loserName} 일꾼이 움직일 곳이 없었어요` : `${loserName} 일꾼이 지을 곳이 없었어요`;
  return <main className="st-game">
    {!flat && <div className="st-canvas" ref={hostRef} />}
    {/* The same board as buttons, for screen readers and keyboards (and the e2e test). In flat mode it is the board. */}
    <div className={gridMode ? 'st-grid-fallback' : 'st-a11y'} role="group" aria-label="섬 칸">
      {view.levels.map((level, cell) => {
        const who = view.playerIds.findIndex(id => view.workers[id]!.includes(cell));
        const glow = highlights.get(cell);
        return <button key={cell} type="button" data-cell={cell} className={glow ? `is-${glow}` : ''} disabled={busy} onClick={() => pickRef.current(cell)}
          aria-label={`${cellName(cell)} ${view.domes[cell] ? '돔' : `${level}층`}${who >= 0 ? `, ${view.playerIds[who] === meId ? '내' : '상대'} 일꾼` : ''}${glow ? ', 선택 가능' : ''}`}>
          {gridMode ? <span className="st-tile" aria-hidden="true">
            {[1, 2, 3].slice(0, level).map(l => <i key={l} className={`st-tier t${l}`} />)}
            {view.domes[cell] && <i className="st-cap" />}
            {who >= 0 && <i className={`st-pawn ${view.playerIds[who] === meId ? 'is-me' : ''}`} style={{ background: SEAT_COLORS[who] }} />}
            {level > 0 && !view.domes[cell] && <b className="st-lv">{level}</b>}
            {view.lastBuild?.cell === cell && <i className="st-fresh" key={view.revision} />}
          </span> : <>{level}{view.domes[cell] ? '◓' : ''}{who >= 0 ? (who === 0 ? '●' : '○') : ''}</>}
        </button>;
      })}
    </div>
    {webglFailed && !flat && <div className="st-nogl">이 기기에서는 3D 화면을 열 수 없어서 평면으로 보여 드려요.</div>}
    <header className="st-topbar">
      <button className="duel-icon-btn" onClick={() => setLeaving(true)} aria-label="방 나가기"><ArrowLeft size={17} /></button>
      {chip(oppId)}
      <span className="st-turn">{view.turn}<small>턴</small></span>
      {chip(meId)}
      <button className="duel-icon-btn" onClick={() => setShowLog(true)} aria-label="지난 차례 기록"><History size={17} /></button>
      <button className="duel-icon-btn" onClick={() => setShowRules(true)} aria-label="게임 방법"><HelpCircle size={17} /></button>
    </header>
    <div className="st-side">
      {!gridMode && <button className="duel-icon-btn" onClick={() => { const next = !topView; setTopView(next); sceneRef.current?.resetCamera(seat, next); }} aria-label={topView ? '비스듬히 보기' : '위에서 보기'} title={topView ? '비스듬히 보기' : '위에서 보기'}><Camera size={17} /></button>}
      {!webglFailed && <button className="duel-icon-btn" onClick={() => { const next = !flat; setFlat(next); saveFlat(next); setTopView(false); }} aria-label={flat ? '3D로 보기' : '평면으로 보기'} title={flat ? '3D로 보기' : '평면으로 보기'}>{flat ? <Box size={17} /> : <Grid3x3 size={17} />}</button>}
      <div className="st-supply" aria-label="남은 블록">
        <span title="1층 블록"><i className="l1" />{view.supply[1]}</span>
        <span title="2층 블록"><i className="l2" />{view.supply[2]}</span>
        <span title="3층 블록"><i className="l3" />{view.supply[3]}</span>
        <span title="돔"><i className="dome" />{view.supply.dome}</span>
      </div>
    </div>
    <section className="st-bottom">
      <div className={`st-status ${mine ? 'is-mine' : ''}`}>
        <span className="duel-dot" /><strong>{view.status === 'finished' ? '게임 끝' : mine ? (view.phase === 'build' ? '짓기' : view.phase === 'place' ? '일꾼 놓기' : '움직이기') : '상대 차례'}</strong><span>{hint}</span>
        {selected !== null && <button className="duel-icon-btn" aria-label="선택 취소" onClick={() => setSelected(null)}><X size={15} /></button>}
      </div>
      {view.lastMove && <p className="st-last">{names[view.lastMove.playerId]}: {cellName(view.lastMove.from)} → {cellName(view.lastMove.to)}{view.lastBuild ? ` · ${cellName(view.lastBuild.cell)}에 ${view.lastBuild.dome ? '돔' : `${view.levels[view.lastBuild.cell]}층`}` : ''}</p>}
    </section>
    {view.status === 'finished' && !resultHidden && <Dialog title={view.winnerId === meId ? '섬 꼭대기에 섰어요!' : '아쉬운 한 판'} onClose={() => setResultHidden(true)}>
      <div className="st-result">
        <Trophy size={40} className="duel-trophy" />
        <h3>{winnerName}님의 승리</h3>
        <p>{reason}. <CountUp value={view.turn} delayMs={300} />턴 만에 끝났어요.</p>
        <table className="duel-stats">
          <thead><tr><th /><th>{names[meId] ?? '나'}<small>나</small></th><th>{names[oppId] ?? '상대'}</th></tr></thead>
          <tbody>
            {([
              [<><Layers size={13} />지은 블록</>, view.stats[meId]?.blocks ?? 0, view.stats[oppId]?.blocks ?? 0, false],
              [<><Castle size={13} />얹은 돔</>, view.stats[meId]?.domes ?? 0, view.stats[oppId]?.domes ?? 0, false],
              [<><Mountain size={13} />가장 높이 오른 층</>, view.stats[meId]?.peak ?? 0, view.stats[oppId]?.peak ?? 0, true],
            ] as const).map(([label, a, b, lead], i) => <tr key={i} className="duel-reveal" style={{ '--i': i + 2 } as CSSProperties}>
              <th>{label}</th>
              <td className={lead && a > b ? 'is-lead' : ''}><CountUp value={a} delayMs={400 + i * 120} /></td>
              <td className={lead && b > a ? 'is-lead' : ''}><CountUp value={b} delayMs={400 + i * 120} /></td>
            </tr>)}
          </tbody>
        </table>
        <ReadyButtons room={room as never} meId={meId} client={client as never} finished nextLabel="" />
      </div>
    </Dialog>}
    {view.status === 'finished' && resultHidden && <button className="duel-button primary st-show-result" onClick={() => setResultHidden(false)}>결과 다시 보기</button>}
    {showLog && <LogDialog log={view.log} meId={meId} names={names} onClose={() => setShowLog(false)} />}
    {showRules && <RulesDialog onClose={() => setShowRules(false)} />}
    {leaving && <LeaveDialog client={client as never} inGame finished={view.status === 'finished'} onClose={() => setLeaving(false)} />}
  </main>;
}

const theme: DuelTheme<STView, Options> = {
  key: 'st',
  name: '산토리니',
  latin: 'SANTORINI',
  documentTitle: '산토리니 — 하얀 섬의 탑',
  namespace: '/santorini',
  tokenKey: 'santorini.session',
  minutes: '약 15분',
  landing: {
    eyebrow: '에게해의 하얀 섬',
    title: <>한 층씩 쌓아<br />꼭대기에 <span className="serif-word">먼저</span></>,
    intro: <>움직이고, 짓고, 막아요.<br />3층에 먼저 올라서면 이기는 3D 수싸움.</>,
    cta: '섬에 내리기',
    caption: '돌려 보고, 눌러서 움직이는 3D 섬',
  },
  lobbyLine: '빈 섬에 내리거나, 새 섬을 띄워 보세요.',
  createTitle: '새 섬을 띄워요',
  defaultRoomTitle: name => `${name}의 섬`,
  seatsTitle: '오늘의 건축가',
  startLabel: '섬에서 시작',
  facts: [
    { icon: <Users size={15} />, text: '2인 대전' },
    { icon: <Layers size={15} />, text: '5×5 판' },
    { icon: <Castle size={15} />, text: '3층 등반' },
    { icon: <Sun size={15} />, text: '3D 화면' },
  ],
  roomIcon: <Sailboat size={20} />,
  emptyIcon: <Mountain size={40} strokeWidth={1.4} />,
  defaultOptions: {},
  Art: IslandArt,
  Backdrop,
  Rules: RulesDialog,
  Table,
};

export default function Santorini({ onHome }: { onHome: () => void }) {
  return <DuelShell theme={theme} onHome={onHome} />;
}
