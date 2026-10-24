import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Award, Coins, HelpCircle, History, Layers, Minus, Plus, ShoppingBasket, Store, Users, X } from 'lucide-react';
import Dialog from '../components/Dialog';
import CountUp from '../duel/CountUp';
import DuelShell, { LeaveDialog, LogDialog, ReadyButtons, type DuelTheme, type TableProps } from '../duel/DuelShell';
import {
  BONUS, CAMEL_BONUS, GOOD_INFO, GOODS, HAND_LIMIT, PRECIOUS, SEALS_TO_WIN, TOKENS,
  type CardKind, type Good, type JPCard, type JPView,
} from '../../shared/jaipur';
import { BazaarArt, GoodGlyph, PinkCityBackdrop } from './art';
import './jaipur.css';

type Options = Record<string, never>;
type Props = TableProps<JPView, Options>;
const ORDER: CardKind[] = [...GOODS, 'camel'];

function Card({ card, selected = false, small = false, fresh = false }: { card: { kind: CardKind }; selected?: boolean; small?: boolean; fresh?: boolean }) {
  return <span className={`jp-card jp-${card.kind} ${selected ? 'is-selected' : ''} ${small ? 'is-small' : ''} ${fresh ? 'is-fresh' : ''}`}>
    <GoodGlyph kind={card.kind} size="56%" />
    {!small && <span className="jp-card-name">{GOOD_INFO[card.kind].name}</span>}
  </span>;
}

/** `fresh`: 이번 라운드에 받은 인장이라 결과창에서 도장 찍히듯 내려온다. */
function Seals({ n, fresh = false }: { n: number; fresh?: boolean }) {
  return <span className="jp-seals" aria-label={`인장 ${n}개`}>{Array.from({ length: SEALS_TO_WIN }, (_, i) => <i key={i} className={`${i < n ? 'is-won' : ''} ${fresh && i === n - 1 ? 'is-new' : ''}`} />)}</span>;
}

function RulesDialog({ onClose }: { onClose: () => void }) {
  return <Dialog title="분홍 도시 상인의 규칙" onClose={onClose} wide>
    <div className="duel-rules">
      <p>시장에서 물건을 모아 비싸게 팔아요. 라운드마다 <b>더 많이 번 상인</b>이 인장을 받고, <b>인장 {SEALS_TO_WIN}개</b>를 먼저 모으면 이겨요.</p>
      <div className="duel-rules-steps">
        <div><span>01</span><h4>한 장 가져오기</h4><p>시장의 상품 1장을 손으로. 빈자리는 더미에서 채워요. 손은 {HAND_LIMIT}장까지.</p></div>
        <div><span>02</span><h4>낙타 모두</h4><p>시장의 낙타를 전부 내 무리로 데려와요. 낙타는 손패로 세지 않아요.</p></div>
        <div><span>03</span><h4>교환</h4><p>시장 상품 2장 이상을 가져오고 같은 수만큼 손패나 낙타를 내놓아요. 같은 종류를 주고받을 수는 없어요.</p></div>
        <div><span>04</span><h4>팔기</h4><p>한 종류를 원하는 만큼 팔고 그 상품 토큰을 위에서부터 받아요. 다이아몬드·금·은은 2장 이상.</p></div>
      </div>
      <h3>보너스</h3>
      <ul>
        <li>3장을 한 번에 팔면 1~3, 4장이면 4~6, 5장 이상이면 8~10루피짜리 보너스 토큰을 받아요. 금액은 라운드가 끝날 때까지 상대에게 비밀이에요.</li>
        <li>토큰이 떨어진 상품을 팔아도 보너스는 받아요.</li>
      </ul>
      <h3>라운드 끝</h3>
      <ul>
        <li>상품 토큰이 <b>세 종류</b> 바닥나거나, 시장을 채울 카드가 더미에 없으면 바로 끝나요.</li>
        <li>낙타가 더 많은 쪽이 {CAMEL_BONUS}루피를 더 받아요.</li>
        <li>합계가 같으면 보너스 토큰이 많은 쪽, 그다음 상품 토큰이 많은 쪽이 이겨요. 진 사람이 다음 라운드를 시작해요.</li>
      </ul>
      <div className="jp-rules-tokens">{GOODS.map(g => <span key={g} className={`jp-${g}`}><GoodGlyph kind={g} size={16} />{GOOD_INFO[g].name}<small>{TOKENS[g].join(' · ')}</small></span>)}</div>
      <p className="duel-rules-note">보너스 토큰: 3장 {BONUS[3].length}개 · 4장 {BONUS[4].length}개 · 5장 {BONUS[5].length}개. 낙타로 교환하면 시장에 낙타가 깔려 상대에게 좋은 기회가 될 수도 있어요.</p>
    </div>
  </Dialog>;
}

