/**
 * Rules engine for Omok (Gomoku, 五目). Pure functions.
 *
 * A 15x15 board; black moves first, then the players take turns putting one stone on an empty
 * crossing. Five or more in a row (any direction) wins; a full board is a draw. Stones never move.
 * Which seat is black is drawn at random when the room starts.
 *
 * Free style is the default. The `renju` room option adds the Renju restrictions for black only:
 * overline (six or more), double-four and double-three are forbidden points; a black move that makes
 * exactly five wins even on such a point, and for black only an exact five counts. White is free.
 */
import { fail, otherPlayer, pushLog, type LogEntry } from './duel.js';

export const SIZE = 15;
export const CELLS = SIZE * SIZE;
export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;
const WALL = -1;
const COLUMNS = 'ABCDEFGHIJKLMNO';
/** Board columns are read left to right, rows top to bottom, both from 0. */
const DIRS: ReadonlyArray<readonly [number, number]> = [[1, 0], [0, 1], [1, 1], [1, -1]];
/** Forbidden-point checks look at most this many nested "would that move be legal" levels deep. */
const MAX_DEPTH = 3;

export interface OMOptions { renju: boolean }
export const DEFAULT_OPTIONS: OMOptions = { renju: false };
export type OMForbidden = 'six' | 'four-four' | 'three-three';
export const FORBIDDEN_LABEL: Record<OMForbidden, string> = { six: '장목(6목 이상)', 'four-four': '4-4', 'three-three': '3-3' };

export type OMAction = { type: 'place'; cell: number };
export type OMStatus = 'playing' | 'finished';

export interface OMState {
  playerIds: [string, string];
  blackId: string;
  status: OMStatus;
  currentPlayerId: string;
  /** Row-major, EMPTY / BLACK / WHITE. */
  stones: number[];
  lastMove: { playerId: string; cell: number } | null;
  /** The stones of the winning line, in order, once somebody has won. */
  winLine: number[];
  moveCount: number;
  renju: boolean;
  log: LogEntry[];
  revision: number;
  winnerId: string | null;
}

export const cellName = (cell: number) => `${COLUMNS[cell % SIZE]}${Math.floor(cell / SIZE) + 1}`;

export function createOmok(playerIds: [string, string], rng: () => number, options: OMOptions = DEFAULT_OPTIONS): OMState {
  const blackId = playerIds[Math.floor(rng() * 2)]!;
  return {
    playerIds, blackId, status: 'playing', currentPlayerId: blackId, stones: Array<number>(CELLS).fill(EMPTY),
    lastMove: null, winLine: [], moveCount: 0, renju: options.renju, log: [], revision: 0, winnerId: null,
  };
}

const stoneAt = (board: readonly number[], x: number, y: number) => x >= 0 && x < SIZE && y >= 0 && y < SIZE ? board[y * SIZE + x]! : WALL;

/** The unbroken run of `color` stones through (x, y) along one direction, ends included. */
function runThrough(board: readonly number[], x: number, y: number, dx: number, dy: number, color: number) {
  let x1 = x, y1 = y;
  while (stoneAt(board, x1 - dx, y1 - dy) === color) { x1 -= dx; y1 -= dy; }
  let x2 = x, y2 = y;
  while (stoneAt(board, x2 + dx, y2 + dy) === color) { x2 += dx; y2 += dy; }
  return { len: Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) + 1, x1, y1, x2, y2 };
}
type Run = ReturnType<typeof runThrough>;
const runCells = (run: Run, dx: number, dy: number) => Array.from({ length: run.len }, (_, i) => (run.y1 + dy * i) * SIZE + run.x1 + dx * i);
const runCovers = (run: Run, x: number, y: number) => x >= Math.min(run.x1, run.x2) && x <= Math.max(run.x1, run.x2) && y >= Math.min(run.y1, run.y2) && y <= Math.max(run.y1, run.y2);

/** Empty crossings on the line through (x, y), within four steps of it either way (a five can reach no further). */
function* lineCandidates(board: readonly number[], x: number, y: number, dx: number, dy: number) {
  for (let t = -4; t <= 4; t++) {
    const px = x + dx * t, py = y + dy * t;
    if (t !== 0 && stoneAt(board, px, py) === EMPTY) yield [px, py] as const;
  }
}

/** How many separate fours the stone at (x, y) takes part in along one line. A straight four counts once. */
function countFours(board: number[], x: number, y: number, dx: number, dy: number): number {
  const fours = new Set<string>();
  for (const [px, py] of lineCandidates(board, x, y, dx, dy)) {
    board[py * SIZE + px] = BLACK;
    const run = runThrough(board, px, py, dx, dy, BLACK);
    if (run.len === 5 && runCovers(run, x, y)) fours.add(runCells(run, dx, dy).filter(c => c !== py * SIZE + px).join(','));
    board[py * SIZE + px] = EMPTY;
  }
  return fours.size;
}

/** Whether one more legal black stone on this line would make an open four through (x, y). */
function isOpenThree(board: number[], x: number, y: number, dx: number, dy: number, depth: number): boolean {
  for (const [px, py] of lineCandidates(board, x, y, dx, dy)) {
    const cell = py * SIZE + px;
    board[cell] = BLACK;
    const run = runThrough(board, px, py, dx, dy, BLACK);
    // Both ends open, and neither end would stretch the four into a six.
    const open = run.len === 4 && runCovers(run, x, y)
      && stoneAt(board, run.x1 - dx, run.y1 - dy) === EMPTY && stoneAt(board, run.x2 + dx, run.y2 + dy) === EMPTY
      && stoneAt(board, run.x1 - 2 * dx, run.y1 - 2 * dy) !== BLACK && stoneAt(board, run.x2 + 2 * dx, run.y2 + 2 * dy) !== BLACK;
    board[cell] = EMPTY;
    if (open && forbiddenReasonAt(board, cell, depth + 1) === null) return true;
  }
  return false;
}

