import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronDown, ChevronRight, ChevronUp, Clock3, Copy, Flag, HelpCircle, LogOut, Medal, Plus, Shuffle, Sparkles, Timer, Users, WifiOff, X } from 'lucide-react';
import { useGame } from './useGame';
import Dialog from './components/Dialog';
import Board, { type BoardOrientation } from './components/Board';
import ToyIcon from './components/ToyIcon';
import { BASE_TROOP_TYPES, EXPANSION_TROOP_TYPES, TROOPS, withObjectParticle } from '../shared/troops';
import { TURN_SECONDS } from '../shared/engine';
import type { GameRules, GameView, Troop, TroopType } from '../shared/types';
import { NODE_BY_ID } from '../shared/map';
import type { RoomView } from '../server/types';

const RULE_INFO: Record<keyof GameRules, { name: string; short: string; detail: string }> = {
  flank: { name: '협공', short: '협공', detail: '공격할 때 그 거점과 길로 이어진 내 병정 수만큼 힘을 더해요. 약한 병정 여럿이 렉시를 잡을 수 있어요.' },
  depots: { name: '보급소', short: '보급소', detail: '위·아래 다리가 보급소예요. 하나라도 차지한 채 차례를 시작하면 병정 1개를 더 받아요.' },
  expansion: { name: '확장 병정', short: '확장 병정', detail: '그림자·공병·기사·폭탄이 각 2개씩 부대에 들어와요. 한 명당 병정이 28개가 돼요.' },
};
const RULE_KEYS = Object.keys(RULE_INFO) as (keyof GameRules)[];
// The expansion rules are built but shelved for now; flip this (and ENABLE_EXPANSION_RULES on the server) to offer them again.
const SHOW_RULE_OPTIONS = false;
const enabledRules = (rules: GameRules) => RULE_KEYS.filter(key => rules[key]);
const SKILL_LABEL: Record<TroopType, string> = { duck: '만능 공격', skeleton: '2개 보충', captain: '추가 배치', giant: '인접 제거', pirate: '자유 배치', robot: '상대 손 공격', unicorn: '1개 보충', dino: '힘 7', ninja: '적진 잠입', sapper: '길 공사', knight: '아군 이동', bomb: '함정' };
const OPTIONAL_ABILITY: TroopType[] = ['skeleton', 'captain', 'giant', 'robot', 'unicorn', 'sapper', 'knight'];

function RuleBadges({ rules, className = '' }: { rules: GameRules; className?: string }) {
  const keys = enabledRules(rules);
  if (!keys.length) return null;
  return <span className={`rule-badges ${className}`}>{keys.map(key => <span key={key} className="rule-badge">{RULE_INFO[key].short}</span>)}</span>;
}

function Brand({ small = false }: { small?: boolean }) {
  return <div className={`brand ${small ? 'brand-small' : ''}`}><span className="brand-mark"><i /><i /><i /></span><span>작은 전투<span className="brand-caption">TOY BATTLE CLUB</span></span></div>;
}

function FieldPreview({ label = true }: { label?: boolean }) {
  return <div className="field-preview"><div className="preview-top"><span><i className="status-dot" /> 오늘의 전장</span><span>01 / 성채 평원</span></div><Board preview />{label && <div className="preview-bottom"><span><Flag size={16} /> 작지만, 만만하지 않은 전장.</span><span className="handwritten">어느 쪽으로 갈까?</span></div>}</div>;
}

