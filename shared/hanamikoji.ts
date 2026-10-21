/**
 * Rules engine for Hanamikoji (Kota Nakayama), two players. Pure functions; the server owns the state.
 *
 * Seven geishas worth 2,2,2,3,3,4,5 charm, each with as many item cards as her charm (21 cards).
 * A round: one card is set aside unseen, each player gets 6, and the 8 left are the draw pile.
 * Players alternate; every turn starts by drawing one card, then uses one of the four action tokens
 * nobody may use twice in a round:
 *   비밀(secret) 1 card face down, scored at round end · 포기(trade-off) 2 cards face down, out of the round
 *   선물(gift) 3 cards face up, the opponent takes 1 · 경쟁(competition) 2 pairs face up, the opponent takes a pair.
 * After 8 actions the secrets are revealed; whoever has more items for a geisha wins her favor
 * (a tie leaves the marker where it was). 11+ charm wins first, otherwise 4+ geishas; else play another round.
 */
import { fail, otherPlayer, pushLog, shuffle, type LogEntry } from './duel.js';

export interface Geisha { name: string; item: string; charm: number; color: string }

export const GEISHAS: readonly Geisha[] = [
  { name: '하루', item: '부채', charm: 2, color: 'plum' },
  { name: '나츠', item: '피리', charm: 2, color: 'teal' },
  { name: '아키', item: '찻잔', charm: 2, color: 'rose' },
  { name: '유키', item: '우산', charm: 3, color: 'indigo' },
  { name: '스즈', item: '방울', charm: 3, color: 'amber' },
  { name: '츠키', item: '두루마리', charm: 4, color: 'jade' },
  { name: '사쿠라', item: '비파', charm: 5, color: 'crimson' },
];
export const GEISHA_COUNT = GEISHAS.length;
export const WIN_CHARM = 11;
export const WIN_GEISHAS = 4;
export const START_HAND = 6;

export const ACTIONS = ['secret', 'tradeoff', 'gift', 'competition'] as const;
export type HMActionKind = typeof ACTIONS[number];
export const ACTION_INFO: Record<HMActionKind, { name: string; cards: number; short: string }> = {
  secret: { name: '비밀', cards: 1, short: '1장을 몰래 맡겨 두고 라운드 끝에 내 편으로 공개해요.' },
  tradeoff: { name: '포기', cards: 2, short: '2장을 뒤집어 버려요. 이번 라운드에서는 아무도 갖지 못해요.' },
  gift: { name: '선물', cards: 3, short: '3장을 보여 주면 상대가 1장을 갖고, 나머지 2장은 내 편이에요.' },
  competition: { name: '경쟁', cards: 4, short: '2장씩 두 묶음을 보여 주면 상대가 한 묶음을 고르고, 남은 묶음은 내 편이에요.' },
};

export interface HMCard { id: string; geisha: number }

export type HMAction =
  | { type: 'secret' | 'tradeoff' | 'gift'; cardIds: string[] }
  | { type: 'competition'; groups: [string[], string[]] }
  | { type: 'choose'; index: number };

export type HMPending =
  | { kind: 'gift'; by: string; cards: HMCard[] }
  | { kind: 'competition'; by: string; groups: [HMCard[], HMCard[]] };

export type HMStatus = 'playing' | 'round-over' | 'finished';

export interface HMRoundResult {
  round: number;
  /** Item counts per geisha after the secrets were revealed, in playerIds order. */
  counts: Array<[number, number]>;
  /** Marker holder per geisha before and after this round. */
  before: Array<string | null>;
  after: Array<string | null>;
  charm: [number, number];
  geishas: [number, number];
}

export interface HMState {
  playerIds: [string, string];
  round: number;
  status: HMStatus;
  startPlayerId: string;
  currentPlayerId: string;
  deck: HMCard[];
  removed: HMCard | null;
  hands: Record<string, HMCard[]>;
  used: Record<string, Record<HMActionKind, boolean>>;
  secret: Record<string, HMCard | null>;
  discarded: Record<string, HMCard[]>;
  /** Cards won per geisha on each side, indexed by geisha. */
  placed: Record<string, HMCard[][]>;
  favor: Array<string | null>;
  pending: HMPending | null;
  /** The card the current player drew at the start of this turn, so the screen can point at it. */
  drawnId: string | null;
  results: HMRoundResult[];
  log: LogEntry[];
  revision: number;
  winnerId: string | null;
  winReason: 'charm' | 'geishas' | null;
}

