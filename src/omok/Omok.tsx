import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ArrowLeft, Circle, CircleDot, Grid3x3, HelpCircle, History, ShieldBan, Trophy, Undo2, Users } from 'lucide-react';
import Dialog from '../components/Dialog';
import CountUp from '../duel/CountUp';
import DuelShell, { LeaveDialog, LogDialog, ReadyButtons, type DuelTheme, type OptionsPickerProps, type TableProps } from '../duel/DuelShell';
import { BLACK, cellName, CELLS, EMPTY, FORBIDDEN_LABEL, SIZE, type OMOptions, type OMView } from '../../shared/omok';
import './omok.css';

type Props = TableProps<OMView, OMOptions>;

/** Where the five small dots (hoshi) sit on a 15x15 board. */
const STARS = [[3, 3], [11, 3], [7, 7], [3, 11], [11, 11]] as const;
const TICKS = Array.from({ length: SIZE }, (_, i) => i);

function BoardLines() {
  return <svg className="om-lines" viewBox={`0 0 ${SIZE} ${SIZE}`} preserveAspectRatio="none" aria-hidden="true">
    {TICKS.map(i => {
      // The outer frame is a little heavier; non-scaling-stroke keeps every line a crisp pixel width at any board size.
      const width = i === 0 || i === SIZE - 1 ? 2 : 1;
      return <g key={i} stroke="#4a3320" strokeWidth={width}>
        <line x1={0.5} x2={SIZE - 0.5} y1={i + 0.5} y2={i + 0.5} vectorEffect="non-scaling-stroke" />
        <line y1={0.5} y2={SIZE - 0.5} x1={i + 0.5} x2={i + 0.5} vectorEffect="non-scaling-stroke" />
      </g>;
    })}
    {STARS.map(([x, y]) => <circle key={`${x}-${y}`} cx={x + 0.5} cy={y + 0.5} r={0.11} fill="#4a3320" />)}
  </svg>;
}

function OptionsPicker({ value, onChange, disabled }: OptionsPickerProps<OMOptions>) {
  return <div className="duel-options">
    <span>금수 규칙</span>
    <div>
      <button type="button" className={!value.renju ? 'active' : ''} disabled={disabled} onClick={() => onChange({ renju: false })}>자유 오목</button>
      <button type="button" className={value.renju ? 'active' : ''} disabled={disabled} onClick={() => onChange({ renju: true })}>금수 있음</button>
    </div>
    <small>{value.renju ? '흑은 3-3 · 4-4 · 6목 이상이 되는 자리에 둘 수 없어요. 흑이 조금 덜 유리해요.' : '다섯 알 이상 이으면 이겨요. 처음 두는 흑이 조금 유리해요.'}</small>
  </div>;
}

function RulesDialog({ onClose }: { onClose: () => void }) {
  return <Dialog title="오목 규칙" onClose={onClose} wide>
    <div className="duel-rules">
      <p>가로, 세로, 대각선으로 <b>같은 색 돌 다섯 개</b>를 먼저 이으면 이겨요.</p>
      <div className="duel-rules-steps">
        <div><span>01</span><h4>번갈아 한 알씩</h4><p>15×15 판의 교차점에 돌을 하나씩 놓아요. 흑이 먼저 두고, 누가 흑인지는 시작할 때 무작위로 정해요.</p></div>
        <div><span>02</span><h4>한 번 놓으면 끝</h4><p>놓은 돌은 움직이거나 무를 수 없어요. 신중하게 두세요.</p></div>
        <div><span>03</span><h4>다섯 줄 완성</h4><p>여섯 개 이상 이어도 이겨요(자유 오목). 판이 가득 차면 비겨요.</p></div>
      </div>
      <h3>금수 규칙 (방을 만들 때 고르기)</h3>
      <ul>
        <li>켜 두면 <b>흑만</b> 아래 자리에 둘 수 없어요. 백은 제한이 없어요.</li>
        <li><b>3-3</b>: 한 수로 양쪽이 트인 &lsquo;열린 3&rsquo;을 두 개 동시에 만드는 자리</li>
        <li><b>4-4</b>: 한 수로 &lsquo;4&rsquo;를 두 개 동시에 만드는 자리(한 줄에 두 개여도 포함)</li>
        <li><b>장목</b>: 여섯 개 이상이 이어지는 자리. 흑은 정확히 다섯 개일 때만 이겨요.</li>
        <li>단, 그 수로 <b>정확히 다섯 개</b>가 완성되면 금수 자리여도 두고 이겨요.</li>
        <li>내 차례에 둘 수 없는 자리는 판에 빨간 ×로 보여요.</li>
      </ul>
      <h3>화면 쓰는 법</h3>
      <ul>
        <li>빈 교차점을 누르면 연한 돌이 놓여요. <b>한 번 더 누르거나 &lsquo;여기에 두기&rsquo;</b>를 누르면 확정이에요.</li>
        <li>가장 최근에 둔 돌에는 작은 점이 찍혀 있어요.</li>
      </ul>
    </div>
  </Dialog>;
}