/** Why black may not put a stone on this empty crossing, or null when it may. Leaves `board` as it found it. */
function forbiddenReasonAt(board: number[], cell: number, depth = 0): OMForbidden | null {
  if (depth > MAX_DEPTH) return null;
  const x = cell % SIZE, y = Math.floor(cell / SIZE);
  board[cell] = BLACK;
  try {
    let overline = false;
    for (const [dx, dy] of DIRS) {
      const { len } = runThrough(board, x, y, dx, dy, BLACK);
      if (len === 5) return null; // An exact five wins, whatever else the move makes.
      if (len > 5) overline = true;
    }
    if (overline) return 'six';
    let fours = 0, threes = 0;
    for (const [dx, dy] of DIRS) {
      const found = countFours(board, x, y, dx, dy);
      fours += found;
      if (found === 0 && isOpenThree(board, x, y, dx, dy, depth)) threes++;
    }
    if (fours >= 2) return 'four-four';
    if (threes >= 2) return 'three-three';
    return null;
  } finally {
    board[cell] = EMPTY;
  }
}

/** Public check for tests and the view: would black be refused on this crossing under Renju rules? */
export function forbiddenReason(stones: readonly number[], cell: number): OMForbidden | null {
  if (stones[cell] !== EMPTY) return null;
  return forbiddenReasonAt([...stones], cell);
}

/** The line of five (or more) the stone just placed on `cell` completes, if any. */
function completedLine(board: readonly number[], cell: number, color: number, renju: boolean): number[] | null {
  const x = cell % SIZE, y = Math.floor(cell / SIZE);
  for (const [dx, dy] of DIRS) {
    const run = runThrough(board, x, y, dx, dy, color);
    if (run.len === 5 || (run.len > 5 && !(renju && color === BLACK))) return runCells(run, dx, dy);
  }
  return null;
}

export function applyOmokAction(previous: OMState, playerId: string, action: OMAction): OMState {
  if (previous.status !== 'playing') fail('이미 끝난 게임이에요.');
  if (previous.currentPlayerId !== playerId) fail('아직 내 차례가 아니에요.');
  const { cell } = action;
  if (!Number.isInteger(cell) || cell < 0 || cell >= CELLS) fail('판 안의 자리를 골라 주세요.');
  if (previous.stones[cell] !== EMPTY) fail('이미 돌이 놓인 자리예요.');
  const color = playerId === previous.blackId ? BLACK : WHITE;
  if (previous.renju && color === BLACK) {
    const reason = forbiddenReason(previous.stones, cell);
    if (reason) fail(`금수 자리예요. 흑은 ${FORBIDDEN_LABEL[reason]}가 되는 곳에 둘 수 없어요.`);
  }
  const state: OMState = structuredClone(previous);
  state.stones[cell] = color;
  state.moveCount += 1;
  state.lastMove = { playerId, cell };
  const line = completedLine(state.stones, cell, color, state.renju);
  pushLog(state, playerId, `${cellName(cell)}에 ${color === BLACK ? '흑' : '백'}돌을 놓았어요${line ? ' — 오목 완성!' : '.'}`);
  if (line) {
    state.status = 'finished';
    state.winnerId = playerId;
    state.winLine = line;
  } else if (state.moveCount === CELLS) {
    state.status = 'finished';
    pushLog(state, playerId, '판이 가득 차서 비겼어요.');
  } else {
    state.currentPlayerId = otherPlayer(state.playerIds, playerId);
  }
  state.revision += 1;
  return state;
}

export interface OMView {
  meId: string;
  opponentId: string;
  playerIds: [string, string];
  blackId: string;
  status: OMStatus;
  currentPlayerId: string;
  stones: number[];
  lastMove: { playerId: string; cell: number } | null;
  winLine: number[];
  moveCount: number;
  renju: boolean;
  /** On black's turn in a Renju room: the crossings black may not use. Always empty otherwise. */
  forbidden: Array<{ cell: number; reason: OMForbidden }>;
  log: LogEntry[];
  revision: number;
  winnerId: string | null;
}

/** Nothing in Omok is hidden, so the view is the state plus the forbidden points for the player who needs them. */
export function getOmokView(state: OMState, viewerId: string): OMView {
  const forbidden: OMView['forbidden'] = [];
  if (state.renju && state.status === 'playing' && state.currentPlayerId === viewerId && viewerId === state.blackId) {
    const board = [...state.stones];
    for (let cell = 0; cell < CELLS; cell++) {
      if (board[cell] !== EMPTY) continue;
      const reason = forbiddenReasonAt(board, cell);
      if (reason) forbidden.push({ cell, reason });
    }
  }
  return {
    meId: viewerId, opponentId: otherPlayer(state.playerIds, viewerId), playerIds: state.playerIds, blackId: state.blackId,
    status: state.status, currentPlayerId: state.currentPlayerId, stones: state.stones, lastMove: state.lastMove,
    winLine: state.winLine, moveCount: state.moveCount, renju: state.renju, forbidden,
    log: state.log.slice(-40), revision: state.revision, winnerId: state.winnerId,
  };
}