export function buildDeck(): HMCard[] {
  const cards: HMCard[] = [];
  GEISHAS.forEach((g, geisha) => { for (let k = 1; k <= g.charm; k++) cards.push({ id: `g${geisha}-${k}`, geisha }); });
  return cards;
}

const freshTokens = (): Record<HMActionKind, boolean> => ({ secret: false, tradeoff: false, gift: false, competition: false });
const emptySides = () => Array.from({ length: GEISHA_COUNT }, () => [] as HMCard[]);

function dealRound(playerIds: [string, string], startPlayerId: string, rng: () => number) {
  const deck = shuffle(buildDeck(), rng);
  const removed = deck.pop()!;
  const [a, b] = playerIds;
  const hands = { [a]: deck.splice(0, START_HAND), [b]: deck.splice(0, START_HAND) };
  // The starting player draws straight away: every turn begins with a draw.
  const first = deck.pop()!;
  hands[startPlayerId]!.push(first);
  return {
    deck, removed, hands,
    used: { [a]: freshTokens(), [b]: freshTokens() },
    secret: { [a]: null, [b]: null },
    discarded: { [a]: [], [b]: [] },
    placed: { [a]: emptySides(), [b]: emptySides() },
    pending: null,
    startPlayerId, currentPlayerId: startPlayerId, drawnId: first.id,
  };
}

export function createHanamikoji(playerIds: [string, string], rng: () => number): HMState {
  const start = playerIds[Math.floor(rng() * 2)]!;
  return {
    playerIds, round: 1, status: 'playing', results: [], log: [], revision: 0,
    favor: Array.from({ length: GEISHA_COUNT }, () => null), winnerId: null, winReason: null,
    ...dealRound(playerIds, start, rng),
  };
}

export function standing(favor: Array<string | null>, playerIds: [string, string]) {
  const charm: [number, number] = [0, 0];
  const geishas: [number, number] = [0, 0];
  favor.forEach((holder, i) => {
    const side = playerIds.indexOf(holder ?? '');
    if (side < 0) return;
    charm[side] += GEISHAS[i]!.charm;
    geishas[side] += 1;
  });
  return { charm, geishas };
}

const geishaLabel = (card: HMCard) => `${GEISHAS[card.geisha]!.name}의 ${GEISHAS[card.geisha]!.item}`;
const listLabel = (cards: HMCard[]) => cards.map(geishaLabel).join(', ');

function takeFromHand(hand: HMCard[], ids: string[], count: number): HMCard[] {
  if (ids.length !== count) fail(`카드를 ${count}장 골라 주세요.`);
  if (new Set(ids).size !== ids.length) fail('같은 카드를 두 번 고를 수 없어요.');
  const picked = ids.map(id => {
    const index = hand.findIndex(card => card.id === id);
    if (index < 0) fail('손에 없는 카드예요.');
    return hand[index]!;
  });
  for (const card of picked) hand.splice(hand.indexOf(card), 1);
  return picked;
}

function place(state: HMState, playerId: string, cards: HMCard[]) {
  for (const card of cards) state.placed[playerId]![card.geisha]!.push(card);
}

/** Hands the turn to the other player (who draws), or scores the round when all eight actions are spent. */
function passTurn(state: HMState, from: string) {
  const next = otherPlayer(state.playerIds, from);
  const allUsed = state.playerIds.every(id => ACTIONS.every(kind => state.used[id]![kind]));
  if (allUsed) { scoreRound(state); return; }
  state.currentPlayerId = next;
  const card = state.deck.pop();
  if (card) { state.hands[next]!.push(card); state.drawnId = card.id; } else state.drawnId = null;
}

