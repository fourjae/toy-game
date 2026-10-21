/**
 * Rules engine for Jaipur (Sébastien Pauchon), two players. Pure functions.
 *
 * 55 cards: diamonds 6, gold 6, silver 6, cloth 8, spice 8, leather 10, camels 11.
 * A round starts with 3 camels plus 2 cards in the 5-card market and 5 cards each; camels in hand go
 * straight to the herd. A turn is one of:
 *   take one good from the market (hand limit 7) · take every camel · exchange 2+ market goods for
 *   the same number of hand cards and/or camels (never the same good both ways) · sell any number of
 *   one good (diamonds, gold, silver: at least 2) for its tokens, plus a bonus token for 3, 4 or 5+.
 * The round ends when three goods' tokens are gone or the market cannot be refilled. The bigger herd
 * earns 5, the richer trader takes a seal (ties: more bonus tokens, then more goods tokens), and two
 * seals win. The loser of a round starts the next.
 */
import { fail, otherPlayer, pushLog, shuffle, type LogEntry } from './duel.js';

export const GOODS = ['diamond', 'gold', 'silver', 'cloth', 'spice', 'leather'] as const;
export type Good = typeof GOODS[number];
export type CardKind = Good | 'camel';

export const GOOD_INFO: Record<CardKind, { name: string; count: number }> = {
  diamond: { name: '다이아몬드', count: 6 },
  gold: { name: '금', count: 6 },
  silver: { name: '은', count: 6 },
  cloth: { name: '비단', count: 8 },
  spice: { name: '향신료', count: 8 },
  leather: { name: '가죽', count: 10 },
  camel: { name: '낙타', count: 11 },
};
/** Tokens per good, highest (taken first) first. */
export const TOKENS: Record<Good, readonly number[]> = {
  diamond: [7, 7, 5, 5, 5],
  gold: [6, 6, 5, 5, 5],
  silver: [5, 5, 5, 5, 5],
  cloth: [5, 3, 3, 2, 2, 1, 1],
  spice: [5, 3, 3, 2, 2, 1, 1],
  leather: [4, 3, 2, 1, 1, 1, 1, 1, 1],
};
export const BONUS: Record<3 | 4 | 5, readonly number[]> = {
  3: [3, 3, 2, 2, 2, 1, 1],
  4: [6, 6, 5, 5, 4, 4],
  5: [10, 10, 9, 8, 8],
};
export const PRECIOUS: readonly Good[] = ['diamond', 'gold', 'silver'];
export const HAND_LIMIT = 7;
export const MARKET_SIZE = 5;
export const CAMEL_BONUS = 5;
export const SEALS_TO_WIN = 2;

export interface JPCard { id: string; kind: CardKind }
export interface JPBonus { size: 3 | 4 | 5; value: number }

export type JPAction =
  | { type: 'take'; marketId: string }
  | { type: 'camels' }
  | { type: 'exchange'; marketIds: string[]; handIds: string[]; camels: number }
  | { type: 'sell'; cardIds: string[] };

export type JPStatus = 'playing' | 'round-over' | 'finished';

export interface JPRoundResult {
  round: number;
  goods: [number, number];
  bonus: [number, number];
  bonusCount: [number, number];
  goodsCount: [number, number];
  camels: [number, number];
  camelBonus: [number, number];
  totals: [number, number];
  sealTo: string | null;
  endReason: 'tokens' | 'deck';
}

export interface JPState {
  playerIds: [string, string];
  round: number;
  status: JPStatus;
  startPlayerId: string;
  currentPlayerId: string;
  deck: JPCard[];
  market: JPCard[];
  hands: Record<string, JPCard[]>;
  herds: Record<string, JPCard[]>;
  tokens: Record<Good, number[]>;
  bonus: Record<3 | 4 | 5, number[]>;
  earned: Record<string, { goods: Array<{ good: Good; value: number }>; bonus: JPBonus[] }>;
  seals: Record<string, number>;
  results: JPRoundResult[];
  lastAction: { playerId: string; type: JPAction['type']; cards: JPCard[]; gave: JPCard[] } | null;
  log: LogEntry[];
  revision: number;
  winnerId: string | null;
}

