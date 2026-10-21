/**
 * Rules engine for Santorini (Gordon Hamilton), base game without god powers. Pure functions.
 *
 * 5x5 board, two workers each. The first player places both workers, then the second player.
 * A turn: move one worker to a neighbouring cell (8 directions) that has no worker and no dome,
 * climbing at most one level (dropping any number is fine), then build on a cell next to that
 * worker: a block on levels 0-2, or a dome on level 3. Stepping up onto level 3 wins at once.
 * A player who cannot move at the start of their turn, or cannot build after moving, loses.
 * Pieces are limited like the box: 22 / 18 / 14 blocks for levels 1 / 2 / 3 and 18 domes.
 */
import { fail, otherPlayer, pushLog, type LogEntry } from './duel.js';

export const SIZE = 5;
export const CELLS = SIZE * SIZE;
export const SUPPLY = { 1: 22, 2: 18, 3: 14, dome: 18 } as const;
export type SupplyKey = keyof typeof SUPPLY;

export type STPhase = 'place' | 'move' | 'build';
export type STStatus = 'playing' | 'finished';

export type STAction =
  | { type: 'place'; cell: number }
  | { type: 'move'; worker: number; to: number }
  | { type: 'build'; cell: number };

export interface STState {
  playerIds: [string, string];
  status: STStatus;
  phase: STPhase;
  currentPlayerId: string;
  /** Who placed first; the colour of the first player's workers is fixed by seat, not by this. */
  firstPlayerId: string;
  /** Height of each cell, 0-3. A dome sits on top separately. */
  levels: number[];
  domes: boolean[];
  /** Cell index of each worker, null until placed. */
  workers: Record<string, [number | null, number | null]>;
  /** The worker that moved this turn, waiting to build. */
  movedWorker: number | null;
  supply: Record<SupplyKey, number>;
  lastMove: { playerId: string; worker: number; from: number; to: number } | null;
  lastBuild: { cell: number; dome: boolean } | null;
  turn: number;
  log: LogEntry[];
  revision: number;
  winnerId: string | null;
  winReason: 'climb' | 'stuck' | 'no-build' | null;
}

export const rowOf = (cell: number) => Math.floor(cell / SIZE);
export const colOf = (cell: number) => cell % SIZE;
export const cellName = (cell: number) => `${'ABCDE'[colOf(cell)]}${rowOf(cell) + 1}`;

export function neighbours(cell: number): number[] {
  const r = rowOf(cell), c = colOf(cell);
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (!dr && !dc) continue;
    const rr = r + dr, cc = c + dc;
    if (rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE) out.push(rr * SIZE + cc);
  }
  return out;
}

function occupied(state: Pick<STState, 'workers'>): Set<number> {
  const set = new Set<number>();
  for (const pair of Object.values(state.workers)) for (const cell of pair) if (cell !== null) set.add(cell);
  return set;
}

export function createSantorini(playerIds: [string, string], rng: () => number): STState {
  const first = playerIds[Math.floor(rng() * 2)]!;
  return {
    playerIds, status: 'playing', phase: 'place', currentPlayerId: first, firstPlayerId: first,
    levels: Array(CELLS).fill(0), domes: Array(CELLS).fill(false),
    workers: { [playerIds[0]]: [null, null], [playerIds[1]]: [null, null] },
    movedWorker: null, supply: { ...SUPPLY }, lastMove: null, lastBuild: null,
    turn: 1, log: [], revision: 0, winnerId: null, winReason: null,
  };
}

/** Cells a worker on `from` may step to. */
export function moveTargets(state: Pick<STState, 'levels' | 'domes' | 'workers'>, from: number): number[] {
  const taken = occupied(state);
  return neighbours(from).filter(to => !taken.has(to) && !state.domes[to] && state.levels[to]! - state.levels[from]! <= 1);
}

/** Cells a worker on `at` may build on, given what is left in the supply. */
export function buildTargets(state: Pick<STState, 'levels' | 'domes' | 'workers' | 'supply'>, at: number): number[] {
  const taken = occupied(state);
  return neighbours(at).filter(cell => {
    if (taken.has(cell) || state.domes[cell]) return false;
    const level = state.levels[cell]!;
    return level === 3 ? state.supply.dome > 0 : state.supply[(level + 1) as 1 | 2 | 3] > 0;
  });
}

export function legalMoves(state: STState, playerId: string): Array<{ worker: number; to: number[] }> {
  return state.workers[playerId]!.map((cell, worker) => ({ worker, to: cell === null ? [] : moveTargets(state, cell) }));
}

const canMove = (state: STState, playerId: string) => legalMoves(state, playerId).some(m => m.to.length > 0);

function finish(state: STState, winnerId: string, reason: NonNullable<STState['winReason']>) {
  state.status = 'finished';
  state.winnerId = winnerId;
  state.winReason = reason;
}

/** Starts the next player's turn, or ends the game if they are boxed in. */
function nextTurn(state: STState, from: string) {
  const next = otherPlayer(state.playerIds, from);
  state.currentPlayerId = next;
  state.phase = 'move';
  state.movedWorker = null;
  state.turn += 1;
  if (!canMove(state, next)) {
    pushLog(state, next, '움직일 수 있는 일꾼이 없어요.');
    finish(state, from, 'stuck');
  }
}

