import { randomBytes, randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import {
  applyLostCitiesAction, createLostCities, getLostCitiesView, LCRuleError, startNextRound,
  type LCAction, type LCState,
} from '../shared/lostCities.js';
import type { AckResult, LCClientState, LCRoomSummary, LCRoomView } from './types.js';

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
  rounds: number;
  game: LCState | null;
  readyVotes: Set<string>;
  notice: string | null;
  updatedAt: number;
}

export interface LostCitiesOptions {
  rng: () => number;
  reconnectGraceMs?: number;
  roomIdleMs?: number;
  cleanupIntervalMs?: number;
  /** Game actions allowed per player per 10 seconds. Tests that play whole games in milliseconds raise it. */
  actionLimit?: number;
}

class RequestError extends Error {
  constructor(message: string, readonly code: string) { super(message); }
}
function fail(message: string, code = 'INVALID_REQUEST'): never {
  throw new RequestError(message, code);
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('요청 내용을 확인해 주세요.');
  return value as Record<string, unknown>;
}

function cleanText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== 'string') return fail(`${label}을 입력해 주세요.`);
  const text = value.trim().replace(/\s+/gu, ' ');
  if (!text || [...text].length > maxLength || /[\u0000-\u001f\u007f]/u.test(text)) {
    return fail(`${label}은 1~${maxLength}자로 입력해 주세요.`);
  }
  return text;
}

function cleanRounds(value: unknown): number {
  if (value === 1 || value === 3) return value;
  return fail('라운드는 1판 또는 3판으로 골라 주세요.');
}

function cleanAction(value: unknown): LCAction {
  const input = record(value);
  if ((input.type === 'play' || input.type === 'discard') && typeof input.cardId === 'string') {
    return { type: input.type, cardId: input.cardId };
  }
  if (input.type === 'draw' && typeof input.from === 'string') return { type: 'draw', from: input.from as never };
  return fail('알 수 없는 행동이에요.', 'INVALID_ACTION');
}

/**
 * Lost Cities lives on its own namespace so its rooms, names and tokens never mix with Toy Battle.
 * Everything is in memory, like the rest of the server.
 */
