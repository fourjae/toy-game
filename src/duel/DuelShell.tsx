import { useEffect, useRef, useState, type ComponentType, type FormEvent, type ReactNode } from 'react';
import {
  ArrowLeft, ArrowRight, Check, ChevronRight, Clock3, Copy, HelpCircle, LayoutGrid, LogOut, Plus, Users, WifiOff, X,
} from 'lucide-react';
import { useGame } from '../useGame';
import Dialog from '../components/Dialog';
import type { DuelClientState, DuelRoomView } from '../../server/types';
import './duel.css';

/**
 * The entry, lobby and waiting room every game on server/duel.ts shares. A game hands in its words,
 * its art, its rules and its table; the shell styles itself from the theme's CSS variables.
 */

export function useDuel<View, Options>(namespace: string, tokenKey: string) {
  return useGame<DuelClientState<View, Options>>({ namespace, tokenKey }, { me: null, rooms: [], room: null });
}
export type DuelClient<View = unknown, Options = unknown> = ReturnType<typeof useDuel<View, Options>>;

export interface TableProps<View, Options> {
  room: DuelRoomView<View, Options> & { game: View };
  meId: string;
  client: DuelClient<View, Options>;
}

export interface OptionsPickerProps<Options> { value: Options; onChange: (value: Options) => void; disabled?: boolean }

export interface DuelTheme<View, Options> {
  /** CSS hook: the shell renders `.duel-app.theme-<key>`. */
  key: string;
  name: string;
  latin: string;
  documentTitle: string;
  namespace: string;
  tokenKey: string;
  minutes: string;
  landing: { eyebrow: string; title: ReactNode; intro: ReactNode; cta: string; caption: string };
  lobbyLine: string;
  createTitle: string;
  defaultRoomTitle: (name: string) => string;
  seatsTitle: string;
  startLabel: string;
  facts: Array<{ icon: ReactNode; text: string }>;
  roomIcon: ReactNode;
  emptyIcon: ReactNode;
  defaultOptions: Options;
  roomMeta?: (options: Options) => string;
  OptionsPicker?: ComponentType<OptionsPickerProps<Options>>;
  Art: ComponentType;
  Backdrop: ComponentType<{ inGame: boolean }>;
  Rules: ComponentType<{ onClose: () => void }>;
  Table: ComponentType<TableProps<View, Options>>;
}

export function LeaveDialog({ client, finished, inGame, onClose }: { client: DuelClient; finished?: boolean; inGame?: boolean; onClose: () => void }) {
  return <Dialog title="이 방에서 나갈까요?" onClose={onClose}>
    <p className="duel-dialog-copy">{!inGame ? '나가면 대기실에서 새 방을 만들거나 다른 방에 들어갈 수 있어요.' : finished ? '대기실로 돌아가요.' : '지금 나가면 진행 중인 게임이 끝나고 상대도 대기실로 돌아가요.'}</p>
    <div className="duel-dialog-buttons">
      <button className="duel-button secondary" onClick={onClose}>계속 있을게요</button>
      <button className="duel-button primary" disabled={client.busy} onClick={async () => { if (await client.send('rooms:leave')) { onClose(); window.history.replaceState({}, '', window.location.pathname); } }}>나가기 <LogOut size={15} /></button>
    </div>
  </Dialog>;
}

export function LogDialog({ log, meId, names, onClose }: { log: Array<{ id: number; playerId: string; text: string; round: number }>; meId: string; names: Record<string, string>; onClose: () => void }) {
  return <Dialog title="지난 차례" onClose={onClose}>
    <div className="duel-log">
      {[...log].reverse().map(entry => <div key={entry.id}><span className={entry.playerId === meId ? 'me' : 'opp'} /><p><strong>{names[entry.playerId] ?? '플레이어'}</strong>{entry.text}</p><small>{entry.round}R</small></div>)}
      {!log.length && <p className="duel-dialog-copy">아직 아무도 움직이지 않았어요.</p>}
    </div>
  </Dialog>;
}

/** The two buttons under every result: vote for the next round / rematch, or go back to the lobby. */
export function ReadyButtons({ room, meId, client, finished, nextLabel }: { room: DuelRoomView; meId: string; client: DuelClient; finished: boolean; nextLabel: string }) {
  const voted = room.readyVotes.includes(meId);
  const oppOnline = room.players.find(p => p.id !== meId)?.connected;
  return <>
    <button className="duel-button primary full" disabled={client.busy || voted || !oppOnline} onClick={() => client.send('game:ready')}>
      {voted ? '친구의 답을 기다리는 중' : finished ? '한 판 더 하기' : nextLabel}<ArrowRight size={17} />
    </button>
    <button className="duel-text-button duel-result-leave" onClick={async () => { if (await client.send('rooms:leave')) window.history.replaceState({}, '', window.location.pathname); }}>대기실로 나가기 <ArrowRight size={14} /></button>
  </>;
}