function scoreRound(state: HMState) {
  const [a, b] = state.playerIds;
  for (const id of state.playerIds) {
    const card = state.secret[id];
    if (card) place(state, id, [card]);
  }
  const before = [...state.favor];
  const counts = state.favor.map((_, i) => [state.placed[a]![i]!.length, state.placed[b]![i]!.length] as [number, number]);
  counts.forEach(([x, y], i) => { if (x > y) state.favor[i] = a; else if (y > x) state.favor[i] = b; });
  const { charm, geishas } = standing(state.favor, state.playerIds);
  state.results.push({ round: state.round, counts, before, after: [...state.favor], charm, geishas });
  state.drawnId = null;
  state.pending = null;
  // Charm beats geisha count when one player has 11+ charm and the other 4 geishas.
  const charmWinner = charm[0] >= WIN_CHARM ? a : charm[1] >= WIN_CHARM ? b : null;
  const geishaWinner = geishas[0] >= WIN_GEISHAS ? a : geishas[1] >= WIN_GEISHAS ? b : null;
  if (charmWinner || geishaWinner) {
    state.status = 'finished';
    state.winnerId = charmWinner ?? geishaWinner;
    state.winReason = charmWinner ? 'charm' : 'geishas';
  } else {
    state.status = 'round-over';
  }
}

/** Returns a new state; the input is left alone. Throws RuleError for anything illegal. */
export function applyHanamikojiAction(previous: HMState, playerId: string, action: HMAction): HMState {
  if (previous.status !== 'playing') fail('이미 끝난 라운드예요.');
  if (!previous.playerIds.includes(playerId)) fail('이 판의 플레이어가 아니에요.');
  const state: HMState = structuredClone(previous);
  const pending = state.pending;

  if (action.type === 'choose') {
    if (!pending) fail('지금은 고를 것이 없어요.');
    if (pending.by === playerId) fail('상대가 고를 차례예요.');
    const chooser = playerId;
    const giver = pending.by;
    if (pending.kind === 'gift') {
      if (!Number.isInteger(action.index) || action.index < 0 || action.index > 2) fail('세 장 가운데 하나를 골라 주세요.');
      const taken = pending.cards[action.index]!;
      place(state, chooser, [taken]);
      const rest = pending.cards.filter(card => card !== taken);
      place(state, giver, rest);
      pushLog(state, chooser, `선물 가운데 ${geishaLabel(taken)}을(를) 골랐어요.`);
    } else {
      if (action.index !== 0 && action.index !== 1) fail('두 묶음 가운데 하나를 골라 주세요.');
      const taken = pending.groups[action.index]!;
      place(state, chooser, taken);
      place(state, giver, pending.groups[1 - action.index]!);
      pushLog(state, chooser, `경쟁에서 ${listLabel(taken)} 묶음을 골랐어요.`);
    }
    state.pending = null;
    passTurn(state, giver);
    state.revision += 1;
    return state;
  }

  if (pending) fail('상대가 고르기를 기다리는 중이에요.');
  if (state.currentPlayerId !== playerId) fail('아직 내 차례가 아니에요.');
  const kind = action.type;
  if (state.used[playerId]![kind]) fail(`${ACTION_INFO[kind].name} 행동은 이번 라운드에 이미 썼어요.`);
  const hand = state.hands[playerId]!;

  if (kind === 'competition') {
    if (!('groups' in action) || !Array.isArray(action.groups) || action.groups.length !== 2) fail('두 장씩 두 묶음을 만들어 주세요.');
    const [first, second] = action.groups;
    if (first.length !== 2 || second.length !== 2) fail('두 장씩 두 묶음을 만들어 주세요.');
    const cards = takeFromHand(hand, [...first, ...second], 4);
    state.pending = { kind: 'competition', by: playerId, groups: [cards.slice(0, 2), cards.slice(2)] };
    state.currentPlayerId = otherPlayer(state.playerIds, playerId);
    pushLog(state, playerId, `경쟁: [${listLabel(cards.slice(0, 2))}] 와 [${listLabel(cards.slice(2))}] 중 고르게 했어요.`);
  } else {
    if (!('cardIds' in action) || !Array.isArray(action.cardIds)) fail('카드를 골라 주세요.');
    const cards = takeFromHand(hand, action.cardIds, ACTION_INFO[kind].cards);
    if (kind === 'secret') {
      state.secret[playerId] = cards[0]!;
      pushLog(state, playerId, '비밀: 카드 1장을 몰래 맡겨 두었어요.');
    } else if (kind === 'tradeoff') {
      state.discarded[playerId]!.push(...cards);
      pushLog(state, playerId, '포기: 카드 2장을 뒤집어 버렸어요.');
    } else {
      state.pending = { kind: 'gift', by: playerId, cards };
      state.currentPlayerId = otherPlayer(state.playerIds, playerId);
      pushLog(state, playerId, `선물: ${listLabel(cards)} 중 한 장을 고르게 했어요.`);
    }
  }
  state.used[playerId]![kind] = true;
  state.drawnId = null;
  if (!state.pending) passTurn(state, playerId);
  state.revision += 1;
  return state;
}

