/** Rules engine for Lost Cities (Reiner Knizia), two players. Pure functions; the server owns the state. */

export const SITES = ['pompeii', 'amazon', 'himalaya', 'atlantis', 'egypt'] as const;
export type Site = typeof SITES[number];

export const SITE_INFO: Record<Site, { name: string; color: string }> = {
  pompeii: { name: '폼페이', color: 'red' },
  amazon: { name: '아마존', color: 'green' },
  himalaya: { name: '히말라야', color: 'white' },
  atlantis: { name: '아틀란티스', color: 'blue' },
  egypt: { name: '이집트', color: 'yellow' },
};

export const HAND_SIZE = 8;
export const EXPEDITION_COST = 20;
export const LONG_EXPEDITION = 8;
export const LONG_BONUS = 20;

/** value 0 is a handshake (investment) card; 2 to 10 are numbers. */
export interface LCCard { id: string; site: Site; value: number }

export type LCPhase = 'play' | 'draw';
export type LCStatus = 'playing' | 'round-over' | 'finished';
export type DrawSource = 'deck' | Site;

export type LCAction =
  | { type: 'play'; cardId: string }
  | { type: 'discard'; cardId: string }
  | { type: 'draw'; from: DrawSource };

export interface LCLogEntry { id: number; playerId: string; text: string; round: number }

export interface LCState {
  playerIds: [string, string];
  rounds: number;
  round: number;
  status: LCStatus;
  phase: LCPhase;
  currentPlayerId: string;
  turn: number;
  deck: LCCard[];
  hands: Record<string, LCCard[]>;
  expeditions: Record<string, Record<Site, LCCard[]>>;
  discards: Record<Site, LCCard[]>;
  /** The pile this turn's discard went to. It cannot be drawn straight back. */
  lastDiscardSite: Site | null;
  /** Round totals of finished rounds, in playerIds order. */
  roundScores: Array<[number, number]>;
  log: LCLogEntry[];
  revision: number;
  /** Set once the last round ends; null on a tie. */
  winnerId: string | null;
}

export class LCRuleError extends Error {}
function fail(message: string): never {
  throw new LCRuleError(message);
}

