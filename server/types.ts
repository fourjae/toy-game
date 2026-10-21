import type { GameRules, GameView } from '../shared/types.js';
import type { LCView } from '../shared/lostCities.js';

export type RoomPhase = 'waiting' | 'playing' | 'finished';
export type MapSelection = 'random' | string;

export interface RoomSummary {
  id: string;
  code: string;
  title: string;
  hostName: string;
  playerCount: number;
  connectedCount: number;
  phase: RoomPhase;
  canJoin: boolean;
  rules: GameRules;
  mapSelection: MapSelection;
  turnSeconds: number;
}

export interface RoomView {
  id: string;
  code: string;
  title: string;
  hostId: string;
  players: Array<{ id: string; name: string; connected: boolean; isHost: boolean }>;
  phase: RoomPhase;
  game: GameView | null;
  rematchVotes: string[];
  notice: string | null;
  rules: GameRules;
  mapSelection: MapSelection;
  turnSeconds: number;
  /** Present while a game is running. `running` is false while a player is away. */
  turnTimer: { remainingMs: number; totalMs: number; running: boolean } | null;
}

export interface ClientState {
  me: { id: string; name: string } | null;
  rooms: RoomSummary[];
  room: RoomView | null;
}

export type AckResult =
  | { ok: true; token?: string; playerId?: string }
  | { ok: false; error: string; code: string };

/** Lost Cities shares the socket server but keeps its own rooms and sessions. */
export interface LCRoomSummary {
  id: string;
  code: string;
  title: string;
  hostName: string;
  playerCount: number;
  phase: 'waiting' | 'playing' | 'finished';
  canJoin: boolean;
  rounds: number;
}

export interface LCRoomView {
  id: string;
  code: string;
  title: string;
  hostId: string;
  players: Array<{ id: string; name: string; connected: boolean; isHost: boolean }>;
  phase: 'waiting' | 'playing' | 'finished';
  rounds: number;
  game: LCView | null;
  /** Players who asked for the next round or a rematch. */
  readyVotes: string[];
  notice: string | null;
}

export interface LCClientState {
  me: { id: string; name: string } | null;
  rooms: LCRoomSummary[];
  room: LCRoomView | null;
}