export function buildDeck(): JPCard[] {
  const cards: JPCard[] = [];
  for (const kind of [...GOODS, 'camel'] as CardKind[]) for (let i = 1; i <= GOOD_INFO[kind].count; i++) cards.push({ id: `${kind}-${i}`, kind });
  return cards;
}

function dealRound(playerIds: [string, string], startPlayerId: string, rng: () => number) {
  const all = buildDeck();
  const camels = all.filter(c => c.kind === 'camel');
  const market = camels.splice(0, 3);
  const deck = shuffle([...all.filter(c => c.kind !== 'camel'), ...camels], rng);
  market.push(...deck.splice(0, 2));
  const hands: Record<string, JPCard[]> = {};
  const herds: Record<string, JPCard[]> = {};
  for (const id of playerIds) {
    const dealt = deck.splice(0, 5);
    hands[id] = dealt.filter(c => c.kind !== 'camel');
    herds[id] = dealt.filter(c => c.kind === 'camel');
  }
  return {
    deck, market, hands, herds,
    tokens: Object.fromEntries(GOODS.map(g => [g, [...TOKENS[g]]])) as Record<Good, number[]>,
    bonus: { 3: shuffle(BONUS[3], rng), 4: shuffle(BONUS[4], rng), 5: shuffle(BONUS[5], rng) },
    earned: Object.fromEntries(playerIds.map(id => [id, { goods: [], bonus: [] }])) as JPState['earned'],
    startPlayerId, currentPlayerId: startPlayerId, lastAction: null,
  };
}

export function createJaipur(playerIds: [string, string], rng: () => number): JPState {
  return {
    playerIds, round: 1, status: 'playing', results: [], log: [], revision: 0, winnerId: null,
    seals: { [playerIds[0]]: 0, [playerIds[1]]: 0 },
    ...dealRound(playerIds, playerIds[Math.floor(rng() * 2)]!, rng),
  };
}

const goodName = (kind: CardKind) => GOOD_INFO[kind].name;

function pickIds<T extends { id: string }>(pool: T[], ids: string[], where: string): T[] {
  if (new Set(ids).size !== ids.length) fail('같은 카드를 두 번 고를 수 없어요.');
  return ids.map(id => pool.find(card => card.id === id) ?? fail(`${where}에 없는 카드예요.`));
}

/** Fills empty market slots; returns false when the deck ran dry before the market was full. */
function refill(state: JPState): boolean {
  while (state.market.length < MARKET_SIZE) {
    const card = state.deck.pop();
    if (!card) return false;
    state.market.push(card);
  }
  return true;
}

export const sumGoods = (earned: JPState['earned'][string]) => earned.goods.reduce((s, t) => s + t.value, 0);
export const sumBonus = (earned: JPState['earned'][string]) => earned.bonus.reduce((s, t) => s + t.value, 0);

function scoreRound(state: JPState, endReason: JPRoundResult['endReason']) {
  const [a, b] = state.playerIds;
  const pair = <T>(f: (id: string) => T): [T, T] => [f(a), f(b)];
  const camels = pair(id => state.herds[id]!.length);
  const camelBonus: [number, number] = camels[0] > camels[1] ? [CAMEL_BONUS, 0] : camels[1] > camels[0] ? [0, CAMEL_BONUS] : [0, 0];
  const goods = pair(id => sumGoods(state.earned[id]!));
  const bonus = pair(id => sumBonus(state.earned[id]!));
  const bonusCount = pair(id => state.earned[id]!.bonus.length);
  const goodsCount = pair(id => state.earned[id]!.goods.length);
  const totals: [number, number] = [goods[0] + bonus[0] + camelBonus[0], goods[1] + bonus[1] + camelBonus[1]];
  const compare = (x: [number, number]) => (x[0] === x[1] ? 0 : x[0] > x[1] ? 1 : -1);
  const verdict = compare(totals) || compare(bonusCount) || compare(goodsCount);
  const sealTo = verdict > 0 ? a : verdict < 0 ? b : null;
  if (sealTo) state.seals[sealTo] = (state.seals[sealTo] ?? 0) + 1;
  state.results.push({ round: state.round, goods, bonus, bonusCount, goodsCount, camels, camelBonus, totals, sealTo, endReason });
  const champion = state.playerIds.find(id => state.seals[id]! >= SEALS_TO_WIN);
  if (champion) { state.status = 'finished'; state.winnerId = champion; } else state.status = 'round-over';
}

