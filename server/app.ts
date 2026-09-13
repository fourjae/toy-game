import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import express from 'express';
import { Server, type Socket } from 'socket.io';
import { applyAction, applyTimeout, createGame, DEFAULT_RULES, getGameView, TURN_SECONDS } from '../shared/engine.js';
import type { GameAction, GameRules, GameState } from '../shared/types.js';
import type { AckResult, ClientState, RoomPhase, RoomSummary, RoomView } from './types.js';

interface Session {
  id: string;
  token: string;
  name: string;
  roomId: string | null;
  socketId: string | null;
  disconnectedAt: number | null;
  lastSeenAt: number;
}

interface Room {
  id: string;
  code: string;
  title: string;
  hostId: string;
  playerIds: string[];
  game: GameState | null;
  rules: GameRules;
  rematchVotes: Set<string>;
  notice: string | null;
  updatedAt: number;
  turnDeadline: number | null;
  turnTimer: NodeJS.Timeout | null;
  pausedRemainingMs: number | null;
}

export interface GameServerOptions {
  /** Development clients normally connect through Vite's same-origin proxy. */
  corsOrigins?: string[];
  staticDirectory?: string;
  reconnectGraceMs?: number;
  roomIdleMs?: number;
  cleanupIntervalMs?: number;
  /** Thinking time per decision; the default is the rule's 30 seconds. */
  turnMs?: number;
  /** Whether a room may switch on the expansion rules. Off unless ENABLE_EXPANSION_RULES=1. */
  allowCustomRules?: boolean;
  rng?: () => number;
}

class RequestError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
  }
}

function fail(message: string, code = 'INVALID_REQUEST'): never {
  throw new RequestError(message, code);
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return fail('요청 내용을 확인해 주세요.');
  }
  return value as Record<string, unknown>;
}

/** Unknown keys are dropped and anything that is not exactly true stays off. */
function cleanRules(value: unknown): GameRules {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return { flank: input.flank === true, depots: input.depots === true, expansion: input.expansion === true };
}

function cleanText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== 'string') return fail(`${label}을 입력해 주세요.`);
  const text = value.trim().replace(/\s+/gu, ' ');
  if (!text || [...text].length > maxLength || /[\u0000-\u001f\u007f]/u.test(text)) {
    return fail(`${label}은 1~${maxLength}자로 입력해 주세요.`);
  }
  return text;
}

/**
 * Rooms and tokens live in memory for this MVP. Restarting the process clears
 * them. A token identifies a player; display names are never authentication.
 */