function BoardArt() {
  return <svg viewBox="0 0 320 200" aria-hidden="true">
    <rect width="320" height="200" rx="22" fill="#d9a85a" />
    <rect x="22" y="14" width="276" height="172" rx="6" fill="#e8c27b" />
    {[0, 1, 2, 3, 4, 5, 6].map(i => <line key={`h${i}`} x1="40" x2="280" y1={34 + i * 22} y2={34 + i * 22} stroke="#5a3f24" strokeWidth="1.3" />)}
    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => <line key={`v${i}`} y1="34" y2="166" x1={40 + i * 24} x2={40 + i * 24} stroke="#5a3f24" strokeWidth="1.3" />)}
    {[[112, 78, 0], [136, 100, 1], [160, 122, 0], [184, 100, 1], [160, 78, 1], [136, 56, 0], [208, 122, 0], [112, 122, 1]].map(([x, y, white], i) => <g key={i}>
      <circle cx={x! + 1.5} cy={y! + 2.5} r="10" fill="#0003" />
      <circle cx={x} cy={y} r="10" fill={white ? '#f6f1e4' : '#1c1a18'} stroke={white ? '#cfc6b0' : '#000'} strokeWidth="1" />
      <circle cx={x! - 3} cy={y! - 3.5} r="3" fill={white ? '#fff' : '#555'} opacity=".8" />
    </g>)}
  </svg>;
}

function Backdrop({ inGame }: { inGame: boolean }) {
  return <div className={`duel-backdrop om-backdrop ${inGame ? 'is-game' : ''}`} aria-hidden="true">
    <span className="om-moon" />
    <svg className="om-window" viewBox="0 0 120 120">
      <rect x="4" y="4" width="112" height="112" rx="6" fill="none" stroke="#7a5a3a" strokeWidth="5" />
      {[34, 64, 94].map(p => <g key={p}><line x1={p} x2={p} y1="4" y2="116" stroke="#7a5a3a" strokeWidth="3" /><line y1={p} y2={p} x1="4" x2="116" stroke="#7a5a3a" strokeWidth="3" /></g>)}
    </svg>
    <svg className="om-branch" viewBox="0 0 220 160">
      <path d="M0 18C50 22 90 40 130 90M70 34C86 22 110 20 140 30M100 60C118 50 150 52 176 66" stroke="#4a3024" strokeWidth="5" fill="none" strokeLinecap="round" />
      {[[40, 24], [86, 28], [128, 30], [150, 56], [176, 66], [120, 84], [64, 36]].map(([x, y], i) => <g key={i} transform={`translate(${x} ${y})`}>
        {[0, 72, 144, 216, 288].map(a => <ellipse key={a} cx="0" cy="-6" rx="4.5" ry="6.5" fill="#f6c3cf" transform={`rotate(${a})`} />)}
        <circle r="2.4" fill="#e0647f" />
      </g>)}
    </svg>
    {Array.from({ length: 6 }, (_, i) => <span key={i} className="om-petal" style={{ '--i': i } as CSSProperties} />)}
  </div>;
}