function Landing<V, O>({ theme, onEnter, busy, connected, onRules, invite }: { theme: DuelTheme<V, O>; onEnter: (name: string) => void; busy: boolean; connected: boolean; onRules: () => void; invite: string | null }) {
  const [name, setName] = useState('');
  function submit(e: FormEvent) { e.preventDefault(); if (name.trim()) onEnter(name.trim()); }
  const { Art } = theme;
  return <main className="duel-landing duel-width">
    <section className="duel-landing-copy">
      <div className="eyebrow"><span className="tiny-line" /> {theme.landing.eyebrow}</div>
      <h1>{theme.landing.title}</h1>
      <p className="duel-intro">{theme.landing.intro}</p>
      <form className="duel-form" onSubmit={submit}>
        <label htmlFor={`${theme.key}-nickname`}>어떤 이름으로 불러드릴까요?</label>
        <div className="duel-input-action">
          <input id={`${theme.key}-nickname`} placeholder="이름을 입력해 주세요" maxLength={16} autoComplete="nickname" value={name} onChange={e => setName(e.target.value)} required />
          <button className="duel-button primary" disabled={!name.trim() || busy || !connected} type="submit">{busy ? '들어가는 중' : theme.landing.cta}<ArrowRight size={18} /></button>
        </div>
        <span className="duel-note">{invite ? `초대받은 방 ${invite}에 이름만 입력하고 들어가세요.` : '가입 없이, 이름만 있으면 돼요.'}</span>
      </form>
      <div className="duel-meta"><span><Users size={16} /> 2명</span><span><Clock3 size={16} /> {theme.minutes}</span><button type="button" onClick={onRules}><HelpCircle size={16} /> 어떻게 하나요?</button></div>
    </section>
    <div className="duel-landing-art"><Art /><p>{theme.landing.caption}</p></div>
  </main>;
}

