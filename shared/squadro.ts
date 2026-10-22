/**
 * Rules engine for Squadro (Adrián Jiménez Pascual, Gigamic). Pure functions.
 *
 * A 7x7 board: the middle 5x5 is shared, the rims are the start and turn-around edges.
 * Seat 0 moves five pieces up and back down the columns, seat 1 moves five pieces right and back
 * along the rows. A piece moves exactly the dots printed at the edge it last left (outward speeds
 * 1-3-2-3-1 for seat 0 and 3-1-2-1-3 for seat 1; the way back uses the far edge's dots, which are
 * the reverse). It stops on the far edge even with steps left. If it meets opposing pieces it jumps
 * the whole run of them, stops on the first free square after, loses the rest of its move, and each
 * jumped piece goes back to the edge it last started from. Four pieces home wins.
 */
import { fail, otherPlayer, pushLog, type LogEntry } from './duel.js';

export const LANES = 5;
export const EDGE = 6;
export const WIN_PIECES = 4;
/** Outward speeds per lane; the return speed is 4 minus it. */
export const OUTWARD: readonly [readonly number[], readonly number[]] = [[1, 3, 2, 3, 1], [3, 1, 2, 1, 3]];
export const speedOf = (seat: number, lane: number, returning: boolean) => {
  const out = OUTWARD[seat]![lane]!;
  return returning ? 4 - out : out;
};

export interface SQPiece { pos: number; returning: boolean; done: boolean }
export type SQAction = { type: 'move'; lane: number };
export type SQStatus = 'playing' | 'finished';

export interface SQLastMove {
  playerId: string;
  lane: number;
  from: SQPiece;
  to: SQPiece;
  /** Opposing pieces this move sent back: their lane and where they were. */
  sent: Array<{ lane: number; from: number }>;
}

export interface SQState {
  playerIds: [string, string];
  status: SQStatus;
  currentPlayerId: string;
  pieces: Record<string, SQPiece[]>;
  lastMove: SQLastMove | null;
  /** How many opposing pieces each player has sent back over the game, for the result screen. */
  sentBack: Record<string, number>;
  turn: number;
  log: LogEntry[];
  revision: number;
  winnerId: string | null;
}

/** Board square (column x, row y) of a piece. Seat 0 starts on the bottom row, seat 1 on the left column. */
export function squareOf(seat: number, lane: number, pos: number): { x: number; y: number } {
  return seat === 0 ? { x: lane + 1, y: EDGE - pos } : { x: pos, y: lane + 1 };
}

export function createSquadro(playerIds: [string, string], rng: () => number): SQState {
  const fresh = () => Array.from({ length: LANES }, () => ({ pos: 0, returning: false, done: false }));
  return {
    playerIds, status: 'playing', currentPlayerId: playerIds[Math.floor(rng() * 2)]!,
    pieces: { [playerIds[0]]: fresh(), [playerIds[1]]: fresh() },
    lastMove: null, sentBack: { [playerIds[0]]: 0, [playerIds[1]]: 0 }, turn: 1, log: [], revision: 0, winnerId: null,
  };
}

/** Which opposing lane sits on this square of my track, if a piece of theirs is there. */
function opponentAt(state: SQState, seat: number, lane: number, pos: number): number | null {
  if (pos <= 0 || pos >= EDGE) return null;
  const { x, y } = squareOf(seat, lane, pos);
  const other = state.pieces[state.playerIds[1 - seat]!]!;
  // Seat 0's square (x, y) is on seat 1's lane y-1 at pos x; seat 1's square is on seat 0's lane x-1 at pos 6-y.
  const theirLane = seat === 0 ? y - 1 : x - 1;
  const theirPos = seat === 0 ? x : EDGE - y;
  const piece = other[theirLane];
  return piece && !piece.done && piece.pos === theirPos ? theirLane : null;
}

