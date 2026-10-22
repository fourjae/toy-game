import { randomBytes, randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import { RuleError, type DuelStatus } from '../shared/duel.js';
import type { AckResult, DuelClientState, DuelRoomSummary, DuelRoomView } from './types.js';

/**
 * One description per game. The duel server below turns it into a socket namespace with its own
 * sessions, rooms, invite codes, reconnect grace and rematch votes — the same shape Lost Cities has.
 */
export interface DuelGame<State, Action, View, Options> {
  namespace: string;
  defaultTitle: (hostName: string) => string;
  defaultOptions: Options;
  /** Validates room options from a client. Throw (any error) to refuse. */
  cleanOptions: (input: unknown) => Options;
  create: (playerIds: [string, string], rng: () => number, options: Options) => State;
  /** Validates an action payload from a client. Throw to refuse. */
  cleanAction: (input: unknown) => Action;
  apply: (state: State, playerId: string, action: Action, rng: () => number) => State;
  /** Hides whatever the viewer must not see. */
  view: (state: State, viewerId: string) => View;
  status: (state: State) => DuelStatus;
  /** Needed only by games with several rounds. */
  nextRound?: (state: State, rng: () => number) => State;
}

export interface DuelOptions {
  rng: () => number;
  reconnectGraceMs?: number;
  roomIdleMs?: number;
  cleanupIntervalMs?: number;
  /** Game actions allowed per player per 10 seconds. */
  actionLimit?: number;
}

interface Session {
  id: string;
  token: string;
  name: string;
  roomId: string | null;
  socketId: string | null;
  disconnectedAt: number | null;
  lastSeenAt: number;
}

interface Room<State, Options> {
  id: string;
  code: string;
  title: string;
  hostId: string;
  playerIds: string[];
  options: Options;
  game: State | null;
  readyVotes: Set<string>;
  notice: string | null;
  updatedAt: number;
}

class RequestError extends Error {
  constructor(message: string, readonly code: string) { super(message); }
}
export function requestFail(message: string, code = 'INVALID_REQUEST'): never {
  throw new RequestError(message, code);
}

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return requestFail('요청 내용을 확인해 주세요.');
  return value as Record<string, unknown>;
}

function cleanText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== 'string') return requestFail(`${label}을 입력해 주세요.`);
  const text = value.trim().replace(/\s+/gu, ' ');
  if (!text || [...text].length > maxLength || /[\u0000-\u001f\u007f]/u.test(text)) {
    return requestFail(`${label}은 1~${maxLength}자로 입력해 주세요.`);
  }
  return text;
}

/** Shared action-payload helpers for the games' cleanAction functions. */
export const actionFail = (): never => requestFail('알 수 없는 행동이에요.', 'INVALID_ACTION');
export function stringList(value: unknown, min: number, max: number): string[] {
  if (!Array.isArray(value) || value.length < min || value.length > max || value.some(item => typeof item !== 'string' || item.length > 64)) return actionFail();
  return value as string[];
}
export function smallInt(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) return actionFail();
  return value;
}