export function buildDeck(): LCCard[] {
  const cards: LCCard[] = [];
  for (const site of SITES) {
    for (let n = 1; n <= 3; n++) cards.push({ id: `${site}-h${n}`, site, value: 0 });
    for (let v = 2; v <= 10; v++) cards.push({ id: `${site}-${v}`, site, value: v });
  }
  return cards;
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

const emptyExpeditions = (): Record<Site, LCCard[]> => ({ pompeii: [], amazon: [], himalaya: [], atlantis: [], egypt: [] });

function dealRound(state: Pick<LCState, 'playerIds'>, firstPlayerId: string, rng: () => number) {
  const deck = shuffle(buildDeck(), rng);
  const [a, b] = state.playerIds;
  const hands = { [a]: deck.splice(0, HAND_SIZE), [b]: deck.splice(0, HAND_SIZE) };
  return {
    deck, hands,
    expeditions: { [a]: emptyExpeditions(), [b]: emptyExpeditions() },
    discards: emptyExpeditions(),
    currentPlayerId: firstPlayerId,
    phase: 'play' as LCPhase,
    lastDiscardSite: null,
    turn: 1,
  };
}

export function createLostCities(playerIds: [string, string], rng: () => number, rounds = 3): LCState {
  const first = playerIds[Math.floor(rng() * 2)]!;
  return {
    playerIds, rounds, round: 1, status: 'playing', roundScores: [], log: [], revision: 0, winnerId: null,
    ...dealRound({ playerIds }, first, rng),
  };
}

/** A handshake needs a bare expedition (or only handshakes); a number must beat everything laid before it. */
export function canPlayOnExpedition(expedition: LCCard[], card: LCCard): boolean {
  const top = expedition.at(-1);
  if (!top) return true;
  if (card.value === 0) return top.value === 0;
  return card.value > top.value;
}

export function scoreExpedition(cards: LCCard[]): number {
  if (!cards.length) return 0;
  const handshakes = cards.filter(card => card.value === 0).length;
  const sum = cards.reduce((total, card) => total + card.value, 0);
  return (sum - EXPEDITION_COST) * (1 + handshakes) + (cards.length >= LONG_EXPEDITION ? LONG_BONUS : 0);
}

export function scoreSites(expeditions: Record<Site, LCCard[]>): Record<Site, number> {
  return Object.fromEntries(SITES.map(site => [site, scoreExpedition(expeditions[site])])) as Record<Site, number>;
}

export const scoreTotal = (expeditions: Record<Site, LCCard[]>) =>
  SITES.reduce((total, site) => total + scoreExpedition(expeditions[site]), 0);

export function legalDraws(state: LCState): DrawSource[] {
  if (state.status !== 'playing' || state.phase !== 'draw') return [];
  const sources: DrawSource[] = [];
  if (state.deck.length) sources.push('deck');
  for (const site of SITES) if (state.discards[site].length && site !== state.lastDiscardSite) sources.push(site);
  return sources;
}

const siteName = (site: Site) => SITE_INFO[site].name;
const cardLabel = (card: LCCard) => `${siteName(card.site)} ${card.value === 0 ? '악수 카드' : card.value}`;

function pushLog(state: LCState, playerId: string, text: string) {
  state.log.push({ id: (state.log.at(-1)?.id ?? 0) + 1, playerId, text, round: state.round });
}

/** Returns a new state; the input is left alone. Throws LCRuleError for anything illegal. */
export function applyLostCitiesAction(previous: LCState, playerId: string, action: LCAction): LCState {
  if (previous.status !== 'playing') fail('이미 끝난 라운드예요.');
  if (previous.currentPlayerId !== playerId) fail('아직 내 차례가 아니에요.');
  const state: LCState = structuredClone(previous);
  const hand = state.hands[playerId]!;
  const mine = state.expeditions[playerId]!;

  if (action.type === 'draw') {
    if (state.phase !== 'draw') fail('먼저 카드를 내거나 버려 주세요.');
    const options = legalDraws(state);
    if (!options.includes(action.from)) {
      fail(action.from !== 'deck' && action.from === state.lastDiscardSite
        ? '방금 버린 카드는 바로 도로 가져올 수 없어요.'
        : '그곳에서는 뽑을 수 없어요.');
    }
    const card = action.from === 'deck' ? state.deck.pop()! : state.discards[action.from].pop()!;
    hand.push(card);
    pushLog(state, playerId, action.from === 'deck' ? '카드 더미에서 한 장 뽑았어요.' : `${siteName(action.from)} 버린 더미에서 ${cardLabel(card)} 카드를 가져왔어요.`);
    state.phase = 'play';
    state.lastDiscardSite = null;
    state.currentPlayerId = state.playerIds.find(id => id !== playerId)!;
    state.turn += 1;
    // The round ends the instant the last card leaves the draw pile.
    if (action.from === 'deck' && state.deck.length === 0) endRound(state);
    state.revision += 1;
    return state;
  }

  if (state.phase !== 'play') fail('이제 카드를 한 장 뽑아야 해요.');
  const index = hand.findIndex(card => card.id === action.cardId);
  if (index < 0) fail('손에 없는 카드예요.');
  const card = hand[index]!;
  if (action.type === 'play') {
    if (!canPlayOnExpedition(mine[card.site], card)) fail('이 탐험에는 더 큰 숫자만 이어서 놓을 수 있어요.');
    hand.splice(index, 1);
    mine[card.site].push(card);
    pushLog(state, playerId, `${cardLabel(card)} 카드를 탐험에 놓았어요.`);
  } else {
    hand.splice(index, 1);
    state.discards[card.site].push(card);
    state.lastDiscardSite = card.site;
    pushLog(state, playerId, `${cardLabel(card)} 카드를 버렸어요.`);
  }
  state.phase = 'draw';
  state.revision += 1;
  return state;
}

function endRound(state: LCState) {
  const [a, b] = state.playerIds;
  state.roundScores.push([scoreTotal(state.expeditions[a]!), scoreTotal(state.expeditions[b]!)]);
  if (state.round >= state.rounds) {
    state.status = 'finished';
    const totals = matchTotals(state);
    state.winnerId = totals[0] === totals[1] ? null : totals[0] > totals[1] ? a : b;
  } else {
    state.status = 'round-over';
  }
}

export function matchTotals(state: Pick<LCState, 'roundScores'>): [number, number] {
  return state.roundScores.reduce<[number, number]>((sum, [x, y]) => [sum[0] + x, sum[1] + y], [0, 0]);
}

/** After a round, the player who scored less goes first; on a tie the turn order flips. */
export function startNextRound(previous: LCState, rng: () => number): LCState {
  if (previous.status !== 'round-over') fail('다음 라운드를 시작할 수 없어요.');
  const [x, y] = previous.roundScores.at(-1)!;
  const first = x === y ? previous.playerIds.find(id => id !== previous.currentPlayerId)! : x < y ? previous.playerIds[0] : previous.playerIds[1];
  return {
    ...previous,
    round: previous.round + 1,
    status: 'playing',
    revision: previous.revision + 1,
    log: [...previous.log],
    ...dealRound(previous, first, rng),
  };
}

export interface LCView {
  meId: string;
  opponentId: string;
  rounds: number;
  round: number;
  status: LCStatus;
  phase: LCPhase;
  currentPlayerId: string;
  turn: number;
  deckCount: number;
  hand: LCCard[];
  /** Per hand card: whether it can be laid on my own expedition right now. */
  playable: Record<string, boolean>;
  opponentHandCount: number;
  expeditions: Record<string, Record<Site, LCCard[]>>;
  discards: Record<Site, LCCard[]>;
  lastDiscardSite: Site | null;
  drawable: DrawSource[];
  siteScores: Record<string, Record<Site, number>>;
  totals: Record<string, number>;
  roundScores: Array<[number, number]>;
  playerIds: [string, string];
  matchTotals: [number, number];
  log: LCLogEntry[];
  revision: number;
  winnerId: string | null;
}

export function getLostCitiesView(state: LCState, viewerId: string): LCView {
  const opponentId = state.playerIds.find(id => id !== viewerId)!;
  const hand = state.hands[viewerId] ?? [];
  const mine = state.expeditions[viewerId]!;
  const [a, b] = state.playerIds;
  return {
    meId: viewerId, opponentId,
    rounds: state.rounds, round: state.round, status: state.status, phase: state.phase,
    currentPlayerId: state.currentPlayerId, turn: state.turn,
    deckCount: state.deck.length,
    hand,
    playable: Object.fromEntries(hand.map(card => [card.id, canPlayOnExpedition(mine[card.site], card)])),
    opponentHandCount: state.hands[opponentId]?.length ?? 0,
    expeditions: state.expeditions,
    discards: state.discards,
    lastDiscardSite: state.lastDiscardSite,
    drawable: state.currentPlayerId === viewerId ? legalDraws(state) : [],
    siteScores: { [a]: scoreSites(state.expeditions[a]!), [b]: scoreSites(state.expeditions[b]!) },
    totals: { [a]: scoreTotal(state.expeditions[a]!), [b]: scoreTotal(state.expeditions[b]!) },
    roundScores: state.roundScores,
    playerIds: state.playerIds,
    matchTotals: matchTotals(state),
    log: state.log.slice(-40),
    revision: state.revision,
    winnerId: state.winnerId,
  };
}