/** Returns a new state; the input is left alone. Throws RuleError for anything illegal. */
export function applyJaipurAction(previous: JPState, playerId: string, action: JPAction): JPState {
  if (previous.status !== 'playing') fail('이미 끝난 라운드예요.');
  if (previous.currentPlayerId !== playerId) fail('아직 내 차례가 아니에요.');
  const state: JPState = structuredClone(previous);
  const hand = state.hands[playerId]!;
  const herd = state.herds[playerId]!;
  let marketOk = true;

  if (action.type === 'take') {
    const [card] = pickIds(state.market, [action.marketId], '시장');
    if (card!.kind === 'camel') fail('낙타는 한 마리만 데려올 수 없어요. "낙타 모두"를 골라 주세요.');
    if (hand.length >= HAND_LIMIT) fail(`손에는 ${HAND_LIMIT}장까지만 들 수 있어요.`);
    state.market.splice(state.market.indexOf(card!), 1);
    hand.push(card!);
    marketOk = refill(state);
    state.lastAction = { playerId, type: 'take', cards: [card!], gave: [] };
    pushLog(state, playerId, `시장에서 ${goodName(card!.kind)}을(를) 가져왔어요.`);
  } else if (action.type === 'camels') {
    const camels = state.market.filter(c => c.kind === 'camel');
    if (!camels.length) fail('시장에 낙타가 없어요.');
    state.market = state.market.filter(c => c.kind !== 'camel');
    herd.push(...camels);
    marketOk = refill(state);
    state.lastAction = { playerId, type: 'camels', cards: camels, gave: [] };
    pushLog(state, playerId, `낙타 ${camels.length}마리를 몰고 왔어요.`);
  } else if (action.type === 'exchange') {
    const taken = pickIds(state.market, action.marketIds, '시장');
    const given = pickIds(hand, action.handIds, '손');
    const camels = action.camels;
    if (!Number.isInteger(camels) || camels < 0 || camels > herd.length) fail('내 낙타 수를 확인해 주세요.');
    if (taken.length < 2) fail('교환은 시장 카드 2장 이상이어야 해요. 한 장은 그냥 가져오세요.');
    if (taken.some(c => c.kind === 'camel')) fail('교환으로 낙타를 가져올 수는 없어요.');
    if (given.length + camels !== taken.length) fail('가져오는 장수만큼 손패나 낙타를 내놓아야 해요.');
    const takenKinds = new Set(taken.map(c => c.kind));
    if (given.some(c => takenKinds.has(c.kind))) fail('같은 종류를 가져오면서 내놓을 수는 없어요.');
    if (hand.length - given.length + taken.length > HAND_LIMIT) fail(`손에는 ${HAND_LIMIT}장까지만 들 수 있어요.`);
    const camelCards = herd.splice(herd.length - camels, camels);
    for (const card of given) hand.splice(hand.indexOf(card), 1);
    // The returned cards take the freed market places in order.
    const queue = [...given, ...camelCards];
    for (const [i, card] of taken.entries()) state.market[state.market.indexOf(card)] = queue[i]!;
    hand.push(...taken);
    state.lastAction = { playerId, type: 'exchange', cards: taken, gave: [...given, ...camelCards] };
    pushLog(state, playerId, `${taken.map(c => goodName(c.kind)).join(', ')}을(를) 손패${camels ? `·낙타 ${camels}마리` : ''}와 바꿨어요.`);
  } else if (action.type === 'sell') {
    const cards = pickIds(hand, action.cardIds, '손');
    if (!cards.length) fail('팔 카드를 골라 주세요.');
    const kind = cards[0]!.kind as Good;
    if (cards.some(c => c.kind !== kind)) fail('한 번에 한 종류만 팔 수 있어요.');
    if (PRECIOUS.includes(kind) && cards.length < 2) fail(`${goodName(kind)}은(는) 2장 이상 함께 팔아야 해요.`);
    for (const card of cards) hand.splice(hand.indexOf(card), 1);
    const earned = state.earned[playerId]!;
    const pile = state.tokens[kind];
    const got = pile.splice(0, cards.length);
    earned.goods.push(...got.map(value => ({ good: kind, value })));
    let bonusText = '';
    if (cards.length >= 3) {
      const size = Math.min(cards.length, 5) as 3 | 4 | 5;
      const value = state.bonus[size].pop();
      if (value !== undefined) { earned.bonus.push({ size, value }); bonusText = ` 보너스 토큰(${size}장)도 받았어요.`; }
    }
    state.lastAction = { playerId, type: 'sell', cards, gave: [] };
    pushLog(state, playerId, `${goodName(kind)} ${cards.length}장을 팔아 ${got.reduce((s, v) => s + v, 0)}루피를 벌었어요.${bonusText}`);
  } else {
    fail('알 수 없는 행동이에요.');
  }

  const emptyPiles = GOODS.filter(g => state.tokens[g].length === 0).length;
  state.revision += 1;
  if (!marketOk) { scoreRound(state, 'deck'); return state; }
  if (emptyPiles >= 3) { scoreRound(state, 'tokens'); return state; }
  state.currentPlayerId = otherPlayer(state.playerIds, playerId);
  return state;
}