function Table({ room, meId, client }: Props) {
  const view = room.game;
  const { busy, send } = client;
  const names = Object.fromEntries(room.players.map(p => [p.id, p.name]));
  const oppId = view.opponentId;
  const [marketSel, setMarketSel] = useState<string[]>([]);
  const [handSel, setHandSel] = useState<string[]>([]);
  const [camels, setCamels] = useState(0);
  const [showLog, setShowLog] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [resultHidden, setResultHidden] = useState(false);
  const reset = () => { setMarketSel([]); setHandSel([]); setCamels(0); };
  useEffect(reset, [view.revision]);
  useEffect(() => { setResultHidden(false); }, [view.status, view.round]);

  const mine = view.status === 'playing' && view.currentPlayerId === meId;
  const hand = useMemo(() => [...view.hand].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || a.id.localeCompare(b.id)), [view.hand]);
  const marketCamels = view.market.filter(c => c.kind === 'camel');
  const takenCards = view.market.filter(c => marketSel.includes(c.id));
  const givenCards = hand.filter(c => handSel.includes(c.id));
  const myHerd = view.herdCount[meId]!;
  // 방금 '낙타 모두'를 한 사람의 무리 옆에 +N이 떠오르고 낙타가 한 번 뛰어든다.
  const herdGain = (id: string) => view.lastAction?.type === 'camels' && view.lastAction.playerId === id ? view.lastAction.cards.length : 0;
  const freshIds = new Set(view.lastAction?.playerId !== meId ? view.lastAction?.gave.map(c => c.id) ?? [] : []);

  function tapMarket(card: JPCard) {
    if (!mine) return;
    if (card.kind === 'camel') { setMarketSel(marketSel.some(id => marketCamels.some(c => c.id === id)) ? [] : marketCamels.map(c => c.id)); setHandSel([]); setCamels(0); return; }
    const withoutCamels = marketSel.filter(id => !marketCamels.some(c => c.id === id));
    const next = withoutCamels.includes(card.id) ? withoutCamels.filter(id => id !== card.id) : [...withoutCamels, card.id];
    setMarketSel(next);
    // The camel stepper only shows with 2+ market goods picked; drop its count once it is hidden.
    if (next.length < 2) setCamels(0);
  }
  function tapHand(card: JPCard) {
    if (!mine) return;
    if (marketSel.some(id => marketCamels.some(c => c.id === id))) setMarketSel([]);
    setHandSel(handSel.includes(card.id) ? handSel.filter(id => id !== card.id) : [...handSel, card.id]);
  }

  // Work out what the current selection means and whether it is legal.
  const plan = (() => {
    if (!mine) return null;
    const pickingCamels = takenCards.length > 0 && takenCards.every(c => c.kind === 'camel');
    if (pickingCamels) return { label: `낙타 ${marketCamels.length}마리 모두 데려오기`, action: { type: 'camels' }, error: '' };
    if (!takenCards.length && givenCards.length && !camels) {
      const kind = givenCards[0]!.kind as Good;
      if (givenCards.some(c => c.kind !== kind)) return { label: '팔기', action: null, error: '한 번에 한 종류만 팔 수 있어요.' };
      if (PRECIOUS.includes(kind) && givenCards.length < 2) return { label: '팔기', action: null, error: `${GOOD_INFO[kind].name}은(는) 2장 이상 팔아야 해요.` };
      const coins = view.tokens[kind].slice(0, givenCards.length).reduce((s, v) => s + v, 0);
      return { label: `${GOOD_INFO[kind].name} ${givenCards.length}장 팔기 · ${coins}루피${givenCards.length >= 3 ? ' + 보너스' : ''}`, action: { type: 'sell', cardIds: handSel }, error: '' };
    }
    if (takenCards.length === 1 && !givenCards.length && !camels) {
      if (hand.length >= HAND_LIMIT) return { label: '가져오기', action: null, error: `손이 가득 찼어요 (${HAND_LIMIT}장).` };
      return { label: `${GOOD_INFO[takenCards[0]!.kind].name} 가져오기`, action: { type: 'take', marketId: takenCards[0]!.id }, error: '' };
    }
    if (takenCards.length >= 1 && (givenCards.length || camels)) {
      const give = givenCards.length + camels;
      if (takenCards.length < 2) return { label: '교환', action: null, error: '교환은 시장 카드 2장 이상이에요.' };
      if (give !== takenCards.length) return { label: '교환', action: null, error: `내놓을 카드 ${give}/${takenCards.length}장` };
      const kinds = new Set(takenCards.map(c => c.kind));
      if (givenCards.some(c => kinds.has(c.kind))) return { label: '교환', action: null, error: '같은 종류를 주고받을 수 없어요.' };
      if (hand.length - givenCards.length + takenCards.length > HAND_LIMIT) return { label: '교환', action: null, error: `손은 ${HAND_LIMIT}장까지예요.` };
      return { label: `${takenCards.length}장 교환하기`, action: { type: 'exchange', marketIds: marketSel, handIds: handSel, camels }, error: '' };
    }
    if (takenCards.length >= 2) return { label: '교환', action: null, error: `시장 ${takenCards.length}장을 가져오려면 손패나 낙타 ${takenCards.length}장을 골라 내놓아요.` };
    return null;
  })();

  const hint = view.status !== 'playing' ? '라운드가 끝났어요.'
    : !mine ? `${names[oppId] ?? '상대'}님이 흥정하는 중이에요.`
      : plan?.error || (plan ? '' : '시장 카드를 눌러 가져오거나, 손패를 골라 팔아 보세요.');

  const myCoins = view.earnedGoods[meId]!.reduce((s, t) => s + t.value, 0) + view.myBonus.reduce((s, t) => s + t.value, 0);
  const oppCoins = view.earnedGoods[oppId]!.reduce((s, t) => s + t.value, 0);
  const player = (id: string) => {
    const own = id === meId;
    return <div className={`jp-player ${view.currentPlayerId === id && view.status === 'playing' ? 'is-turn' : ''}`}>
      <strong>{names[id] ?? '플레이어'}{own && <small>나</small>}</strong>
      <Seals n={view.seals[id]!} />
      <span className="jp-coins" title={own ? '내 루피 (보너스 포함)' : '상대 상품 토큰 합 (보너스는 비밀)'}><Coins size={12} />{own ? myCoins : oppCoins}{!own && view.opponentBonus.length > 0 && <em>+?×{view.opponentBonus.length}</em>}</span>
      <span className={`jp-herd-count ${herdGain(id) ? 'is-gaining' : ''}`} title="낙타 무리" key={herdGain(id) ? `gain-${view.revision}` : 'herd'}><GoodGlyph kind="camel" size={15} />{view.herdCount[id]}{herdGain(id) > 0 && <em className="jp-herd-gain" aria-hidden="true">+{herdGain(id)}</em>}</span>
    </div>;
  };

  // 판 물건의 토큰을 가판대처럼 늘어놓는다. 방금 판 토큰은 살짝 튀어 들어온다.
  const stall = (id: string) => {
    const own = id === meId;
    const goods = view.earnedGoods[id]!;
    const bonus: Array<{ size: 3 | 4 | 5; value: number | null }> = own ? view.myBonus : view.opponentBonus;
    const last = view.lastAction?.type === 'sell' && view.lastAction.playerId === id ? view.lastAction : null;
    let freshGoods = 0;
    if (last) {
      const kind = last.cards[0]!.kind;
      while (freshGoods < last.cards.length && goods[goods.length - 1 - freshGoods]?.good === kind) freshGoods += 1;
    }
    const freshBonus = last && last.cards.length >= 3 ? 1 : 0;
    const label = own ? '내 가판대' : `${names[id] ?? '상대'}님의 가판대`;
    return <section className={`jp-stall ${own ? 'is-mine' : 'is-opp'}`} aria-label={label}>
      <span className="jp-stall-label">{own ? '내 가판대' : '상대 가판대'}</span>
      {goods.length === 0 && bonus.length === 0
        ? <span className="jp-stall-empty">아직 판 물건이 없어요</span>
        : <StallCoins count={goods.length + bonus.length}>
          {goods.map((t, i) => <i key={`g${i}`} className={`jp-coin jp-${t.good} ${i >= goods.length - freshGoods ? 'is-fresh' : ''}`} title={`${GOOD_INFO[t.good].name} ${t.value}`}>{t.value}</i>)}
          {bonus.map((b, i) => <i key={`b${i}`} className={`jp-coin is-bonus ${i >= bonus.length - freshBonus ? 'is-fresh' : ''}`} title={`보너스(${b.size}장)${b.value === null ? '' : ` ${b.value}`}`}>{b.value ?? '?'}<small>{b.size}</small></i>)}
        </StallCoins>}
    </section>;
  };

  return <main className="jp-game">
    <header className="jp-topbar">
      <button className="duel-icon-btn" onClick={() => setLeaving(true)} aria-label="방 나가기"><ArrowLeft size={17} /></button>
      {player(oppId)}
      <button className="duel-icon-btn" onClick={() => setShowLog(true)} aria-label="지난 차례 기록"><History size={17} /></button>
      <button className="duel-icon-btn" onClick={() => setShowRules(true)} aria-label="게임 방법"><HelpCircle size={17} /></button>
    </header>
    <div className="jp-opp-hand" aria-label={`상대 손패 ${view.opponentHandCount}장`}>{Array.from({ length: view.opponentHandCount }, (_, i) => <span key={i} className="jp-back" />)}</div>

    <section className="jp-tokens" aria-label="상품 토큰">
      {GOODS.map(g => {
        const pile = view.tokens[g];
        return <div key={g} className={`jp-token-pile jp-${g} ${pile.length ? '' : 'is-empty'}`} title={`${GOOD_INFO[g].name} 토큰: ${pile.join(', ') || '없음'}`}>
          <GoodGlyph kind={g} size={16} />
          <b>{pile[0] ?? '–'}</b>
          <small>{pile.length}</small>
        </div>;
      })}
      <div className="jp-bonus-piles" title="남은 보너스 토큰">{([3, 4, 5] as const).map(n => <span key={n}><i>{n}</i>{view.bonusLeft[n]}</span>)}</div>
    </section>

    {stall(oppId)}
    <section className="jp-market" aria-label="시장">
      <div className="jp-deck" aria-label={`더미 ${view.deckCount}장`}><span className="jp-back" /><b>{view.deckCount}</b></div>
      {view.market.map(c => <button key={c.id} type="button" className="jp-slot" disabled={busy || !mine} aria-pressed={marketSel.includes(c.id)} onClick={() => tapMarket(c)} aria-label={`시장 ${GOOD_INFO[c.kind].name}`}>
        <Card card={c} selected={marketSel.includes(c.id)} fresh={freshIds.has(c.id)} />
      </button>)}
    </section>

    {stall(meId)}
    <section className={`jp-action ${mine ? 'is-mine' : ''}`}>
      <div className="jp-hint"><span className="duel-dot" /><strong>{view.status !== 'playing' ? '라운드 끝' : mine ? '내 차례' : '상대 차례'}</strong><span>{hint}</span></div>
      {mine && <div className="jp-buttons">
        {plan && <button className="duel-button primary compact" disabled={busy || !plan.action} onClick={() => plan.action && void send('game:action', plan.action)}>{plan.label}</button>}
        {!plan && marketCamels.length > 0 && <button className="duel-button secondary compact" disabled={busy} onClick={() => void send('game:action', { type: 'camels' })}><GoodGlyph kind="camel" size={16} />낙타 {marketCamels.length}마리 모두</button>}
        {(marketSel.length || handSel.length || camels) ? <button className="duel-icon-btn" onClick={reset} aria-label="선택 취소"><X size={15} /></button> : null}
      </div>}
    </section>

    <section className="jp-me">
      {player(meId)}
      <div className={`jp-herd ${herdGain(meId) ? 'is-gaining' : ''}`} key={herdGain(meId) ? `gain-${view.revision}` : 'herd'}>
        <GoodGlyph kind="camel" size={22} />
        <span>낙타 {myHerd}</span>
        {mine && marketSel.length >= 2 && myHerd > 0 && <span className="jp-herd-give" role="group" aria-label="교환에 낼 낙타">
          <button type="button" className="duel-icon-btn" disabled={camels <= 0} onClick={() => setCamels(camels - 1)} aria-label="낙타 하나 덜 내기"><Minus size={13} /></button>
          <b>{camels}</b>
          <button type="button" className="duel-icon-btn" disabled={camels >= myHerd} onClick={() => setCamels(camels + 1)} aria-label="낙타 하나 더 내기"><Plus size={13} /></button>
        </span>}
      </div>
    </section>
    <section className="jp-hand" role="group" aria-label={`내 손패 ${hand.length}/${HAND_LIMIT}`}>
      {hand.map(c => <button key={c.id} type="button" className="jp-hand-card" disabled={busy || !mine} aria-pressed={handSel.includes(c.id)} onClick={() => tapHand(c)} aria-label={`손패 ${GOOD_INFO[c.kind].name}`}>
        <Card card={c} selected={handSel.includes(c.id)} />
      </button>)}
      {!hand.length && <p className="jp-empty">손이 비었어요. 시장에서 가져와 보세요.</p>}
      <span className="jp-hand-count">{hand.length}/{HAND_LIMIT}</span>
    </section>

    {view.status !== 'playing' && !resultHidden && <ResultDialog room={room} meId={meId} client={client} onHide={() => setResultHidden(true)} />}
    {view.status !== 'playing' && resultHidden && <button className="duel-button primary jp-show-result" onClick={() => setResultHidden(false)}>결과 다시 보기</button>}
    {showLog && <LogDialog log={view.log} meId={meId} names={names} onClose={() => setShowLog(false)} />}
    {showRules && <RulesDialog onClose={() => setShowRules(false)} />}
    {leaving && <LeaveDialog client={client as never} inGame finished={view.status === 'finished'} onClose={() => setLeaving(false)} />}
  </main>;
}