export function attachLostCities(io: Server, options: LostCitiesOptions) {
  const nsp = io.of('/lost-cities');
  const sessions = new Map<string, Session>();
  const tokens = new Map<string, string>();
  const rooms = new Map<string, Room>();
  const rateLimits = new Map<string, { count: number; resetAt: number }>();
  const reconnectGraceMs = options.reconnectGraceMs ?? 90_000;
  const roomIdleMs = options.roomIdleMs ?? 6 * 60 * 60 * 1_000;
  const phaseOf = (room: Room) => !room.game ? 'waiting' as const : room.game.status === 'finished' ? 'finished' as const : 'playing' as const;

  const getSession = (socket: Socket) => {
    const id = socket.data.sessionId as string | undefined;
    const session = id ? sessions.get(id) : undefined;
    return session?.socketId === socket.id ? session : undefined;
  };
  const requireSession = (socket: Socket) => getSession(socket) ?? fail('이름을 입력하고 입장해 주세요.', 'LOGIN_REQUIRED');
  const requireRoom = (session: Session) =>
    (session.roomId ? rooms.get(session.roomId) : undefined) ?? fail('먼저 방에 들어가 주세요.', 'ROOM_REQUIRED');
  const allConnected = (room: Room) => room.playerIds.every(id => sessions.get(id)?.socketId);

  function summaries(): LCRoomSummary[] {
    return [...rooms.values()].map(room => ({
      id: room.id, code: room.code, title: room.title,
      hostName: sessions.get(room.hostId)?.name ?? '플레이어',
      playerCount: room.playerIds.length, phase: phaseOf(room),
      canJoin: room.playerIds.length < 2 && !room.game, rounds: room.rounds,
    }));
  }

  function viewRoom(room: Room, session: Session): LCRoomView {
    return {
      id: room.id, code: room.code, title: room.title, hostId: room.hostId,
      players: room.playerIds.map(id => ({
        id, name: sessions.get(id)?.name ?? '플레이어',
        connected: Boolean(sessions.get(id)?.socketId), isHost: room.hostId === id,
      })),
      phase: phaseOf(room), rounds: room.rounds,
      game: room.game ? getLostCitiesView(room.game, session.id) : null,
      readyVotes: [...room.readyVotes], notice: room.notice,
    };
  }

  function emitState(socket: Socket, roomList = summaries()) {
    const session = getSession(socket);
    const room = session?.roomId ? rooms.get(session.roomId) : undefined;
    const state: LCClientState = {
      me: session ? { id: session.id, name: session.name } : null,
      rooms: roomList,
      room: room && session ? viewRoom(room, session) : null,
    };
    socket.emit('state', state);
  }

  function broadcast() {
    const roomList = summaries();
    for (const socket of nsp.sockets.values()) emitState(socket, roomList);
  }

  function removeFromRoom(session: Session, reason: 'left' | 'timeout' | 'expired') {
    const room = session.roomId ? rooms.get(session.roomId) : undefined;
    session.roomId = null;
    if (!room) return;
    room.playerIds = room.playerIds.filter(id => id !== session.id);
    if (room.playerIds.length === 0) { rooms.delete(room.id); return; }
    if (room.hostId === session.id) room.hostId = room.playerIds[0]!;
    room.game = null;
    room.readyVotes.clear();
    room.updatedAt = Date.now();
    room.notice = reason === 'timeout'
      ? `${session.name} 님의 연결이 끊어져 대기실로 돌아왔어요.`
      : reason === 'expired' ? '오래 사용하지 않은 방을 정리했어요.'
        : `${session.name} 님이 나갔어요. 새 상대를 기다려 주세요.`;
  }

  function attachSession(socket: Socket, session: Session) {
    const previousSocketId = session.socketId;
    socket.data.sessionId = session.id;
    session.socketId = socket.id;
    session.disconnectedAt = null;
    session.lastSeenAt = Date.now();
    if (previousSocketId && previousSocketId !== socket.id) {
      const previous = nsp.sockets.get(previousSocketId);
      previous?.emit('session:replaced');
      previous?.disconnect(true);
    }
  }

  function limit(socket: Socket, event: string) {
    const key = `${getSession(socket)?.id ?? socket.id}:${event === 'game:action' ? 'action' : 'request'}`;
    const now = Date.now();
    let entry = rateLimits.get(key);
    if (!entry || entry.resetAt <= now) { entry = { count: 0, resetAt: now + 10_000 }; rateLimits.set(key, entry); }
    if (++entry.count > (event === 'game:action' ? options.actionLimit ?? 35 : 25)) fail('잠시 뒤 다시 시도해 주세요.', 'RATE_LIMITED');
  }

  function listenEvent(socket: Socket, event: string, handler: (payload: unknown) => { token?: string; playerId?: string } | void) {
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
          code: error instanceof RequestError ? error.code : error instanceof LCRuleError ? 'INVALID_ACTION' : 'INVALID_REQUEST',
        });
      }
    });
  }

  function startGame(room: Room) {
    if (room.playerIds.length !== 2) fail('두 명이 모이면 시작할 수 있어요.', 'NEED_TWO_PLAYERS');
    if (!allConnected(room)) fail('상대의 연결을 기다려 주세요.', 'PLAYER_DISCONNECTED');
    room.game = createLostCities([room.playerIds[0]!, room.playerIds[1]!], options.rng, room.rounds);
    room.readyVotes.clear();
    room.notice = null;
    room.updatedAt = Date.now();
  }

  nsp.on('connection', socket => {
    const token = socket.handshake.auth?.token;
    if (typeof token === 'string' && token.length <= 128) {
      const id = tokens.get(token);
      const session = id ? sessions.get(id) : undefined;
      if (session) attachSession(socket, session);
    }

    listenEvent(socket, 'session:enter', payload => {
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

    listenEvent(socket, 'rooms:create', payload => {
      const session = requireSession(socket);
      if (session.roomId) fail('현재 방에서 나온 뒤 새 방을 만들어 주세요.', 'ALREADY_IN_ROOM');
      const input = record(payload ?? {});
      const rounds = input.rounds === undefined ? 3 : cleanRounds(input.rounds);
      const title = input.title === undefined || input.title === ''
        ? `${session.name}의 원정대` : cleanText(input.title, '방 이름', 32);
      let code: string;
      do { code = randomBytes(4).toString('hex').slice(0, 6).toUpperCase(); }
      while ([...rooms.values()].some(room => room.code === code));
      const room: Room = {
        id: randomUUID(), code, title, hostId: session.id, playerIds: [session.id], rounds,
        game: null, readyVotes: new Set(), notice: null, updatedAt: Date.now(),
      };
      rooms.set(room.id, room);
      session.roomId = room.id;
    });

    listenEvent(socket, 'rooms:join', payload => {
      const session = requireSession(socket);
      const input = record(payload);
      let room: Room | undefined;
      if (typeof input.id === 'string') room = rooms.get(input.id);
      else if (typeof input.code === 'string') {
        const code = input.code.trim().toUpperCase();
        if (/^[A-F0-9]{6}$/u.test(code)) room = [...rooms.values()].find(candidate => candidate.code === code);
      }
      if (!room) fail('방을 찾을 수 없어요. 초대 코드를 확인해 주세요.', 'ROOM_NOT_FOUND');
      if (session.roomId === room.id) return;
      if (session.roomId) fail('현재 방에서 나온 뒤 입장해 주세요.', 'ALREADY_IN_ROOM');
      if (room.playerIds.length >= 2) fail('이미 두 명이 모인 방이에요.', 'ROOM_FULL');
      if (room.game) fail('게임이 진행 중인 방이에요.', 'GAME_IN_PROGRESS');
      room.playerIds.push(session.id);
      room.notice = null;
      room.updatedAt = Date.now();
      session.roomId = room.id;
    });

    listenEvent(socket, 'rooms:leave', () => { removeFromRoom(requireSession(socket), 'left'); });

    listenEvent(socket, 'rooms:rounds', payload => {
      const session = requireSession(socket);
      const room = requireRoom(session);
      if (room.hostId !== session.id) fail('방장만 라운드 수를 바꿀 수 있어요.', 'HOST_ONLY');
      if (room.game) fail('게임이 시작되기 전에만 바꿀 수 있어요.');
      room.rounds = cleanRounds(record(payload).rounds);
      room.updatedAt = Date.now();
    });

    listenEvent(socket, 'game:start', () => {
      const session = requireSession(socket);
      const room = requireRoom(session);
      if (room.hostId !== session.id) fail('방장만 게임을 시작할 수 있어요.', 'HOST_ONLY');
      if (room.game) fail('이미 시작한 게임이에요.');
      startGame(room);
    });

    listenEvent(socket, 'game:action', payload => {
      const session = requireSession(socket);
      const room = requireRoom(session);
      if (!room.game) fail('아직 게임이 시작되지 않았어요.', 'GAME_NOT_STARTED');
      if (!allConnected(room)) fail('상대가 다시 연결되면 계속할 수 있어요.', 'PLAYER_DISCONNECTED');
      room.game = applyLostCitiesAction(room.game, session.id, cleanAction(payload));
      room.updatedAt = Date.now();
    });

    // One event for both "next round" and "rematch": both players have to say yes.
    listenEvent(socket, 'game:ready', () => {
      const session = requireSession(socket);
      const room = requireRoom(session);
      const game = room.game;
      if (!game || (game.status !== 'round-over' && game.status !== 'finished')) fail('라운드가 끝나면 이어서 할 수 있어요.', 'GAME_NOT_FINISHED');
      if (!allConnected(room)) fail('상대의 연결을 기다려 주세요.', 'PLAYER_DISCONNECTED');
      room.readyVotes.add(session.id);
      room.updatedAt = Date.now();
      if (!room.playerIds.every(id => room.readyVotes.has(id))) return;
      room.readyVotes.clear();
      if (game.status === 'round-over') room.game = startNextRound(game, options.rng);
      else startGame(room);
    });

    socket.on('state:request', () => emitState(socket));
    socket.on('disconnect', () => {
      const session = getSession(socket);
      if (!session) return;
      session.socketId = null;
      session.disconnectedAt = Date.now();
      session.lastSeenAt = Date.now();
      broadcast();
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
        if (now - session.lastSeenAt > 24 * 60 * 60 * 1_000) { tokens.delete(session.token); sessions.delete(session.id); }
      }
    }
    for (const room of rooms.values()) {
      if (now - room.updatedAt >= roomIdleMs) {
        for (const id of room.playerIds) { const s = sessions.get(id); if (s) s.roomId = null; }
        rooms.delete(room.id);
        changed = true;
      }
    }
    for (const [key, value] of rateLimits) if (value.resetAt <= now) rateLimits.delete(key);
    if (changed) broadcast();
  }, options.cleanupIntervalMs ?? 5_000);
  cleanupTimer.unref();

  return { stop: () => clearInterval(cleanupTimer) };
}