function Rules({ onClose }: { onClose: () => void }) {
  return <Dialog title="처음이라면, 이것만." onClose={onClose} wide>
    <div className="rules-intro"><span className="eyebrow">성채 평원 · 2인</span><p>상대 성에 먼저 도착하거나,<br /><strong>훈장 7개</strong>를 모으면 승리해요.</p></div>
    <div className="rules-steps"><div><span>01</span><h3>뽑거나, 놓거나</h3><p>내 차례에는 병정 2개를 뽑거나, 손에 있는 병정 하나를 놓아요. 손에는 8개까지 둘 수 있어요.</p></div><div><span>02</span><h3>길을 이어 가요</h3><p>내 성에서 내 병정으로 이어진 칸에 놓아요. 적을 덮으려면 더 높은 숫자가 필요해요.</p></div><div><span>03</span><h3>땅을 둘러싸요</h3><p>영토 둘레의 거점을 모두 차지하면 훈장을 가져와요. 한 번 얻은 훈장은 빼앗기지 않아요.</p></div></div>
    <h3 className="rules-section-title">작은 병정들의 큰 재주</h3><div className="troop-guide">{BASE_TROOP_TYPES.map(type => <div key={type}><ToyIcon type={type} size={48} color="blue" /><div><h4><span>{TROOPS[type].power || '★'}</span> {TROOPS[type].name}</h4><p>{TROOPS[type].ability}</p></div></div>)}</div>
    {SHOW_RULE_OPTIONS && <><h3 className="rules-section-title">확장 규칙 <small>방을 만들 때 골라요</small></h3><div className="rule-guide">{RULE_KEYS.map(key => <div key={key}><strong>{RULE_INFO[key].name}</strong><p>{RULE_INFO[key].detail}</p></div>)}</div><div className="troop-guide">{EXPANSION_TROOP_TYPES.map(type => <div key={type}><ToyIcon type={type} size={48} color="red" /><div><h4><span>{TROOPS[type].power || '★'}</span> {TROOPS[type].name}</h4><p>{TROOPS[type].ability}</p></div></div>)}</div></>}
    <p className="rules-note">별 표시가 있는 거점에 놓으면 다른 거점의 내 병정을 손으로 데려올 수 있어요. 선공은 3개, 후공은 4개로 시작해요. 더는 뽑거나 놓을 수 없다면 훈장을 비교하며, 동점이면 행동하지 못한 쪽이 져요. 한 차례에 생각할 시간은 {TURN_SECONDS}초예요. 시간이 지나면 병정을 뽑고 차례가 넘어가고, 뽑을 수 없을 때는 가장 약한 병정이 알아서 놓여요.</p>
    <a className="text-link" href="https://cdn.svc.asmodee.net/production-rprod/storage/games/toy_battle/rules/toy-ko01-rules-1744030100PWrDL.pdf" target="_blank" rel="noreferrer">공식 규칙서 읽기 <ArrowRight size={15} /></a>
  </Dialog>;
}

function Login({ onEnter, busy, connected, onRules, invite }: { onEnter: (name: string) => void; busy: boolean; connected: boolean; onRules: () => void; invite: string | null }) {
  const [name, setName] = useState('');
  function submit(e: FormEvent) { e.preventDefault(); if (name.trim()) onEnter(name.trim()); }
  return <main className="landing page-width"><div className="landing-main"><section className="landing-copy"><div className="eyebrow"><span className="tiny-line" /> 둘이서 즐기는 작은 승부</div><h1>오늘,<br />한 판 <span className="serif-word">어때요?</span><span className="title-star">✳</span></h1><p className="intro-copy">장난감 병정을 놓고, 길을 잇고, 성을 차지해요.<br />친구 한 명이면 준비 끝.</p><form className="login-form" onSubmit={submit}><label htmlFor="nickname">어떤 이름으로 불러드릴까요?</label><div className="input-action"><input id="nickname" placeholder="이름을 입력해 주세요" maxLength={16} autoComplete="nickname" value={name} onChange={e => setName(e.target.value)} required /><button className="button primary" disabled={!name.trim() || busy || !connected} type="submit">{busy ? '들어가는 중' : '놀러 가기'}<ArrowRight size={19} /></button></div><span className="input-note">{invite ? `초대받은 방 ${invite}에 이름만 입력하고 들어가세요.` : '가입 없이, 이름만 있으면 돼요.'}</span></form><div className="landing-meta"><span><Users size={17} /> 2명</span><span><Clock3 size={17} /> 약 15분</span><button onClick={onRules}><HelpCircle size={17} /> 어떻게 하나요?</button></div></section><div className="landing-art"><div className="sticker">친구랑<br /><strong>한 판!</strong><Sparkles size={18} /></div><FieldPreview /><div className="art-caption"><span>펼치면 시작되는 우리 둘만의 보드게임.</span><span className="caption-arrow">↖</span></div></div></div><section className="how-to-strip"><div><span className="step-number">1</span><p><strong>이름을 정하고</strong><span>오늘의 플레이어가 되어 주세요.</span></p></div><ChevronRight className="step-arrow" size={19} /><div><span className="step-number">2</span><p><strong>친구를 부르고</strong><span>방을 만들고 초대 링크를 보내요.</span></p></div><ChevronRight className="step-arrow" size={19} /><div><span className="step-number">3</span><p><strong>한 판 시작!</strong><span>누가 먼저 할지는 운에 맡겨요.</span></p><span className="mini-dice">⚄</span></div></section></main>;
}

function PlayerSlot({ name, host, mine, connected, index }: { name?: string; host?: boolean; mine?: boolean; connected?: boolean; index: number }) {
  return <div className={`player-slot ${name ? 'filled' : ''}`}><div className={`avatar ${index === 0 ? 'blue' : 'red'} ${!name ? 'empty-avatar' : ''}`}>{name ? <ToyIcon type={index === 0 ? 'captain' : 'duck'} size={47} color={index === 0 ? 'blue' : 'red'} /> : <Plus size={25} />}</div><div><strong>{name || '친구를 기다리는 중'}{mine && <small>나</small>}</strong><span>{name ? `${host ? '방장 · ' : ''}${connected ? '준비됐어요' : '다시 연결하는 중'}` : '초대 링크를 보내 보세요'}</span></div>{name && <span className={`player-ready ${connected ? '' : 'offline'}`}>{connected ? <Check size={17} /> : <WifiOff size={17} />}</span>}</div>;
}