function ResultDialog({ room, meId, client, onHide }: { room: Props['room']; meId: string; client: Props['client']; onHide: () => void }) {
  const view = room.game;
  const oppId = view.opponentId;
  const name = (id: string) => room.players.find(p => p.id === id)?.name ?? '플레이어';
  const r = view.results.at(-1)!;
  const me = view.playerIds.indexOf(meId);
  const o = 1 - me;
  const finished = view.status === 'finished';
  const title = finished ? (view.winnerId === meId ? '마하라자의 상인이 되었어요!' : '좋은 장사였어요') : `${r.round}라운드 결산`;
  const rows: Array<[string, number, number]> = [
    ['상품 토큰', r.goods[me]!, r.goods[o]!],
    ['보너스 토큰', r.bonus[me]!, r.bonus[o]!],
    [`낙타 (${r.camels[me]} : ${r.camels[o]})`, r.camelBonus[me]!, r.camelBonus[o]!],
  ];
  return <Dialog title={title} onClose={onHide} wide>
    <div className="jp-result">
      <h3>{r.sealTo ? `${name(r.sealTo)}님이 인장을 받았어요` : '완전히 같은 점수라 인장은 아무도 받지 못했어요'}</h3>
      <p className="jp-result-note">{r.endReason === 'tokens' ? '상품 토큰 세 종류가 바닥났어요.' : '시장을 채울 카드가 떨어졌어요.'}</p>
      <table className="jp-result-table">
        <thead><tr><th /><th>{name(meId)}<small>나</small></th><th>{name(oppId)}</th></tr></thead>
        <tbody>
          {rows.map(([label, a, b], i) => <tr key={label} className="duel-reveal" style={{ '--i': i } as React.CSSProperties}><th>{label}</th><td>{a}</td><td>{b}</td></tr>)}
          <tr className="total duel-reveal" style={{ '--i': rows.length } as React.CSSProperties}>
            <th>합계</th>
            <td className={r.sealTo === meId ? 'is-lead' : ''}><CountUp value={r.totals[me]!} delayMs={500} /></td>
            <td className={r.sealTo === oppId ? 'is-lead' : ''}><CountUp value={r.totals[o]!} delayMs={500} /></td>
          </tr>
          <tr><th>인장</th><td><Seals n={view.seals[meId]!} fresh={r.sealTo === meId} /></td><td><Seals n={view.seals[oppId]!} fresh={r.sealTo === oppId} /></td></tr>
        </tbody>
      </table>
      {!finished && <p className="jp-result-note">진 쪽이 다음 라운드를 먼저 시작해요.</p>}
      <ReadyButtons room={room as never} meId={meId} client={client as never} finished={finished} nextLabel={`${view.round + 1}라운드 시작`} />
    </div>
  </Dialog>;
}