function Lobby<V, O>({ theme, client, onRules }: { theme: DuelTheme<V, O>; client: DuelClient<V, O>; onRules: () => void }) {
  const { me, rooms, busy, send, connected } = client;
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [title, setTitle] = useState('');
  const [options, setOptions] = useState<O>(theme.defaultOptions);
  const [code, setCode] = useState('');
  const [filter, setFilter] = useState<'waiting' | 'all'>('waiting');
  const shown = rooms.filter(r => filter === 'all' || r.canJoin);
  const { Art, OptionsPicker } = theme;
  async function create(e: FormEvent) {
    e.preventDefault();
    if (await send('rooms:create', { title: title.trim() || theme.defaultRoomTitle(me!.name), options })) { setCreating(false); setTitle(''); }
  }
  async function join(e: FormEvent) {
    e.preventDefault();
    if (await send('rooms:join', { code: code.trim().toUpperCase() })) { setJoining(false); setCode(''); }
  }
  return <main className="duel-lobby duel-width">
    <div className="duel-lobby-heading">
      <div><div className="eyebrow"><span className="duel-dot" /> 플레이어 대기실</div><h1>반가워요, {me!.name}님<span className="duel-punct">.</span></h1><p>{theme.lobbyLine}</p></div>
      <button className="duel-button primary" onClick={() => setCreating(true)}><Plus size={18} /> 방 만들기</button>
    </div>
    <div className="duel-grid">
      <section className="duel-panel duel-feature">
        <div className="duel-feature-art"><Art /></div>
        <div className="duel-feature-note"><div><span className="eyebrow">{theme.latin}</span><h2>{theme.name}</h2></div><button className="duel-round-arrow" onClick={onRules} aria-label={`${theme.name} 게임 방법`}><ArrowRight size={22} /></button></div>
        <div className="duel-facts">{theme.facts.map(fact => <span key={fact.text}>{fact.icon} {fact.text}</span>)}</div>
      </section>
      <section className="duel-panel duel-rooms">
        <div className="duel-rooms-top"><h2>열린 방 <span>{rooms.length}</span></h2><button className="duel-text-button" onClick={() => setJoining(true)}>코드로 입장 <ArrowRight size={14} /></button></div>
        <div className="duel-filters"><button className={filter === 'waiting' ? 'active' : ''} onClick={() => setFilter('waiting')}>기다리는 방</button><button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>모든 방</button></div>
        <div className="duel-room-list">
          {shown.map(r => <button key={r.id} className="duel-room-row" disabled={!r.canJoin || busy} onClick={() => send('rooms:join', { id: r.id })}>
            <span className="duel-room-icon">{theme.roomIcon}</span>
            <span className="duel-room-name"><strong>{r.title}</strong><span>{r.hostName}{theme.roomMeta ? ` · ${theme.roomMeta(r.options)}` : ''}</span></span>
            <span className={r.canJoin ? 'duel-badge open' : 'duel-badge'}>{r.canJoin ? '참가 가능' : r.phase === 'playing' ? '게임 중' : '자리 없음'}</span>
            <span className="duel-room-count"><Users size={13} />{r.playerCount}/2</span>
            {r.canJoin && <ChevronRight size={16} />}
          </button>)}
          {shown.length === 0 && (rooms.length > 0
            // 기다리는 방만 보기에서 비었지만, 다른 방은 게임 중일 때: '첫 번째 방'이라고 하면 틀린 말이 된다.
            ? <div className="duel-empty">{theme.emptyIcon}<h3>모든 방이 게임 중이에요</h3><p>지금 {rooms.length}개 방에서 승부가 한창이에요. 새 방을 열고 친구를 불러 보세요.</p><span className="duel-empty-actions"><button className="duel-text-button" onClick={() => setCreating(true)}>새 방 만들기 <ArrowRight size={14} /></button><button className="duel-text-button" onClick={() => setFilter('all')}>모든 방 보기 <ArrowRight size={14} /></button></span></div>
            : <div className="duel-empty">{theme.emptyIcon}<h3>{filter === 'all' ? '아직 펼쳐진 판이 없어요' : '아직 기다리는 방이 없어요'}</h3><p>첫 번째 방의 주인이 되어 보세요.</p><button className="duel-text-button" onClick={() => setCreating(true)}>우리 방 만들기 <ArrowRight size={14} /></button></div>)}
        </div>
        <div className="duel-rooms-foot"><span className="duel-dot" /> 방 목록은 실시간으로 바뀌어요</div>
      </section>
    </div>
    {creating && <Dialog title={theme.createTitle} onClose={() => setCreating(false)}>
      <form onSubmit={create} className="duel-dialog-form">
        <label htmlFor={`${theme.key}-room-title`}>방 이름</label>
        <input id={`${theme.key}-room-title`} placeholder={theme.defaultRoomTitle(me!.name)} maxLength={32} value={title} onChange={e => setTitle(e.target.value)} autoFocus />
        {OptionsPicker && <OptionsPicker value={options} onChange={setOptions} />}
        <button className="duel-button primary full" disabled={busy || !connected} type="submit">방 만들기 <ArrowRight size={18} /></button>
      </form>
    </Dialog>}
    {joining && <Dialog title="친구가 기다리고 있나요?" onClose={() => setJoining(false)}>
      <form onSubmit={join} className="duel-dialog-form">
        <label htmlFor={`${theme.key}-invite-code`}>6자리 초대 코드</label>
        <input id={`${theme.key}-invite-code`} className="duel-code-input" autoCapitalize="characters" autoComplete="off" placeholder="ABC123" maxLength={6} value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} autoFocus />
        <button className="duel-button primary full" type="submit" disabled={code.length !== 6 || busy}>방 들어가기 <ArrowRight size={18} /></button>
      </form>
    </Dialog>}
  </main>;
}