export function applySantoriniAction(previous: STState, playerId: string, action: STAction): STState {
  if (previous.status !== 'playing') fail('이미 끝난 게임이에요.');
  if (previous.currentPlayerId !== playerId) fail('아직 내 차례가 아니에요.');
  const state: STState = structuredClone(previous);
  const mine = state.workers[playerId]!;

  if (action.type === 'place') {
    if (state.phase !== 'place') fail('일꾼은 이미 모두 놓았어요.');
    if (!Number.isInteger(action.cell) || action.cell < 0 || action.cell >= CELLS) fail('판 위의 칸을 골라 주세요.');
    if (occupied(state).has(action.cell)) fail('이미 일꾼이 있는 칸이에요.');
    const slot = mine[0] === null ? 0 : 1;
    mine[slot] = action.cell;
    pushLog(state, playerId, `일꾼을 ${cellName(action.cell)}에 놓았어요.`);
    if (slot === 1) {
      const other = otherPlayer(state.playerIds, playerId);
      if (state.workers[other]![1] === null) state.currentPlayerId = other;
      else {
        // Both have placed: the first player opens the game.
        state.phase = 'move';
        state.currentPlayerId = state.firstPlayerId;
      }
    }
    state.revision += 1;
    return state;
  }

  if (action.type === 'move') {
    if (state.phase !== 'move') fail(state.phase === 'place' ? '먼저 일꾼을 놓아 주세요.' : '이제 건물을 지어야 해요.');
    if (action.worker !== 0 && action.worker !== 1) fail('내 일꾼을 골라 주세요.');
    const from = mine[action.worker];
    if (from === null || from === undefined) fail('내 일꾼을 골라 주세요.');
    if (!moveTargets(state, from).includes(action.to)) {
      fail(state.levels[action.to]! - state.levels[from]! > 1 ? '한 번에 한 층까지만 올라갈 수 있어요.' : '그 칸으로는 움직일 수 없어요.');
    }
    mine[action.worker] = action.to;
    state.lastMove = { playerId, worker: action.worker, from, to: action.to };
    state.lastBuild = null;
    state.movedWorker = action.worker;
    pushLog(state, playerId, `${cellName(from)} → ${cellName(action.to)} (${state.levels[action.to]}층)`);
    if (state.levels[action.to] === 3 && state.levels[from]! < 3) {
      pushLog(state, playerId, '3층에 올라섰어요!');
      finish(state, playerId, 'climb');
    } else if (buildTargets(state, action.to).length === 0) {
      pushLog(state, playerId, '지을 곳이 없어요.');
      finish(state, otherPlayer(state.playerIds, playerId), 'no-build');
    } else state.phase = 'build';
    state.revision += 1;
    return state;
  }

  if (action.type === 'build') {
    if (state.phase !== 'build') fail('먼저 일꾼을 움직여 주세요.');
    const at = mine[state.movedWorker!]!;
    if (!buildTargets(state, at).includes(action.cell)) fail('방금 움직인 일꾼 옆 빈칸에만 지을 수 있어요.');
    const level = state.levels[action.cell]!;
    if (level === 3) {
      state.domes[action.cell] = true;
      state.supply.dome -= 1;
      state.lastBuild = { cell: action.cell, dome: true };
      pushLog(state, playerId, `${cellName(action.cell)}에 돔을 얹었어요.`);
    } else {
      state.levels[action.cell] = level + 1;
      state.supply[(level + 1) as 1 | 2 | 3] -= 1;
      state.lastBuild = { cell: action.cell, dome: false };
      pushLog(state, playerId, `${cellName(action.cell)}에 ${level + 1}층을 지었어요.`);
    }
    nextTurn(state, playerId);
    state.revision += 1;
    return state;
  }
  return fail('알 수 없는 행동이에요.');
}

export interface STView {
  meId: string;
  opponentId: string;
  playerIds: [string, string];
  status: STStatus;
  phase: STPhase;
  currentPlayerId: string;
  firstPlayerId: string;
  levels: number[];
  domes: boolean[];
  workers: Record<string, [number | null, number | null]>;
  movedWorker: number | null;
  supply: Record<SupplyKey, number>;
  /** Only filled on my own turn. */
  myMoves: Array<{ worker: number; to: number[] }>;
  myBuilds: number[];
  lastMove: STState['lastMove'];
  lastBuild: STState['lastBuild'];
  turn: number;
  log: LogEntry[];
  revision: number;
  winnerId: string | null;
  winReason: STState['winReason'];
}

export function getSantoriniView(state: STState, viewerId: string): STView {
  const mine = state.currentPlayerId === viewerId && state.status === 'playing';
  const at = state.movedWorker === null ? null : state.workers[viewerId]?.[state.movedWorker] ?? null;
  return {
    meId: viewerId, opponentId: otherPlayer(state.playerIds, viewerId), playerIds: state.playerIds,
    status: state.status, phase: state.phase, currentPlayerId: state.currentPlayerId, firstPlayerId: state.firstPlayerId,
    levels: state.levels, domes: state.domes, workers: state.workers, movedWorker: state.movedWorker, supply: state.supply,
    myMoves: mine && state.phase === 'move' ? legalMoves(state, viewerId) : [],
    myBuilds: mine && state.phase === 'build' && at !== null ? buildTargets(state, at) : [],
    lastMove: state.lastMove, lastBuild: state.lastBuild, turn: state.turn,
    log: state.log.slice(-40), revision: state.revision, winnerId: state.winnerId, winReason: state.winReason,
  };
}