export function attachDuel<State, Action, View, Options>(io: Server, game: DuelGame<State, Action, View, Options>, options: DuelOptions) {
  const nsp = io.of(game.namespace);
  const sessions = new Map<string, Session>();
  const tokens = new Map<string, string>();
  const rooms = new Map<string, Room<State, Options>>();
  const rateLimits = new Map<string, { count: number; resetAt: number }>();
  const reconnectGraceMs = options.reconnectGraceMs ?? 90_000;
  const roomIdleMs = options.roomIdleMs ?? 6 * 60 * 60 * 1_000;
  type R = Room<State, Options>;
  const phaseOf = (room: R) => !room.game ? 'waiting' as const : game.status(room.game) === 'finished' ? 'finished' as const : 'playing' as const;

  const getSession = (socket: Socket) => {
    const id = socket.data.sessionId as string | undefined;
    const session = id ? sessions.get(id) : undefined;
    return session?.socketId === socket.id ? session : undefined;
  };
  const requireSession = (socket: Socket) => getSession(socket) ?? requestFail('이름을 입력하고 입장해 주세요.', 'LOGIN_REQUIRED');
  const requireRoom = (session: Session) =>
    (session.roomId ? rooms.get(session.roomId) : undefined) ?? requestFail('먼저 방에 들어가 주세요.', 'ROOM_REQUIRED');
  const allConnected = (room: R) => room.playerIds.every(id => sessions.get(id)?.socketId);
  const cleanOptions = (input: unknown) => {
    try { return game.cleanOptions(input); } catch (error) { return requestFail(error instanceof Error ? error.message : '설정을 확인해 주세요.'); }
  };

  function summaries(): DuelRoomSummary<Options>[] {
    return [...rooms.values()].map(room => ({
      id: room.id, code: room.code, title: room.title,
      hostName: sessions.get(room.hostId)?.name ?? '플레이어',
      playerCount: room.playerIds.length, phase: phaseOf(room),
      canJoin: room.playerIds.length < 2 && !room.game, options: room.options,
    }));
  }

  function viewRoom(room: R, session: Session): DuelRoomView<View, Options> {
    return {
      id: room.id, code: room.code, title: room.title, hostId: room.hostId,
      players: room.playerIds.map(id => ({
        id, name: sessions.get(id)?.name ?? '플레이어',
        connected: Boolean(sessions.get(id)?.socketId), isHost: room.hostId === id,
      })),
      phase: phaseOf(room), options: room.options,
      game: room.game ? game.view(room.game, session.id) : null,
      readyVotes: [...room.readyVotes], notice: room.notice,
    };
  }

  function emitState(socket: Socket, roomList = summaries()) {
    const session = getSession(socket);
    const room = session?.roomId ? rooms.get(session.roomId) : undefined;
    const state: DuelClientState<View, Options> = {
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

  function removeFromRoom(session: Session, reason: 'left' | 'timeout') {
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
    if (++entry.count > (event === 'game:action' ? options.actionLimit ?? 40 : 25)) requestFail('잠시 뒤 다시 시도해 주세요.', 'RATE_LIMITED');
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
          code: error instanceof RequestError ? error.code : error instanceof RuleError ? 'INVALID_ACTION' : 'INVALID_REQUEST',
        });
      }
    });
  }

  function startGame(room: R) {
    if (room.playerIds.length !== 2) requestFail('두 명이 모이면 시작할 수 있어요.', 'NEED_TWO_PLAYERS');
    if (!allConnected(room)) requestFail('상대의 연결을 기다려 주세요.', 'PLAYER_DISCONNECTED');
    room.game = game.create([room.playerIds[0]!, room.playerIds[1]!], options.rng, room.options);
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
        if (room?.game) requestFail('게임 중에는 이름을 바꿀 수 없어요.');
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
      if (session.roomId) requestFail('현재 방에서 나온 뒤 새 방을 만들어 주세요.', 'ALREADY_IN_ROOM');
      const input = record(payload ?? {});
      const roomOptions = input.options === undefined ? game.defaultOptions : cleanOptions(input.options);
      const title = input.title === undefined || input.title === ''
        ? game.defaultTitle(session.name) : cleanText(input.title, '방 이름', 32);
      let code: string;
      do { code = randomBytes(4).toString('hex').slice(0, 6).toUpperCase(); }
      while ([...rooms.values()].some(room => room.code === code));
      const room: R = {
        id: randomUUID(), code, title, hostId: session.id, playerIds: [session.id], options: roomOptions,
        game: null, readyVotes: new Set(), notice: null, updatedAt: Date.now(),
      };
      rooms.set(room.id, room);
      session.roomId = room.id;
    });

    listenEvent(socket, 'rooms:join', payload => {
      const session = requireSession(socket);
      const input = record(payload);
      let room: R | undefined;
      if (typeof input.id === 'string') room = rooms.get(input.id);
      else if (typeof input.code === 'string') {
        const code = input.code.trim().toUpperCase();
        if (/^[A-F0-9]{6}$/u.test(code)) room = [...rooms.values()].find(candidate => candidate.code === code);
      }
      if (!room) requestFail('방을 찾을 수 없어요. 초대 코드를 확인해 주세요.', 'ROOM_NOT_FOUND');
      if (session.roomId === room.id) return;
      if (session.roomId) requestFail('현재 방에서 나온 뒤 입장해 주세요.', 'ALREADY_IN_ROOM');
      if (room.playerIds.length >= 2) requestFail('이미 두 명이 모인 방이에요.', 'ROOM_FULL');
      if (room.game) requestFail('게임이 진행 중인 방이에요.', 'GAME_IN_PROGRESS');
      room.playerIds.push(session.id);
      room.notice = null;
      room.updatedAt = Date.now();
      session.roomId = room.id;
    });

    listenEvent(socket, 'rooms:leave', () => { removeFromRoom(requireSession(socket), 'left'); });

    listenEvent(socket, 'rooms:options', payload => {
      const session = requireSession(socket);
      const room = requireRoom(session);
      if (room.hostId !== session.id) requestFail('방장만 설정을 바꿀 수 있어요.', 'HOST_ONLY');
      if (room.game) requestFail('게임이 시작되기 전에만 바꿀 수 있어요.');
      room.options = cleanOptions(record(payload).options);
      room.updatedAt = Date.now();
    });

    listenEvent(socket, 'game:start', () => {
      const session = requireSession(socket);
      const room = requireRoom(session);
      if (room.hostId !== session.id) requestFail('방장만 게임을 시작할 수 있어요.', 'HOST_ONLY');
      if (room.game) requestFail('이미 시작한 게임이에요.');
      startGame(room);
    });

    listenEvent(socket, 'game:action', payload => {
      const session = requireSession(socket);
      const room = requireRoom(session);
      if (!room.game) requestFail('아직 게임이 시작되지 않았어요.', 'GAME_NOT_STARTED');
      if (!allConnected(room)) requestFail('상대가 다시 연결되면 계속할 수 있어요.', 'PLAYER_DISCONNECTED');
      let action: Action;
      try { action = game.cleanAction(payload); } catch (error) {
        if (error instanceof RequestError) throw error;
        return requestFail('알 수 없는 행동이에요.', 'INVALID_ACTION');
      }
      room.game = game.apply(room.game, session.id, action, options.rng);
      room.updatedAt = Date.now();
    });

    // One event for both "next round" and "rematch": both players have to say yes.
    listenEvent(socket, 'game:ready', () => {
      const session = requireSession(socket);
      const room = requireRoom(session);
      const current = room.game;
      const status = current ? game.status(current) : null;
      if (!current || (status !== 'round-over' && status !== 'finished')) requestFail('라운드가 끝나면 이어서 할 수 있어요.', 'GAME_NOT_FINISHED');
      if (!allConnected(room)) requestFail('상대의 연결을 기다려 주세요.', 'PLAYER_DISCONNECTED');
      room.readyVotes.add(session.id);
      room.updatedAt = Date.now();
      if (!room.playerIds.every(id => room.readyVotes.has(id))) return;
      room.readyVotes.clear();
      if (status === 'round-over' && game.nextRound) room.game = game.nextRound(current, options.rng);
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