const theme: DuelTheme<JPView, Options> = {
  key: 'jp',
  name: '자이푸르',
  latin: 'JAIPUR',
  documentTitle: '자이푸르 — 분홍 도시의 시장',
  namespace: '/jaipur',
  tokenKey: 'jaipur.session',
  minutes: '약 25분',
  landing: {
    eyebrow: '분홍 도시의 시장으로',
    title: <>사고, 바꾸고,<br />제때 <span className="serif-word">팔기</span></>,
    intro: <>다이아몬드부터 가죽까지, 낙타도 한 무리.<br />인장 두 개를 먼저 받는 상인이 이겨요.</>,
    cta: '시장 들어가기',
    caption: '여섯 가지 상품과 낙타, 다섯 칸짜리 시장',
  },
  lobbyLine: '빈 가게에 들어가거나, 새 가게를 열어 보세요.',
  createTitle: '새 가게를 열어요',
  defaultRoomTitle: name => `${name}의 가게`,
  seatsTitle: '오늘의 상인',
  startLabel: '장사 시작',
  facts: [
    { icon: <Users size={15} />, text: '2인 대전' },
    { icon: <Layers size={15} />, text: '카드 55장' },
    { icon: <ShoppingBasket size={15} />, text: '시장 5칸' },
    { icon: <Award size={15} />, text: '인장 2개' },
  ],
  roomIcon: <Store size={20} />,
  emptyIcon: <ShoppingBasket size={40} strokeWidth={1.4} />,
  defaultOptions: {},
  Art: BazaarArt,
  Backdrop: PinkCityBackdrop,
  Rules: RulesDialog,
  Table,
};

export default function Jaipur({ onHome }: { onHome: () => void }) {
  return <DuelShell theme={theme} onHome={onHome} />;
}

/** 가로 폰에선 가판대 토큰이 한 줄로 겹쳐 옆으로 넘친다. 새 토큰이 들어오면 오른쪽 끝(방금 판 것)이 보이게 민다. */
function StallCoins({ count, children }: { count: number; children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && el.scrollWidth > el.clientWidth) el.scrollLeft = el.scrollWidth;
  }, [count]);
  return <span ref={ref} className="jp-stall-coins">{children}</span>;
}