function ScorePlayer({ game, room, id, mine }: { game: GameView; room: RoomView; id: string; mine: boolean }) {
  const p = game.players.find(p => p.id === id)!;
  const person = room.players.find(p => p.id === id);
  return <div className={`score-player ${p.index === 0 ? 'blue-side' : 'red-side'} ${game.currentPlayerId === id ? 'is-turn' : ''}`}><div className={`avatar ${p.index === 0 ? 'blue' : 'red'}`}><ToyIcon type={p.index === 0 ? 'captain' : 'duck'} size={40} color={p.index === 0 ? 'blue' : 'red'} /></div><div className="score-player-name"><strong>{person?.name || '플레이어'}{mine && <small>나</small>}</strong><span>{person?.connected === false ? '다시 연결하는 중' : `${p.id === game.firstPlayerId ? '선공' : '후공'} · 병정 ${p.handCount}개`}</span></div><div className="score-medals"><Medal size={21} /><strong>{p.medals}<small>/ 7</small></strong></div></div>;
}

const ORIENTATION_KEY = 'little-battle.orientation';
/** Phones start with the field standing upright; a choice made with the toggle is remembered on this device. */
function initialOrientation(): BoardOrientation {
  try {
    const saved = localStorage.getItem(ORIENTATION_KEY);
    if (saved === 'portrait' || saved === 'landscape') return saved;
  } catch { /* Private mode can disable storage. */ }
  return window.matchMedia('(max-width: 640px)').matches ? 'portrait' : 'landscape';
}

interface BoardEvent { id: number; troop: Troop; mine: boolean; text: string }

/**
 * Turns a discard into something the victim actually sees. Compares each new state with the
 * previous one: a troop that just entered the discard pile came either from a hand (XB-42) or
 * from a base (거인병), and the log line names the base.
 */
function useDiscardEvents(game: GameView, meId: string) {
  const previous = useRef(game);
  const [events, setEvents] = useState<BoardEvent[]>([]);
  useEffect(() => {
    const before = previous.current;
    previous.current = game;
    if (before.revision >= game.revision) return;
    const known = new Set(before.discarded.map(t => t.id));
    const fresh = game.discarded.filter(t => !known.has(t.id));
    if (!fresh.length) return;
    const handIds = new Set(before.hand.map(t => t.id));
    // The log written by the same action says what did it: a robot, a giant, a bomb, or a duck defusing one.
    const lastSeen = before.log.at(-1)?.id ?? 0;
    const story = game.log.filter(entry => entry.id > lastSeen).map(entry => entry.text).join(' ');
    const cause = story.includes('폭탄이 터져') ? 'bomb' : story.includes('해체') ? 'defuse' : story.includes('상대 손에서') ? 'robot' : 'giant';
    const next = fresh.map((troop, index): BoardEvent => {
      const mine = troop.ownerId === meId;
      const name = withObjectParticle(TROOPS[troop.type].name);
      const id = game.revision * 10 + index;
      if (cause === 'bomb') return { id, troop, mine, text: mine ? `폭탄을 밟아 ${name} 잃었어요.` : `상대가 내 폭탄을 밟았어요. ${name} 잃었네요.` };
      if (cause === 'defuse') return { id, troop, mine, text: mine ? '상대 꽉스가 내 폭탄을 해체했어요.' : '꽉스가 상대 폭탄을 해체했어요.' };
      if (cause === 'robot' || handIds.has(troop.id)) return { id, troop, mine, text: mine ? `상대의 XB-42가 내 손에서 ${name} 뺏어 갔어요.` : `상대 손에서 ${name} 버리게 했어요.` };
      const base = Object.entries(before.board).find(([, stack]) => stack.some(t => t.id === troop.id))?.[0];
      return { id, troop, mine, text: mine ? `상대 거인병이 ${base ? NODE_BY_ID[base]!.label + '의 ' : ''}내 ${name} 밀어냈어요.` : `상대의 ${name} 판에서 치웠어요.` };
    });
    setEvents(current => [...current, ...next]);
    const timer = setTimeout(() => setEvents(current => current.filter(event => !next.includes(event))), 3600);
    return () => clearTimeout(timer);
  }, [game, meId]);
  return events;
}

