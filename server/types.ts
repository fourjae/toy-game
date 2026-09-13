import type { GameRules, GameView } from '../shared/types.js';

export type RoomPhase = 'waiting' | 'playing' | 'finished';

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