/** The loser of the round starts the next one; after a dead heat the other player starts. */
export function startNextJaipurRound(previous: JPState, rng: () => number): JPState {
  if (previous.status !== 'round-over') fail('다음 라운드를 시작할 수 없어요.');
  const last = previous.results.at(-1)!;
  const start = last.sealTo ? otherPlayer(previous.playerIds, last.sealTo) : otherPlayer(previous.playerIds, previous.startPlayerId);
  return {
    ...structuredClone(previous),
    round: previous.round + 1,
    status: 'playing',
    revision: previous.revision + 1,
    ...dealRound(previous.playerIds, start, rng),
  };
}

export interface JPView {
  meId: string;
  opponentId: string;
  playerIds: [string, string];
  round: number;
  status: JPStatus;
  currentPlayerId: string;
  deckCount: number;
  market: JPCard[];
  hand: JPCard[];
  opponentHandCount: number;
  herdCount: Record<string, number>;
  tokens: Record<Good, number[]>;
  bonusLeft: Record<3 | 4 | 5, number>;
  /** Goods tokens are public; bonus values only for my own, the opponent's show as sizes until the round is scored. */
  earnedGoods: Record<string, Array<{ good: Good; value: number }>>;
  myBonus: JPBonus[];
  opponentBonus: Array<{ size: 3 | 4 | 5; value: number | null }>;
  seals: Record<string, number>;
  results: JPRoundResult[];
  lastAction: JPState['lastAction'];
  log: LogEntry[];
  revision: number;
  winnerId: string | null;
}

export function getJaipurView(state: JPState, viewerId: string): JPView {
  const opponentId = otherPlayer(state.playerIds, viewerId);
  const reveal = state.status !== 'playing';
  return {
    meId: viewerId, opponentId, playerIds: state.playerIds, round: state.round, status: state.status,
    currentPlayerId: state.currentPlayerId, deckCount: state.deck.length, market: state.market,
    hand: state.hands[viewerId] ?? [], opponentHandCount: state.hands[opponentId]?.length ?? 0,
    herdCount: Object.fromEntries(state.playerIds.map(id => [id, state.herds[id]!.length])),
    tokens: state.tokens,
    bonusLeft: { 3: state.bonus[3].length, 4: state.bonus[4].length, 5: state.bonus[5].length },
    earnedGoods: Object.fromEntries(state.playerIds.map(id => [id, state.earned[id]!.goods])),
    myBonus: state.earned[viewerId]?.bonus ?? [],
    opponentBonus: (state.earned[opponentId]?.bonus ?? []).map(b => ({ size: b.size, value: reveal ? b.value : null })),
    seals: state.seals, results: state.results, lastAction: state.lastAction,
    log: state.log.slice(-40), revision: state.revision, winnerId: state.winnerId,
  };
}