export function createGameServer(options: GameServerOptions = {}) {
  const app = express();
  app.disable('x-powered-by');
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: options.corsOrigins ?? ['http://localhost:5173', 'http://127.0.0.1:5173'] },
    maxHttpBufferSize: 8_192,
    serveClient: false,
  });
  const sessions = new Map<string, Session>();
  const tokens = new Map<string, string>();
  const rooms = new Map<string, Room>();
  const rateLimits = new Map<string, { count: number; resetAt: number }>();
  const reconnectGraceMs = options.reconnectGraceMs ?? 90_000;
  const roomIdleMs = options.roomIdleMs ?? 6 * 60 * 60 * 1_000;
  const turnMs = options.turnMs ?? TURN_SECONDS * 1_000;
  const allowCustomRules = options.allowCustomRules ?? process.env.ENABLE_EXPANSION_RULES === '1';
  // Coming back from a dropped connection always leaves a moment to act.
  const resumeFloorMs = Math.min(5_000, turnMs);
  const rng = options.rng ?? (() => randomInt(0, 0x1_0000_0000) / 0x1_0000_0000);
  let closing = false;

  const getPhase = (room: Room): RoomPhase =>
    room.game ? room.game.status : 'waiting';

  function getSession(socket: Socket): Session | undefined {
    const id = socket.data.sessionId as string | undefined;
    const session = id ? sessions.get(id) : undefined;
    return session?.socketId === socket.id ? session : undefined;
  }

  function requireSession(socket: Socket): Session {
    return getSession(socket) ?? fail('이름을 입력하고 입장해 주세요.', 'LOGIN_REQUIRED');
  }

  function requireRoom(session: Session): Room {
    return (session.roomId ? rooms.get(session.roomId) : undefined)
      ?? fail('먼저 방에 들어가 주세요.', 'ROOM_REQUIRED');
  }

  const allConnected = (room: Room) => room.playerIds.every((id) => sessions.get(id)?.socketId);

  function stopClock(room: Room) {
    if (room.turnTimer) clearTimeout(room.turnTimer);
    room.turnTimer = null;
    room.turnDeadline = null;
    room.pausedRemainingMs = null;
  }

  /** Every decision gets a fresh clock. With a player away it waits, paused, for both to be back. */
  function startClock(room: Room, remainingMs = turnMs) {
    stopClock(room);
    if (!room.game || room.game.status !== 'playing') return;
    if (!allConnected(room)) {
      room.pausedRemainingMs = remainingMs;
      return;
    }
    room.turnDeadline = Date.now() + remainingMs;
    room.turnTimer = setTimeout(() => expireClock(room), remainingMs);
    room.turnTimer.unref();
  }

  function pauseClock(room: Room) {
    if (!room.turnTimer || room.turnDeadline === null) return;
    const remaining = room.turnDeadline - Date.now();
    stopClock(room);
    room.pausedRemainingMs = Math.max(remaining, resumeFloorMs);
  }

  function resumeClock(room: Room) {
    if (room.pausedRemainingMs === null || !allConnected(room)) return;
    startClock(room, room.pausedRemainingMs);
  }

  function expireClock(room: Room) {
    room.turnTimer = null;
    room.turnDeadline = null;
    if (!rooms.has(room.id) || !room.game || room.game.status !== 'playing') return;
    if (!allConnected(room)) {
      room.pausedRemainingMs = resumeFloorMs;
      return;
    }
    try {
      room.game = applyTimeout(room.game, room.game.currentPlayerId, rng);
      room.updatedAt = Date.now();
    } catch (error) {
      console.error('turn clock could not advance the game', error);
    }
    startClock(room);
    broadcast();
  }

  function summaries(): RoomSummary[] {
    return [...rooms.values()].map((room) => ({
      id: room.id,
      code: room.code,
      title: room.title,
      hostName: sessions.get(room.hostId)?.name ?? '플레이어',
      playerCount: room.playerIds.length,
      connectedCount: room.playerIds.filter((id) => sessions.get(id)?.socketId).length,
      phase: getPhase(room),
      canJoin: room.playerIds.length < 2 && !room.game,
      rules: room.rules,
    }));
  }

  function viewRoom(room: Room, session: Session): RoomView {
    return {
      id: room.id,
      code: room.code,
      title: room.title,
      hostId: room.hostId,
      players: room.playerIds.map((id) => ({
        id,
        name: sessions.get(id)?.name ?? '플레이어',
        connected: Boolean(sessions.get(id)?.socketId),
        isHost: room.hostId === id,
      })),
      phase: getPhase(room),
      game: room.game ? getGameView(room.game, session.id) : null,
      rematchVotes: [...room.rematchVotes],
      notice: room.notice,
      rules: room.rules,
      turnTimer: room.game?.status === 'playing'
        ? room.turnDeadline !== null
          ? { remainingMs: Math.max(0, room.turnDeadline - Date.now()), totalMs: turnMs, running: true }
          : { remainingMs: room.pausedRemainingMs ?? turnMs, totalMs: turnMs, running: false }
        : null,
    };
  }

  function emitState(socket: Socket, roomList = summaries()) {
    const session = getSession(socket);
    const room = session?.roomId ? rooms.get(session.roomId) : undefined;
    const state: ClientState = {
      me: session ? { id: session.id, name: session.name } : null,
      rooms: roomList,
      room: room && session ? viewRoom(room, session) : null,
    };
    socket.emit('state', state);
  }

  function broadcast() {
    const roomList = summaries();
    for (const socket of io.sockets.sockets.values()) emitState(socket, roomList);
  }

  function removeFromRoom(session: Session, reason: 'left' | 'timeout' | 'expired') {
    const room = session.roomId ? rooms.get(session.roomId) : undefined;
    session.roomId = null;
    if (!room) return;
    room.playerIds = room.playerIds.filter((id) => id !== session.id);
    stopClock(room);
    if (room.playerIds.length === 0) {
      rooms.delete(room.id);
      return;
    }
    if (room.hostId === session.id) room.hostId = room.playerIds[0]!;
    room.game = null;
    room.rematchVotes.clear();
    room.updatedAt = Date.now();
    room.notice = reason === 'timeout'
      ? `${session.name} 님의 연결이 끊어져 대기실로 돌아왔어요.`
      : reason === 'expired'
        ? '오래 사용하지 않은 방을 정리했어요.'
        : `${session.name} 님이 나갔어요. 새 상대를 기다려 주세요.`;
  }

  function attachSession(socket: Socket, session: Session) {
    const previousSocketId = session.socketId;
    socket.data.sessionId = session.id;
    session.socketId = socket.id;
    session.disconnectedAt = null;
    session.lastSeenAt = Date.now();
    if (previousSocketId && previousSocketId !== socket.id) {
      const previous = io.sockets.sockets.get(previousSocketId);
      previous?.emit('session:replaced');
      previous?.disconnect(true);
    }
    const room = session.roomId ? rooms.get(session.roomId) : undefined;
    if (room) resumeClock(room);
  }

  function limit(socket: Socket, event: string) {
    const key = `${getSession(socket)?.id ?? socket.id}:${event === 'game:action' ? 'action' : 'request'}`;
    const now = Date.now();
    let entry = rateLimits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + 10_000 };
      rateLimits.set(key, entry);
    }
    if (++entry.count > (event === 'game:action' ? 35 : 25)) {
      fail('잠시 뒤 다시 시도해 주세요.', 'RATE_LIMITED');
    }
  }

  function listenEvent(
    socket: Socket,
    event: string,
    handler: (payload: unknown) => { token?: string; playerId?: string } | void,
  ) {
    socket.on(event, (payload: unknown, callback?: (result: AckResult) => void) => {
      const ack = typeof callback === 'function' ? callback : () => undefined;
      try {
        limit(socket, event);
        const result = handler(payload);
        const session = getSession(socket);
        if (session) session.lastSeenAt = Date.now();
        ack({ ok: true, ...result });
        broadcast();
      } catch (error) {
        ack({
          ok: false,
          error: error instanceof Error ? error.message : '요청을 처리하지 못했어요.',
          code: error instanceof RequestError ? error.code : 'INVALID_ACTION',
        });
      }
    });
  }

  function startGame(room: Room) {
    if (room.playerIds.length !== 2) fail('두 명이 모이면 시작할 수 있어요.', 'NEED_TWO_PLAYERS');
    if (room.playerIds.some((id) => !sessions.get(id)?.socketId)) {
      fail('상대의 연결을 기다려 주세요.', 'PLAYER_DISCONNECTED');
    }
    room.game = createGame([room.playerIds[0]!, room.playerIds[1]!], rng, room.rules);
    room.rematchVotes.clear();
    room.notice = null;
    room.updatedAt = Date.now();
    startClock(room);
  }

  io.on('connection', (socket) => {
    const token = socket.handshake.auth?.token;
    if (typeof token === 'string' && token.length <= 128) {
      const id = tokens.get(token);
      const session = id ? sessions.get(id) : undefined;
      if (session) attachSession(socket, session);
    }

    listenEvent(socket, 'session:enter', (payload) => {
      const name = cleanText(record(payload).name, '이름', 16);
      let session = getSession(socket);
      if (session) {
        const room = session.roomId ? rooms.get(session.roomId) : undefined;
        if (room?.game) fail('게임 중에는 이름을 바꿀 수 없어요.');
        session.name = name;
      } else {
        session = {
          id: randomUUID(), token: randomBytes(32).toString('hex'), name,
          roomId: null, socketId: null, disconnectedAt: null, lastSeenAt: Date.now(),
        };
        sessions.set(session.id, session);
        tokens.set(session.token, session.id);
        attachSession(socket, session);
      }
      return { token: session.token, playerId: session.id };
    });

    listenEvent(socket, 'rooms:create', (payload) => {
      const session = requireSession(socket);
      if (session.roomId) fail('현재 방에서 나온 뒤 새 방을 만들어 주세요.', 'ALREADY_IN_ROOM');
      const input = record(payload ?? {});
      const title = input.title === undefined || input.title === ''
        ? `${session.name}의 성채 평원`
        : cleanText(input.title, '방 이름', 32);
      let code: string;
      do {
        code = randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
      } while ([...rooms.values()].some((room) => room.code === code));
      const room: Room = {
        id: randomUUID(), code, title, hostId: session.id, playerIds: [session.id],
        game: null, rules: allowCustomRules && input.rules !== undefined ? cleanRules(input.rules) : { ...DEFAULT_RULES },
        rematchVotes: new Set(), notice: null, updatedAt: Date.now(),
        turnDeadline: null, turnTimer: null, pausedRemainingMs: null,
      };
      rooms.set(room.id, room);
      session.roomId = room.id;
    });

    listenEvent(socket, 'rooms:join', (payload) => {
      const session = requireSession(socket);
      const input = record(payload);
      let room: Room | undefined;
      if (typeof input.id === 'string') room = rooms.get(input.id);
      else if (typeof input.code === 'string') {
        const code = input.code.trim().toUpperCase();
        if (/^[A-F0-9]{6}$/u.test(code)) {
          room = [...rooms.values()].find((candidate) => candidate.code === code);
        }
      }
      if (!room) fail('방을 찾을 수 없어요. 초대 코드를 확인해 주세요.', 'ROOM_NOT_FOUND');
      if (session.roomId === room.id) return;
      if (session.roomId) fail('현재 방에서 나온 뒤 입장해 주세요.', 'ALREADY_IN_ROOM');
      if (room.playerIds.length >= 2) fail('이미 두 명이 모인 방이에요.', 'ROOM_FULL');
      if (room.game) fail('게임이 진행 중인 방이에요.', 'GAME_IN_PROGRESS');
      // No await between capacity validation and insertion: a third entrant cannot race this.
      room.playerIds.push(session.id);
      room.notice = null;
      room.updatedAt = Date.now();
      session.roomId = room.id;
    });

    listenEvent(socket, 'rooms:leave', () => {
      removeFromRoom(requireSession(socket), 'left');
    });

    listenEvent(socket, 'game:start', () => {
      const session = requireSession(socket);
      const room = requireRoom(session);
      if (room.hostId !== session.id) fail('방장만 게임을 시작할 수 있어요.', 'HOST_ONLY');
      if (room.game) fail('이미 시작한 게임이에요.');
      startGame(room);
    });

    listenEvent(socket, 'game:action', (payload) => {
      const session = requireSession(socket);
      const room = requireRoom(session);
      if (!room.game) fail('아직 게임이 시작되지 않았어요.', 'GAME_NOT_STARTED');
      if (room.playerIds.some((id) => !sessions.get(id)?.socketId)) {
        fail('상대가 다시 연결되면 계속할 수 있어요.', 'PLAYER_DISCONNECTED');
      }
      const action = record(payload);
      if (!['draw', 'place', 'choose', 'skip'].includes(String(action.type))) {
        fail('알 수 없는 행동이에요.', 'INVALID_ACTION');
      }
      if (action.type === 'place' && (typeof action.troopId !== 'string' || typeof action.nodeId !== 'string')) {
        fail('병력과 배치할 칸을 선택해 주세요.', 'INVALID_ACTION');
      }
      if (action.type === 'place' && action.useAbility !== undefined && typeof action.useAbility !== 'boolean') {
        fail('능력 사용 여부를 확인해 주세요.', 'INVALID_ACTION');
      }
      if (action.type === 'choose' && typeof action.nodeId !== 'string') {
        fail('대상 칸을 선택해 주세요.', 'INVALID_ACTION');
      }
      room.game = applyAction(room.game, session.id, action as unknown as GameAction, rng);
      room.updatedAt = Date.now();
      startClock(room);
    });

    listenEvent(socket, 'game:rematch', () => {
      const session = requireSession(socket);
      const room = requireRoom(session);
      if (getPhase(room) !== 'finished') fail('게임이 끝나면 다시 할 수 있어요.', 'GAME_NOT_FINISHED');
      if (room.playerIds.some((id) => !sessions.get(id)?.socketId)) {
        fail('상대의 연결을 기다려 주세요.', 'PLAYER_DISCONNECTED');
      }
      room.rematchVotes.add(session.id);
      room.updatedAt = Date.now();
      if (room.playerIds.every((id) => room.rematchVotes.has(id))) startGame(room);
    });

    socket.on('state:request', () => emitState(socket));
    socket.on('disconnect', () => {
      const session = getSession(socket);
      if (!session) return;
      session.socketId = null;
      session.disconnectedAt = Date.now();
      session.lastSeenAt = Date.now();
      const room = session.roomId ? rooms.get(session.roomId) : undefined;
      if (room) pauseClock(room);
      if (!closing) broadcast();
    });
    broadcast();
  });

  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    let changed = false;
    for (const session of sessions.values()) {
      if (session.disconnectedAt !== null && now - session.disconnectedAt >= reconnectGraceMs) {
        if (session.roomId) {
          removeFromRoom(session, 'timeout');
          changed = true;
        }
        // Keep names/tokens for a day, but never reserve a room longer than the grace period.
        if (now - session.lastSeenAt > 24 * 60 * 60 * 1_000) {
          tokens.delete(session.token);
          sessions.delete(session.id);
        }
      }
    }
    for (const room of rooms.values()) {
      if (now - room.updatedAt >= roomIdleMs) {
        for (const id of [...room.playerIds]) {
          const session = sessions.get(id);
          if (session) session.roomId = null;
        }
        stopClock(room);
        rooms.delete(room.id);
        changed = true;
      }
    }
    for (const [key, value] of rateLimits) if (value.resetAt <= now) rateLimits.delete(key);
    if (changed) broadcast();
  }, options.cleanupIntervalMs ?? 5_000);
  cleanupTimer.unref();

  app.get('/api/health', (_request, response) => {
    response.json({ ok: true });
  });
  const staticDirectory = path.resolve(options.staticDirectory ?? 'dist');
  if (existsSync(path.join(staticDirectory, 'index.html'))) {
    app.use(express.static(staticDirectory));
    app.use((request, response, next) => {
      if (request.method !== 'GET' || request.path.startsWith('/api/')) return next();
      response.sendFile(path.join(staticDirectory, 'index.html'));
    });
  }

  return {
    app,
    io,
    httpServer,
    async listen(port = 3001, host = '0.0.0.0') {
      await new Promise<void>((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(port, host, () => {
          httpServer.off('error', reject);
          resolve();
        });
      });
      return httpServer.address();
    },
    async close() {
      closing = true;
      clearInterval(cleanupTimer);
      for (const room of rooms.values()) stopClock(room);
      await new Promise<void>((resolve) => io.close(() => resolve()));
    },
  };
}