/** Counts down from the server's snapshot; every state message re-syncs it, so clock drift never builds up. */
function useTurnClock(timer: RoomView['turnTimer']) {
  const [remaining, setRemaining] = useState<number | null>(null);
  useEffect(() => {
    if (!timer) { setRemaining(null); return; }
    if (!timer.running) { setRemaining(timer.remainingMs); return; }
    const deadline = Date.now() + timer.remainingMs;
    const tick = () => setRemaining(Math.max(0, deadline - Date.now()));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [timer]);
  return remaining;
}

function GameScreen({ room, meId, busy, send, onLeave }: { room: RoomView; meId: string; busy: boolean; send: (event: string, data?: object) => Promise<boolean>; onLeave: () => void }) {
  const game = room.game!;
  const [selected, setSelected] = useState<string | null>(null);
  const [useAbility, setUseAbility] = useState(true);
  const [showLog, setShowLog] = useState(false);
  const [inspect, setInspect] = useState<string | null>(null);
  const [resultHidden, setResultHidden] = useState(false);
  const [orientation, setOrientation] = useState<BoardOrientation>(initialOrientation);
  const mine = game.currentPlayerId === meId;
  const finished = game.status === 'finished';
  const ownPlayer = game.players.find(p => p.id === meId)!;
  const pending = mine ? game.pending : null;
  const troop = game.hand.find(t => t.id === selected);
  const definition = troop ? TROOPS[troop.type] : null;
  const legal = pending && pending.type !== 'extra-place' ? pending.nodeIds : selected ? game.legalPlacements[selected] || [] : [];
  const roadChoices: [string, string][] = pending?.type === 'edge' ? pending.nodeIds.map(nodeId => [pending.sourceNodeId, nodeId]) : [];
  const other = room.players.find(p => p.id !== meId);
  const clock = useTurnClock(room.turnTimer);
  const events = useDiscardEvents(game, meId);
  const [handCollapsed, setHandCollapsed] = useState(false);
  // A folded hand opens again when it is your move, so a turn never starts with the cards hidden.
  useEffect(() => { if (mine && !finished) setHandCollapsed(false); }, [mine, finished]);
  const urgent = Boolean(clock !== null && clock <= 10_000 && mine && !finished && room.turnTimer?.running);
  const drawCount = Math.min(2, ownPlayer.supplyCount, 8 - game.hand.length);
  useEffect(() => { setSelected(null); setUseAbility(true); }, [game.revision]);
  useEffect(() => { setResultHidden(false); }, [game.status]);
  function toggleOrientation() {
    const next: BoardOrientation = orientation === 'portrait' ? 'landscape' : 'portrait';
    try { localStorage.setItem(ORIENTATION_KEY, next); } catch { /* no storage */ }
    setOrientation(next);
  }
  async function place(nodeId: string) {
    if (!mine || busy || finished || !legal.includes(nodeId)) { if (game.board[nodeId]?.length) setInspect(nodeId); return; }
    if (pending && pending.type !== 'extra-place') await send('game:action', { type: 'choose', nodeId });
    else if (selected) await send('game:action', { type: 'place', troopId: selected, nodeId, useAbility });
  }
  const hint = finished ? '이번 판이 끝났어요.' : !mine ? `${other?.name || '상대'}님이 생각하고 있어요.` : pending?.type === 'remove' ? '거인병 효과예요. 인접한 상대 병정 하나를 골라 버려요.' : pending?.type === 'recover' ? '북 거점 효과예요. 판 위의 내 병정 하나를 손으로 데려올 수 있어요.' : pending?.type === 'extra-place' ? '캡틴 효과예요. 병정을 하나 더 놓을 수 있어요.' : pending?.type === 'edge' ? '공병 효과예요. 길 건너편 거점을 누르면 그 길을 끊거나 다시 이어요.' : pending?.type === 'move-from' ? '기사 효과예요. 옮길 내 병정을 골라 주세요.' : pending?.type === 'move-to' ? '어디로 옮길까요? 빛나는 거점을 눌러 주세요.' : selected ? legal.length ? '빛나는 거점에 병정을 놓아 주세요.' : '이 병정을 놓을 수 있는 곳이 없어요.' : '병정을 고르거나, 2개를 뽑아 주세요.';
  // A phone's hand dock covers the bottom of the board, so the same status strip also sits on top of the dock.
  const turnBar = (placement: string) => <div className={`turn-bar ${placement} ${mine && !finished ? 'my-turn' : ''} ${urgent ? 'is-urgent' : ''}`}><span className="status-dot" /><strong>{finished ? '게임 종료' : mine ? '내 차례' : '상대 차례'}</strong><span>{hint}</span>{clock !== null && room.turnTimer && !finished && <span className="turn-clock" title="한 차례에 생각할 수 있는 시간"><Timer size={13} />{room.turnTimer.running ? `${Math.ceil(clock / 1000)}초` : '잠시 멈춤'}</span>}{finished && resultHidden && <button className="text-button turn-bar-action" onClick={() => setResultHidden(false)}>결과 다시 보기</button>}{clock !== null && room.turnTimer?.running && !finished && <i className="turn-clock-bar" style={{ width: `${Math.max(0, Math.min(100, clock / room.turnTimer.totalMs * 100))}%` }} />}</div>;
  return <main className={`game-screen page-width ${handCollapsed ? 'hand-collapsed' : ''}`}><div className="game-title-row"><button className="text-button" onClick={onLeave}><ArrowLeft size={16} /> 방 나가기</button><span>{room.title}<span className="room-code-small">{room.code}</span></span><button className="text-button log-toggle" onClick={() => setShowLog(!showLog)}>지난 차례</button></div><div className="scoreboard"><ScorePlayer game={game} room={room} id={game.players[0].id} mine={game.players[0].id === meId} /><div className="versus"><span>성채 평원</span><strong>vs.</strong><span>{game.turn}번째 차례</span></div><ScorePlayer game={game} room={room} id={game.players[1].id} mine={game.players[1].id === meId} /></div><div className="game-layout"><section className="board-wrap"><div className="board-heading"><span><Flag size={15} /> 성채 평원 <small>기본맵</small><RuleBadges rules={game.rules} /></span><span><Medal size={15} /> 훈장 7개 또는 상대 본부 점령</span></div><div className="board-stage"><Board game={game} legalNodes={legal} onNodeClick={place} selectedNodeId={pending?.sourceNodeId} orientation={orientation} bottomIndex={ownPlayer.index} onToggleOrientation={toggleOrientation} highlightEdges={roadChoices} />{events.length > 0 && <div className="board-events" aria-live="assertive">{events.map(event => <div key={event.id} className={`board-event ${event.mine ? 'is-loss' : 'is-gain'}`}><span className="board-event-icon"><ToyIcon type={event.troop.type} size={46} color={game.players[0].id === event.troop.ownerId ? 'blue' : 'red'} /><X size={14} /></span><p><strong>{event.mine ? '병정을 잃었어요' : '상대 병정을 버렸어요'}</strong><span>{event.text}</span></p></div>)}</div>}</div>{turnBar('turn-bar--board')}</section><aside className={`game-sidebar ${showLog ? 'show-log' : ''}`}><div className="sidebar-title"><h3>지난 차례</h3><button className="icon-button log-close" aria-label="기록 닫기" onClick={() => setShowLog(false)}><X size={18} /></button><span>기록</span></div><div className="game-log" aria-live="polite">{[...game.log].reverse().map(entry => <div key={entry.id}><span className={game.players[0].id === entry.playerId ? 'blue-dot' : 'red-dot'} /><p><strong>{room.players.find(p => p.id === entry.playerId)?.name || '플레이어'}</strong><span>{entry.text}</span></p><small>{entry.turn}</small></div>)}</div><div className="sidebar-tip"><Flag size={22} /><p>성으로 가는 길을<br />차근차근 이어 보세요.</p><span>길이 끊기면 더 나아갈 수 없어요.</span></div></aside></div>
    <section className={`hand-dock ${!mine ? 'waiting-turn' : ''} ${handCollapsed ? 'is-collapsed' : ''}`}>{turnBar('turn-bar--dock')}<div className="hand-topline"><h3><button type="button" className="hand-toggle" onClick={() => setHandCollapsed(!handCollapsed)} aria-expanded={!handCollapsed} aria-label={handCollapsed ? '병정 펼치기' : '병정 접기'}>{handCollapsed ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</button>내 병정 <span>{game.hand.length} / 8</span>{handCollapsed && definition && <em className="hand-selected-note">{definition.name} 선택 중</em>}</h3><div className="hand-action">{pending ? <button className="button secondary compact" disabled={busy || finished} onClick={() => send('game:action', { type: 'skip' })}>능력 건너뛰기 <ChevronRight size={15} /></button> : <button className="button primary compact" disabled={!game.canDraw || busy || finished} onClick={() => send('game:action', { type: 'draw' })}><Plus size={17} /> {drawCount > 0 ? `병정 ${drawCount}개 뽑기` : ownPlayer.supplyCount ? '손이 가득 찼어요' : '뽑을 병정이 없어요'}</button>}<span className="supply-count">남은 병정 {ownPlayer.supplyCount}개</span></div></div><div className="hand-cards">{game.hand.map((t, i) => <button className={`troop-card ${ownPlayer.index === 0 ? 'blue-card' : 'red-card'} ${selected === t.id ? 'selected' : ''}`} key={t.id} aria-label={`${TROOPS[t.type].name}, 힘 ${TROOPS[t.type].power || '조커'}`} aria-pressed={selected === t.id} style={{ '--card-index': i } as React.CSSProperties} onClick={() => { setSelected(selected === t.id ? null : t.id); setUseAbility(true); }} disabled={busy || finished}><span className="troop-power">{TROOPS[t.type].power || '★'}</span><ToyIcon type={t.type} size={65} color={ownPlayer.index === 0 ? 'blue' : 'red'} /><strong>{TROOPS[t.type].name}</strong><span className="troop-skill">{SKILL_LABEL[t.type]}</span></button>)}{game.hand.length === 0 && <p className="empty-hand">손이 비었어요. 병정을 뽑아 주세요.</p>}<div className="hand-end"><span>한 수,<br />신중하게.</span><span>↙</span></div></div><div className="selected-description">{definition ? <><strong>{definition.name}</strong><span>{definition.ability}</span>{OPTIONAL_ABILITY.includes(troop!.type) && mine && <label><input type="checkbox" checked={useAbility} onChange={e => setUseAbility(e.target.checked)} /> 능력 사용</label>}</> : <span>{mine ? '병정을 누르면 능력과 놓을 수 있는 곳이 보여요.' : '내 병정을 눌러 다음 수를 미리 생각해 보세요.'}</span>}</div></section>
    {finished && !resultHidden && <Dialog title={game.winnerId === meId ? '이번 판은, 내 승리!' : '좋은 승부였어요.'} onClose={() => setResultHidden(true)}><div className="result-content"><div className={`result-medal ${game.winnerId === meId ? '' : 'lost'}`}><Medal size={58} /></div><h3>{room.players.find(p => p.id === game.winnerId)?.name}님의 승리</h3><p>{game.winReason === 'headquarters' ? '상대 본부를 점령했어요.' : game.winReason === 'medals' ? '훈장 7개를 먼저 모았어요.' : game.winReason === 'forfeit' ? '상대가 게임을 떠났어요.' : '더는 놓을 병정이 없어 훈장으로 승부를 정했어요.'}</p><div className="result-score">{room.players.map(p => <span key={p.id}>{p.name}<strong>{game.players.find(gp => gp.id === p.id)?.medals}<small>훈장</small></strong></span>)}</div><button className="button primary full" disabled={busy || room.rematchVotes.includes(meId) || !other?.connected} onClick={() => send('game:rematch')}>{room.rematchVotes.includes(meId) ? '친구의 답을 기다리는 중' : room.rematchVotes.length ? '좋아요, 한 판 더!' : '한 판 더 하기'}<Shuffle size={17} /></button><button className="text-button result-leave" onClick={onLeave}>대기실로 나가기 <ArrowRight size={15} /></button></div></Dialog>}
    {inspect && <Dialog title="거점에 놓인 병정" onClose={() => setInspect(null)}><p className="muted">위에 있는 병정이 이 거점을 차지해요.</p><div className="stack-list">{[...(game.board[inspect] || [])].reverse().map((t, i) => <div key={t.id}><ToyIcon type={t.type} size={44} color={game.players[0].id === t.ownerId ? 'blue' : 'red'} /><span>{TROOPS[t.type].name}<small>{room.players.find(p => p.id === t.ownerId)?.name}</small></span><strong>{TROOPS[t.type].power || '★'}</strong>{i === 0 && <small>맨 위</small>}</div>)}</div></Dialog>}
  </main>;
}

export default function App() {
  const client = useGame();
  const { me, room, rooms, busy, connected, restoring, replaced, error, setError, send } = client;
  const [rules, setRules] = useState(false);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [roomTitle, setRoomTitle] = useState('');
  const [roomRules, setRoomRules] = useState<GameRules>({ flank: false, depots: false, expansion: false });
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState('');
  const invite = useRef(new URLSearchParams(window.location.search).get('room'));
  const attemptedInvite = useRef('');
  const [filter, setFilter] = useState<'waiting' | 'all'>('waiting');
  useEffect(() => { if (!me || !connected || room || !invite.current || attemptedInvite.current === me.id) return; attemptedInvite.current = me.id; void send('rooms:join', { code: invite.current }); }, [me, connected, room, send]);
  useEffect(() => { if (!error && !toast) return; const timer = setTimeout(() => { setError(''); setToast(''); }, 5500); return () => clearTimeout(timer); }, [error, toast, setError]);
  async function createRoom(e: FormEvent) { e.preventDefault(); if (await send('rooms:create', { title: roomTitle.trim() || `${me!.name}님의 방`, rules: roomRules })) { setCreating(false); setRoomTitle(''); } }
  async function joinRoom(e: FormEvent) { e.preventDefault(); if (await send('rooms:join', { code: code.trim().toUpperCase() })) { setJoining(false); setCode(''); } }
  async function copyInvite() { if (!room) return; const url = new URL(window.location.href); url.search = ''; url.searchParams.set('room', room.code); try { await navigator.clipboard.writeText(url.toString()); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { setToast(`초대 코드는 ${room.code}예요. 친구에게 알려 주세요.`); } }
  async function leaveRoom() { if (await send('rooms:leave')) { setLeaving(false); invite.current = null; window.history.replaceState({}, '', window.location.pathname); } }
  const isPlaying = Boolean(room?.game);
  return <div className={`app ${isPlaying ? 'in-game' : ''}`}><header className="site-header page-width"><Brand /><nav>{me && <span className="header-player"><span className="status-dot" />{me.name}<small>님</small></span>}<button className="text-button rules-button" onClick={() => setRules(true)}><HelpCircle size={17} /><span>게임 방법</span></button>{me && !room && <button className="icon-button logout-button" onClick={client.logout} aria-label="이름 바꾸기" title="이름 바꾸기"><LogOut size={18} /></button>}</nav></header>{replaced ? <div className="connection-banner" role="status"><WifiOff size={15} /> 다른 탭에서 접속해서 이 탭은 잠시 쉬고 있어요.<button className="banner-button" onClick={client.reconnect}>여기서 계속하기</button></div> : !connected && <div className="connection-banner" role="status"><WifiOff size={15} /> 서버에 연결하는 중이에요. 잠시만 기다려 주세요.</div>}
    {restoring ? <main className="loading-page"><span className="loading-dice">⚄</span><p>자리를 찾고 있어요.</p></main> : !me ? <Login onEnter={name => void send('session:enter', { name })} busy={busy} connected={connected} onRules={() => setRules(true)} invite={invite.current} /> : room?.game ? <GameScreen room={room} meId={me.id} busy={busy || !connected} send={send} onLeave={() => setLeaving(true)} /> : room ? <main className="waiting-page page-width"><div className="page-topline"><button className="text-button" onClick={() => void leaveRoom()}><ArrowLeft size={16} /> 대기실로</button><span className="eyebrow">ROOM {room.code}</span></div><div className="waiting-heading"><span className="eyebrow">자, 자리를 잡아 볼까요?</span><h1>{room.title}</h1><p>{room.players.length === 2 ? '둘 다 모였네요. 이제 시작해 볼까요?' : '한 자리 비워 뒀어요. 같이 놀 친구를 불러 주세요.'}</p><p className="waiting-rules">{enabledRules(room.rules).length ? <>이 방의 규칙 <RuleBadges rules={room.rules} /></> : '기본 규칙으로 해요.'}</p></div><div className="waiting-grid"><FieldPreview /><section className="waiting-panel"><div className="panel-label"><h2>오늘의 플레이어</h2><span>{room.players.length} / 2</span></div>{[0, 1].map(i => { const p = room.players[i]; return <PlayerSlot key={i} index={i} name={p?.name} mine={p?.id === me.id} host={p?.isHost} connected={p?.connected} />; })}<div className="invite-box"><div><span>친구에게 이 코드를 알려 주세요</span><strong>{room.code}</strong></div><button className="button secondary compact" onClick={copyInvite}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? '복사했어요' : '초대 링크'}</button></div><div className="start-area"><span><Shuffle size={15} /> 선공은 무작위 · 한 차례 {TURN_SECONDS}초</span><button className="button primary full" disabled={busy || !connected || room.players.length !== 2 || room.players.some(p => !p.connected) || room.hostId !== me.id} onClick={() => send('game:start')}>{room.hostId !== me.id ? '방장이 시작하기를 기다리는 중' : room.players.length < 2 ? '친구가 오면 시작할 수 있어요' : '게임 시작'}<ArrowRight size={19} /></button></div>{room.notice && <p className="room-notice">{room.notice}</p>}</section></div></main> : <main className="lobby page-width"><div className="lobby-heading"><div><div className="eyebrow"><span className="status-dot" /> 플레이어 대기실</div><h1>반가워요, {me.name}님<span className="blue-punctuation">.</span></h1><p>빈자리에 앉거나, 새 판을 펼쳐 보세요.</p></div><button className="button primary" onClick={() => setCreating(true)}><Plus size={19} /> 방 만들기</button></div><div className="lobby-grid"><section className="lobby-field"><FieldPreview /><div className="lobby-field-note"><div><span className="eyebrow">THE CLASSIC</span><h2>성채 평원</h2><p>첫 수는 가볍게, 마지막 수는 신중하게.</p></div><button className="round-arrow" onClick={() => setRules(true)} aria-label="성채 평원 게임 방법"><ArrowRight size={23} /></button></div><div className="field-facts"><span><Users size={16} /> 2인 대전</span><span><Clock3 size={16} /> 약 15분</span><span><Medal size={16} /> 목표 훈장 7개</span><span><Timer size={16} /> 차례당 {TURN_SECONDS}초</span></div></section><section className="room-list-panel"><div className="room-list-top"><h2>열린 방 <span>{rooms.length}</span></h2><button className="text-button" onClick={() => setJoining(true)}>코드로 입장 <ArrowRight size={15} /></button></div><div className="room-filters"><button className={filter === 'waiting' ? 'active' : ''} onClick={() => setFilter('waiting')}>기다리는 방</button><button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>모든 방</button></div><div className="room-list">{rooms.filter(r => filter === 'all' || r.canJoin).map(r => <button key={r.id} className="room-row" disabled={!r.canJoin || busy} onClick={() => send('rooms:join', { id: r.id })}><span className={`room-icon ${r.canJoin ? '' : 'room-in-play'}`}><Flag size={22} /></span><span className="room-row-name"><strong>{r.title}</strong><span>{r.hostName} · 성채 평원<RuleBadges rules={r.rules} className="rule-badges--row" /></span></span><span className="room-row-right"><span className={r.canJoin ? 'open-badge' : 'playing-badge'}>{r.canJoin ? '참가 가능' : r.phase === 'playing' ? '게임 중' : '자리 없음'}</span><span><Users size={14} />{r.playerCount}/2</span></span>{r.canJoin && <ChevronRight size={17} />}</button>)}{rooms.filter(r => filter === 'all' || r.canJoin).length === 0 && <div className="empty-rooms"><div className="empty-illustration"><ToyIcon type="duck" color="blue" size={78} /><span>…</span></div><h3>{filter === 'all' ? '아직 펼쳐진 판이 없어요' : '아직 기다리는 방이 없어요'}</h3><p>첫 번째 방의 주인이 되어 보세요.<br />초대 링크로 친구를 부를 수 있어요.</p><button className="text-link" onClick={() => setCreating(true)}>우리 방 만들기 <ArrowRight size={16} /></button></div>}</div><div className="room-list-foot"><span className="status-dot" /> 방 목록은 실시간으로 바뀌어요</div></section></div></main>}
    {!isPlaying && <footer className="site-footer page-width"><span>작은 전투, 즐거운 시간.</span><span>토이 배틀에서 영감을 받은 비공식 플레이 공간<span className="footer-dot">·</span><a href="https://www.rprod.com/en/games/toy-battle" target="_blank" rel="noreferrer">원작 소개 ↗</a></span></footer>}
    {rules && <Rules onClose={() => setRules(false)} />}
    {creating && <Dialog title="새 판을 펼쳐요" onClose={() => setCreating(false)}><p className="dialog-copy">친구가 알아볼 수 있는 이름이면 좋아요.</p><form onSubmit={createRoom}><label className="field-label" htmlFor="room-title">방 이름</label><input className="text-input" id="room-title" placeholder={`${me?.name}님의 방`} maxLength={32} value={roomTitle} onChange={e => setRoomTitle(e.target.value)} autoFocus /><div className="map-selection"><Flag size={24} /><div><strong>성채 평원</strong><span>기본맵 · 2명 · 목표 훈장 7개</span></div><Check size={20} /></div>{SHOW_RULE_OPTIONS && <fieldset className="rule-options"><legend>확장 규칙 <small>안 고르면 기본 규칙이에요</small></legend>{RULE_KEYS.map(key => <label key={key} className={roomRules[key] ? 'is-on' : ''}><input type="checkbox" checked={roomRules[key]} onChange={e => setRoomRules({ ...roomRules, [key]: e.target.checked })} /><span><strong>{RULE_INFO[key].name}</strong><small>{RULE_INFO[key].detail}</small></span></label>)}</fieldset>}<button className="button primary full" disabled={busy || !connected} type="submit">방 만들기 <ArrowRight size={18} /></button></form></Dialog>}
    {joining && <Dialog title="친구가 기다리고 있나요?" onClose={() => setJoining(false)}><p className="dialog-copy">친구에게 받은 6자리 코드를 입력해 주세요.</p><form onSubmit={joinRoom}><label className="field-label" htmlFor="invite-code">초대 코드</label><input className="text-input code-input" id="invite-code" autoCapitalize="characters" autoComplete="off" placeholder="ABC123" maxLength={6} value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} autoFocus /><button className="button primary full" type="submit" disabled={code.length !== 6 || busy}>방 들어가기 <ArrowRight size={18} /></button></form></Dialog>}
    {leaving && <Dialog title="이 방에서 나갈까요?" onClose={() => setLeaving(false)}><p className="dialog-copy">{room?.game?.status === 'playing' ? '진행 중인 게임이 끝나고 대기실로 돌아가요.' : '대기실에서 새로운 방을 만들 수 있어요.'}</p><div className="dialog-buttons"><button className="button secondary" onClick={() => setLeaving(false)}>계속 있을게요</button><button className="button primary" disabled={busy} onClick={() => void leaveRoom()}>나가기 <LogOut size={16} /></button></div></Dialog>}
    {(error || toast) && <div className={`toast ${error ? 'toast-error' : ''}`} role="status" aria-live="polite"><span>{error || toast}</span><button aria-label="알림 닫기" onClick={() => { setError(''); setToast(''); }}><X size={16} /></button></div>}
  </div>;
}