function Table({ room, meId, client }: Props) {
  const view = room.game;
  const { busy, send } = client;
  const names = Object.fromEntries(room.players.map(p => [p.id, p.name]));
  const oppId = view.opponentId;
  const [selected, setSelected] = useState<number | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [resultHidden, setResultHidden] = useState(false);
  useEffect(() => { setSelected(null); }, [view.revision]);
  useEffect(() => { setResultHidden(false); }, [view.status]);
  const mine = view.status === 'playing' && view.currentPlayerId === meId;
  const myStone = meId === view.blackId ? 'black' : 'white';
  const forbidden = useMemo(() => new Map(view.forbidden.map(f => [f.cell, f.reason])), [view.forbidden]);
  const winCells = useMemo(() => new Set(view.winLine), [view.winLine]);

  async function place(cell: number) {
    if (!mine || busy) return;
    await send('game:action', { type: 'place', cell });
  }
  function tap(cell: number) {
    if (!mine) { client.setError('상대 차례예요.'); return; }
    const reason = forbidden.get(cell);
    if (reason) { client.setError(`금수 자리예요. 흑은 ${FORBIDDEN_LABEL[reason]}가 되는 곳에 둘 수 없어요.`); return; }
    if (selected === cell) void place(cell);
    else setSelected(cell);
  }

  const hint = view.status === 'finished' ? (view.winnerId ? '다섯 알이 이어졌어요.' : '판이 가득 찼어요.')
    : !mine ? `${names[oppId] ?? '상대'}님이 생각하는 중이에요.`
      : selected === null ? '돌을 둘 자리를 눌러 주세요.' : `${cellName(selected)}에 두려면 한 번 더 눌러요.`;

  const chip = (id: string) => {
    const black = id === view.blackId;
    return <div className={`om-player ${view.currentPlayerId === id && view.status === 'playing' ? 'is-turn' : ''}`}>
      <i className={`om-dot ${black ? 'black' : 'white'}`} />
      <strong>{names[id] ?? '플레이어'}</strong>{id === meId && <small>나</small>}
      <span className="om-side">{black ? '흑 · 선공' : '백'}</span>
    </div>;
  };

  const lastCell = view.lastMove?.cell ?? null;
  return <main className="om-game">
    <header className="om-topbar">
      <button className="duel-icon-btn" onClick={() => setLeaving(true)} aria-label="방 나가기"><ArrowLeft size={17} /></button>
      <span className="om-turn">{view.moveCount}<small>수</small></span>
      {view.renju && <span className="om-rule-chip"><ShieldBan size={13} /> 금수</span>}
      <span className="om-spacer" />
      <button className="duel-icon-btn" onClick={() => setShowLog(true)} aria-label="지난 차례 기록"><History size={17} /></button>
      <button className="duel-icon-btn" onClick={() => setShowRules(true)} aria-label="게임 방법"><HelpCircle size={17} /></button>
    </header>
    {chip(oppId)}
    <section className="om-board-wrap">
      <div className="om-board" role="group" aria-label="오목판">
        <BoardLines />
        <div className="om-grid">
          {Array.from({ length: CELLS }, (_, cell) => {
            const stone = view.stones[cell]!;
            const name = cellName(cell);
            const reason = forbidden.get(cell);
            const label = stone === EMPTY ? `${name}, 빈 자리${reason ? `, 금수 ${FORBIDDEN_LABEL[reason]}` : ''}` : `${name}, ${stone === BLACK ? '흑돌' : '백돌'}`;
            return <button key={cell} type="button" className={`om-cell ${stone === EMPTY && mine ? 'is-open' : ''}`} disabled={busy || stone !== EMPTY || view.status !== 'playing'}
              onClick={() => tap(cell)} aria-label={label}>
              {stone !== EMPTY
                ? <i className={`om-stone ${stone === BLACK ? 'black' : 'white'} ${cell === lastCell ? 'is-last' : ''} ${winCells.has(cell) ? 'is-win' : ''}`} />
                : selected === cell ? <i className={`om-stone ghost ${myStone}`} />
                  : reason ? <i className="om-x" /> : null}
            </button>;
          })}
        </div>
      </div>
    </section>
    {chip(meId)}
    <section className={`om-status ${mine ? 'is-mine' : ''}`}>
      <span className="duel-dot" /><strong>{view.status === 'finished' ? '대국 끝' : mine ? '내 차례' : '상대 차례'}</strong><span>{hint}</span>
      {selected !== null && mine && <>
        <button className="duel-icon-btn" onClick={() => setSelected(null)} aria-label="선택 취소"><Undo2 size={15} /></button>
        <button className="duel-button primary compact" disabled={busy} onClick={() => void place(selected)}>여기에 두기</button>
      </>}
    </section>
    {view.status === 'finished' && !resultHidden && <Dialog title={view.winnerId === meId ? '오목 완성!' : view.winnerId ? '아깝게 졌어요' : '무승부'} onClose={() => setResultHidden(true)}>
      <div className="om-result">
        <Trophy size={40} className="duel-trophy" />
        <h3>{view.winnerId ? `${names[view.winnerId] ?? '플레이어'}님이 ${view.winnerId === view.blackId ? '흑' : '백'}으로 이겼어요` : '판이 가득 차서 비겼어요'}</h3>
        <p><CountUp value={view.moveCount} delayMs={300} />수 만에 끝난 대국</p>
        <ReadyButtons room={room as never} meId={meId} client={client as never} finished nextLabel="" />
      </div>
    </Dialog>}
    {view.status === 'finished' && resultHidden && <button className="duel-button primary om-show-result" onClick={() => setResultHidden(false)}>결과 다시 보기</button>}
    {showLog && <LogDialog log={view.log} meId={meId} names={names} onClose={() => setShowLog(false)} />}
    {showRules && <RulesDialog onClose={() => setShowRules(false)} />}
    {leaving && <LeaveDialog client={client as never} inGame finished={view.status === 'finished'} onClose={() => setLeaving(false)} />}
  </main>;
}