function Waiting<V, O>({ theme, room, meId, client }: { theme: DuelTheme<V, O>; room: DuelRoomView<V, O>; meId: string; client: DuelClient<V, O> }) {
  const { busy, connected, send } = client;
  const [copied, setCopied] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const host = room.hostId === meId;
  const { Art, OptionsPicker } = theme;
  async function copyInvite() {
    const url = new URL(window.location.href);
    url.search = '';
    url.searchParams.set('room', room.code);
    try { await navigator.clipboard.writeText(url.toString()); setCopied(true); setTimeout(() => setCopied(false), 2500); }
    catch { client.setError(`초대 코드는 ${room.code}예요. 친구에게 알려 주세요.`); }
  }
  return <main className="duel-waiting duel-width">
    <div className="duel-topline"><button className="duel-text-button" onClick={() => setLeaving(true)}><ArrowLeft size={15} /> 대기실로</button><span className="eyebrow">ROOM {room.code}</span></div>
    <div className="duel-waiting-heading"><span className="eyebrow">자, 자리를 잡아 볼까요?</span><h1>{room.title}</h1><p>{room.players.length === 2 ? '둘 다 모였네요. 이제 시작해 볼까요?' : '한 자리 비워 뒀어요. 같이 할 친구를 불러 주세요.'}</p></div>
    <div className="duel-grid">
      <section className="duel-panel duel-feature"><div className="duel-feature-art"><Art /></div></section>
      <section className="duel-panel duel-seats">
        <div className="duel-panel-label"><h2>{theme.seatsTitle}</h2><span>{room.players.length} / 2</span></div>
        {[0, 1].map(i => {
          const p = room.players[i];
          return <div key={i} className={`duel-seat ${p ? 'filled' : ''}`}>
            <div className={`duel-avatar a${i}`}>{p ? p.name.slice(0, 1) : <Plus size={22} />}</div>
            <div><strong>{p ? p.name : '친구를 기다리는 중'}{p?.id === meId && <small>나</small>}</strong><span>{p ? `${p.isHost ? '방장 · ' : ''}${p.connected ? '준비됐어요' : '다시 연결하는 중'}` : '초대 링크를 보내 보세요'}</span></div>
            {p && <span className={`duel-ready ${p.connected ? '' : 'off'}`}>{p.connected ? <Check size={16} /> : <WifiOff size={16} />}</span>}
          </div>;
        })}
        <div className="duel-invite"><div><span>친구에게 이 코드를 알려 주세요</span><strong>{room.code}</strong></div><button className="duel-button secondary compact" onClick={copyInvite}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? '복사했어요' : '초대 링크'}</button></div>
        {OptionsPicker && <OptionsPicker value={room.options} disabled={!host || busy || !connected} onChange={options => void send('rooms:options', { options })} />}
        <button className="duel-button primary full" disabled={busy || !connected || room.players.length !== 2 || room.players.some(p => !p.connected) || !host} onClick={() => send('game:start')}>
          {!host ? '방장이 시작하기를 기다리는 중' : room.players.length < 2 ? '친구가 오면 시작할 수 있어요' : theme.startLabel}<ArrowRight size={18} />
        </button>
        {room.notice && <p className="duel-notice">{room.notice}</p>}
      </section>
    </div>
    {leaving && <LeaveDialog client={client as DuelClient} onClose={() => setLeaving(false)} />}
  </main>;
}

export default function DuelShell<View, Options>({ theme, onHome }: { theme: DuelTheme<View, Options>; onHome: () => void }) {
  const client = useDuel<View, Options>(theme.namespace, theme.tokenKey);
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
    document.title = theme.documentTitle;
    return () => { document.title = previous; };
  }, [theme.documentTitle]);
  const playing = Boolean(room?.game);
  const { Backdrop, Rules, Table } = theme;
  return <div className={`duel-app theme-${theme.key} ${playing ? 'in-game' : ''}`}>
    <Backdrop inGame={playing} />
    {!playing && <header className="duel-header duel-width">
      <div className="duel-brand"><span className="duel-brand-mark"><i /><i /><i /></span><span>{theme.name}<small>{theme.latin}</small></span></div>
      <nav>
        <button className="duel-text-button" onClick={onHome} aria-label="게임 선택"><LayoutGrid size={16} /><span>게임 선택</span></button>
        {me && <span className="duel-header-player"><span className="duel-dot" />{me.name}<small>님</small></span>}
        <button className="duel-text-button" onClick={() => setRules(true)} aria-label="게임 방법"><HelpCircle size={16} /><span>게임 방법</span></button>
        {me && !room && <button className="duel-icon-btn" onClick={client.logout} aria-label="이름 바꾸기" title="이름 바꾸기"><LogOut size={17} /></button>}
      </nav>
    </header>}
    {replaced ? <div className="duel-banner" role="status"><WifiOff size={14} /> 다른 탭에서 접속해서 이 탭은 잠시 쉬고 있어요.<button onClick={client.reconnect}>여기서 계속하기</button></div>
      : !connected && <div className="duel-banner" role="status"><WifiOff size={14} /> 서버에 연결하는 중이에요. 잠시만 기다려 주세요.</div>}
    {restoring ? <main className="duel-loading"><span className="duel-spinner" /><p>자리를 찾고 있어요.</p></main>
      : !me ? <Landing theme={theme} onEnter={name => void send('session:enter', { name })} busy={busy} connected={connected} onRules={() => setRules(true)} invite={invite.current} />
        : room?.game ? <Table room={room as TableProps<View, Options>['room']} meId={me.id} client={client} />
          : room ? <Waiting theme={theme} room={room} meId={me.id} client={client} />
            : <Lobby theme={theme} client={client} onRules={() => setRules(true)} />}
    {rules && <Rules onClose={() => setRules(false)} />}
    {error && <div className="duel-toast" role="status" aria-live="polite"><span>{error}</span><button aria-label="알림 닫기" onClick={() => setError('')}><X size={15} /></button></div>}
  </div>;
}