/** Favor markers stay where they are; the other player starts the new round. */
export function startNextHanamikojiRound(previous: HMState, rng: () => number): HMState {
  if (previous.status !== 'round-over') fail('다음 라운드를 시작할 수 없어요.');
  return {
    ...structuredClone(previous),
    round: previous.round + 1,
    status: 'playing',
    revision: previous.revision + 1,
    ...dealRound(previous.playerIds, otherPlayer(previous.playerIds, previous.startPlayerId), rng),
  };
}

export interface HMView {
  meId: string;
  opponentId: string;
  playerIds: [string, string];
  round: number;
  status: HMStatus;
  startPlayerId: string;
  currentPlayerId: string;
  deckCount: number;
  hand: HMCard[];
  opponentHandCount: number;
  used: Record<string, Record<HMActionKind, boolean>>;
  /** My own secret card; the opponent's is only a flag until the round is scored. */
  mySecret: HMCard | null;
  opponentHasSecret: boolean;
  myDiscarded: HMCard[];
  opponentDiscardedCount: number;
  placed: Record<string, HMCard[][]>;
  favor: Array<string | null>;
  pending: HMPending | null;
  /** True when I must pick from the opponent's gift or competition. */
  mustChoose: boolean;
  drawnId: string | null;
  charm: Record<string, number>;
  geishaCount: Record<string, number>;
  results: HMRoundResult[];
  /** Revealed once the round is over. */
  removed: HMCard | null;
  log: LogEntry[];
  revision: number;
  winnerId: string | null;
  winReason: HMState['winReason'];
}

export function getHanamikojiView(state: HMState, viewerId: string): HMView {
  const opponentId = otherPlayer(state.playerIds, viewerId);
  const { charm, geishas } = standing(state.favor, state.playerIds);
  const [a, b] = state.playerIds;
  const mine = state.currentPlayerId === viewerId;
  return {
    meId: viewerId, opponentId, playerIds: state.playerIds,
    round: state.round, status: state.status, startPlayerId: state.startPlayerId, currentPlayerId: state.currentPlayerId,
    deckCount: state.deck.length,
    hand: state.hands[viewerId] ?? [],
    opponentHandCount: state.hands[opponentId]?.length ?? 0,
    used: state.used,
    mySecret: state.secret[viewerId] ?? null,
    opponentHasSecret: Boolean(state.secret[opponentId]),
    myDiscarded: state.discarded[viewerId] ?? [],
    opponentDiscardedCount: state.discarded[opponentId]?.length ?? 0,
    placed: state.placed,
    favor: state.favor,
    pending: state.pending,
    mustChoose: Boolean(state.pending && state.pending.by !== viewerId && state.status === 'playing'),
    drawnId: mine ? state.drawnId : null,
    charm: { [a]: charm[0], [b]: charm[1] },
    geishaCount: { [a]: geishas[0], [b]: geishas[1] },
    results: state.results,
    removed: state.status === 'playing' ? null : state.removed,
    log: state.log.slice(-40),
    revision: state.revision,
    winnerId: state.winnerId,
    winReason: state.winReason,
  };
}