/** Where a move would end, and who it would send back, without changing anything. */
export function previewMove(state: SQState, playerId: string, lane: number): { to: SQPiece; sent: number[] } | null {
  const seat = state.playerIds.indexOf(playerId);
  const piece = state.pieces[playerId]?.[lane];
  if (seat < 0 || !piece || piece.done) return null;
  const dir = piece.returning ? -1 : 1;
  const goal = piece.returning ? 0 : EDGE;
  let pos = piece.pos;
  const sent: number[] = [];
  for (let step = 0; step < speedOf(seat, lane, piece.returning); step++) {
    let next = pos + dir;
    if (next === goal) { pos = next; break; }
    if (opponentAt(state, seat, lane, next) !== null) {
      while (next !== goal && opponentAt(state, seat, lane, next) !== null) {
        sent.push(opponentAt(state, seat, lane, next)!);
        next += dir;
      }
      pos = next;
      break;
    }
    pos = next;
  }
  const returning = piece.returning || pos === EDGE;
  return { to: { pos, returning, done: piece.returning && pos === 0 }, sent };
}

export function applySquadroAction(previous: SQState, playerId: string, action: SQAction): SQState {
  if (previous.status !== 'playing') fail('이미 끝난 게임이에요.');
  if (previous.currentPlayerId !== playerId) fail('아직 내 차례가 아니에요.');
  if (!Number.isInteger(action.lane) || action.lane < 0 || action.lane >= LANES) fail('움직일 배를 골라 주세요.');
  const preview = previewMove(previous, playerId, action.lane);
  if (!preview) fail('이미 돌아온 배예요.');
  const state: SQState = structuredClone(previous);
  const otherId = otherPlayer(state.playerIds, playerId);
  const before = { ...state.pieces[playerId]![action.lane]! };
  state.pieces[playerId]![action.lane] = preview.to;
  const sent = preview.sent.map(lane => {
    const victim = state.pieces[otherId]![lane]!;
    const from = victim.pos;
    victim.pos = victim.returning ? EDGE : 0;
    return { lane, from };
  });
  state.lastMove = { playerId, lane: action.lane, from: before, to: preview.to, sent };
  state.sentBack[playerId] = (state.sentBack[playerId] ?? 0) + sent.length;
  const name = `${action.lane + 1}번 배`;
  pushLog(state, playerId, `${name}를 ${Math.abs(preview.to.pos - before.pos)}칸 움직였어요${preview.to.done ? ' — 돌아왔어요!' : preview.to.returning && !before.returning ? ' — 반환점을 돌았어요.' : '.'}${sent.length ? ` 상대 배 ${sent.length}척을 되돌려 보냈어요.` : ''}`);
  const home = state.pieces[playerId]!.filter(p => p.done).length;
  if (home >= WIN_PIECES) {
    state.status = 'finished';
    state.winnerId = playerId;
  } else {
    state.currentPlayerId = otherId;
    state.turn += 1;
  }
  state.revision += 1;
  return state;
}

export interface SQView {
  meId: string;
  opponentId: string;
  playerIds: [string, string];
  status: SQStatus;
  currentPlayerId: string;
  pieces: Record<string, SQPiece[]>;
  homeCount: Record<string, number>;
  /** On my turn: where each of my lanes would end up. */
  previews: Array<{ to: SQPiece; sent: number[] } | null>;
  lastMove: SQLastMove | null;
  sentBack: Record<string, number>;
  turn: number;
  log: LogEntry[];
  revision: number;
  winnerId: string | null;
}

export function getSquadroView(state: SQState, viewerId: string): SQView {
  const mine = state.status === 'playing' && state.currentPlayerId === viewerId;
  return {
    meId: viewerId, opponentId: otherPlayer(state.playerIds, viewerId), playerIds: state.playerIds,
    status: state.status, currentPlayerId: state.currentPlayerId, pieces: state.pieces,
    homeCount: Object.fromEntries(state.playerIds.map(id => [id, state.pieces[id]!.filter(p => p.done).length])),
    previews: mine ? Array.from({ length: LANES }, (_, lane) => previewMove(state, viewerId, lane)) : [],
    lastMove: state.lastMove, sentBack: state.sentBack, turn: state.turn, log: state.log.slice(-40), revision: state.revision, winnerId: state.winnerId,
  };
}