const theme: DuelTheme<OMView, OMOptions> = {
  key: 'om',
  name: '오목',
  latin: 'OMOK',
  documentTitle: '오목 — 다섯 알을 먼저 이어요',
  namespace: '/omok',
  tokenKey: 'omok.session',
  minutes: '약 10분',
  landing: {
    eyebrow: '달빛 드는 사랑방의 한 판',
    title: <>다섯 알을<br />먼저 <span className="serif-word">이어 보기</span></>,
    intro: <>흑과 백, 한 수씩 번갈아.<br />상대의 길을 막으면서 내 줄을 이어 가요.</>,
    cta: '사랑방으로 가기',
    caption: '가로 · 세로 · 대각선으로 다섯 알이면 승리',
  },
  lobbyLine: '빈 사랑방에 들어가거나, 새 대국을 열어 보세요.',
  createTitle: '새 대국을 열어요',
  defaultRoomTitle: name => `${name}의 사랑방`,
  seatsTitle: '오늘의 기사',
  startLabel: '대국 시작',
  facts: [
    { icon: <Users size={15} />, text: '2인 대전' },
    { icon: <Grid3x3 size={15} />, text: '15×15 판' },
    { icon: <CircleDot size={15} />, text: '다섯 알 먼저' },
    { icon: <ShieldBan size={15} />, text: '금수 선택' },
  ],
  roomIcon: <Circle size={20} />,
  emptyIcon: <CircleDot size={40} strokeWidth={1.4} />,
  defaultOptions: { renju: false },
  roomMeta: options => options.renju ? '금수 있음' : '자유 오목',
  OptionsPicker,
  Art: BoardArt,
  Backdrop,
  Rules: RulesDialog,
  Table,
};

export default function Omok({ onHome }: { onHome: () => void }) {
  return <DuelShell theme={theme} onHome={onHome} />;
}
