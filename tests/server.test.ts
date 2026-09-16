import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test, { type TestContext } from 'node:test';
import { io, type Socket } from 'socket.io-client';
import { createGameServer, type GameServerOptions } from '../server/app.js';
import type { AckResult, ClientState } from '../server/types.js';

type Success = Extract<AckResult, { ok: true }>;

function socketEvent(socket: Socket, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Socket event timed out: ${event}`));
    }, 2_000);
    const handler = () => {
      clearTimeout(timeout);
      resolve();
    };
    socket.once(event, handler);
  });
}

class TestClient {
  readonly socket: Socket;
  state: ClientState | null = null;

  constructor(url: string, token?: string) {
    this.socket = io(url, {
      autoConnect: false,
      reconnection: false,
      transports: ['websocket'],
      auth: { token },
    });
    this.socket.on('state', (state: ClientState) => { this.state = state; });
  }

  async connect() {
    const connected = socketEvent(this.socket, 'connect');
    this.socket.connect();
    await connected;
    await this.waitFor((state) => Boolean(state));
    return this;
  }

  async emit(event: string, payload: unknown = {}): Promise<AckResult> {
    return this.socket.timeout(2_000).emitWithAck(event, payload) as Promise<AckResult>;
  }

  async success(event: string, payload: unknown = {}): Promise<Success> {
    const result = await this.emit(event, payload);
    assert.equal(result.ok, true, JSON.stringify(result));
    return result as Success;
  }

  async waitFor(predicate: (state: ClientState) => boolean): Promise<ClientState> {
    if (this.state && predicate(this.state)) return this.state;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.socket.off('state', handle);
        reject(new Error(`State timed out: ${JSON.stringify(this.state)}`));
      }, 2_000);
      const handle = (state: ClientState) => {
        if (!predicate(state)) return;
        clearTimeout(timeout);
        this.socket.off('state', handle);
        resolve(state);
      };
      this.socket.on('state', handle);
    });
  }
}

async function fixture(t: TestContext, options: GameServerOptions = {}) {
  const server = createGameServer({ rng: () => 0.3, ...options });
  await server.listen(0, '127.0.0.1');
  const address = server.httpServer.address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}`;
  const clients: TestClient[] = [];
  t.after(async () => {
    for (const client of clients) client.socket.disconnect();
    await server.close();
  });
  async function client(name?: string, token?: string) {
    const result = new TestClient(url, token);
    clients.push(result);
    await result.connect();
    let credentials: Success | undefined;
    if (name) {
      credentials = await result.success('session:enter', { name });
      await result.waitFor((state) => state.me?.name === name);
    }
    return { client: result, credentials };
  }
  return { server, url, client };
}

test('name entry, private tokens, atomic two-player capacity, and host-only start', async (t) => {
  const fixtureData = await fixture(t);
  const { client } = fixtureData;
  const anonymous = (await client()).client;
  assert.deepEqual(await anonymous.emit('rooms:create'), {
    ok: false, error: '이름을 입력하고 입장해 주세요.', code: 'LOGIN_REQUIRED',
  });
  assert.equal((await anonymous.emit('session:enter', { name: ' '.repeat(5) })).ok, false);
  assert.equal((await anonymous.emit('session:enter', { name: 'a'.repeat(17) })).ok, false);

  const { client: host, credentials: hostCredentials } = await client('민수');
  const { client: guest, credentials: guestCredentials } = await client('민수');
  const { client: third } = await client('지수');
  assert.notEqual(hostCredentials?.playerId, guestCredentials?.playerId, 'Names never identify a session');
  assert.notEqual(hostCredentials?.token, guestCredentials?.token);
  assert.equal(hostCredentials?.token?.length, 64);

  await host.success('rooms:create', { title: '성채 한 판' });
  const hostState = await host.waitFor((state) => state.room !== null);
  const room = hostState.room!;
  assert.equal((await host.emit('game:start')).ok, false, 'A solo host cannot start');
  const joins = await Promise.all([
    guest.emit('rooms:join', { code: room.code.toLowerCase() }),
    third.emit('rooms:join', { id: room.id }),
  ]);
  assert.equal(joins.filter((result) => result.ok).length, 1, 'Only one concurrent entrant claims the second seat');
  const rejected = joins.find((result) => !result.ok)!;
  assert.equal(rejected.ok === false && rejected.code, 'ROOM_FULL');
  const joined = joins[0]!.ok ? guest : third;
  const observer = joined === guest ? third : guest;
  await joined.waitFor((state) => state.room?.players.length === 2);
  assert.equal((await joined.emit('game:start')).ok, false, 'Only the host can start');
  await host.success('game:start');
  await host.waitFor((state) => state.room?.phase === 'playing');
  await joined.waitFor((state) => state.room?.phase === 'playing');
  const lobby = await observer.waitFor((state) => state.rooms[0]?.phase === 'playing');
  assert.equal(lobby.room, null);
  assert.equal(lobby.rooms[0]?.canJoin, false);
  assert.equal(JSON.stringify(lobby).includes(hostCredentials!.token!), false);
  assert.equal('game' in lobby.rooms[0]!, false, 'Lobby observers get no game data');
  const health = await fetch(`${fixtureData.url}/api/health`);
  assert.deepEqual(await health.json(), { ok: true });
});

test('host chooses a fixed or random Toy Battle map before starting', async (t) => {
  const { client } = await fixture(t, { rng: () => 0.3 });
  const { client: host } = await client('맵 방장');
  const { client: guest } = await client('맵 손님');
  await host.success('rooms:create', { title: '전장 선택', mapSelection: 'random' });
  const room = (await host.waitFor(state => state.room !== null)).room!;
  assert.equal(room.mapSelection, 'random');
  await guest.success('rooms:join', { id: room.id });
  assert.equal((await guest.emit('rooms:map', { mapSelection: 'city-of-clouds' })).ok, false);
  assert.equal((await host.emit('rooms:map', { mapSelection: 'not-a-map' })).ok, false);
  assert.equal((await guest.emit('rooms:turn-time', { turnSeconds: 65 })).ok, false);
  assert.equal((await host.emit('rooms:turn-time', { turnSeconds: 32 })).ok, false);
  await host.success('rooms:map', { mapSelection: 'city-of-clouds' });
  await host.success('rooms:turn-time', { turnSeconds: 65 });
  const synced = await guest.waitFor(state => state.room?.mapSelection === 'city-of-clouds' && state.room?.turnSeconds === 65);
  assert.equal(synced.room?.turnSeconds, 65);
  await host.success('game:start');
  const started = await host.waitFor(state => state.room?.game?.mapId === 'city-of-clouds');
  assert.equal(started.room?.game?.mapId, 'city-of-clouds');
  assert.equal(started.room?.turnTimer?.totalMs, 65_000);
});

test('random map selection resolves when the match starts', async (t) => {
  const { client } = await fixture(t, { rng: () => 0.3 });
  const { client: host } = await client('랜덤 방장');
  const { client: guest } = await client('랜덤 손님');
  await host.success('rooms:create', { mapSelection: 'random' });
  const room = (await host.waitFor(state => state.room !== null)).room!;
  await guest.success('rooms:join', { id: room.id });
  await host.success('game:start');
  const playing = await host.waitFor(state => state.room?.game?.mapId === 'city-of-clouds');
  assert.equal(playing.room?.mapSelection, 'random');
  assert.equal(playing.room?.game?.mapId, 'city-of-clouds');
});

test('authoritative actions, hidden hands, disconnect pause, token resume, and host transfer', async (t) => {
  const { client } = await fixture(t);
  const { client: host, credentials } = await client('하늘');
  const { client: guest } = await client('바다');
  await host.success('rooms:create');
  const roomId = (await host.waitFor((state) => Boolean(state.room))).room!.id;
  await guest.success('rooms:join', { id: roomId });
  await host.success('game:start');
  const hostState = await host.waitFor((state) => state.room?.phase === 'playing');
  const guestState = await guest.waitFor((state) => state.room?.phase === 'playing');
  const hostGame = hostState.room!.game!;
  const guestGame = guestState.room!.game!;
  assert.equal((await host.emit('game:rematch')).ok, false, 'An unfinished game cannot be reset');
  assert.equal((await guest.emit('session:enter', { name: '새 이름' })).ok, false);
  assert.equal(hostGame.currentPlayerId, guestGame.currentPlayerId);
  assert.equal(hostGame.hand.length, hostGame.firstPlayerId === hostState.me!.id ? 3 : 4);
  assert.equal(guestGame.hand.length, guestGame.firstPlayerId === guestState.me!.id ? 3 : 4);
  assert.equal(hostGame.hand.every((troop) => troop.ownerId === hostState.me!.id), true);
  assert.equal(guestGame.hand.every((troop) => troop.ownerId === guestState.me!.id), true);
  for (const player of hostGame.players) {
    assert.equal('hand' in player, false);
    assert.equal('supply' in player, false);
  }
  for (const troop of guestGame.hand) {
    assert.equal(JSON.stringify(hostGame).includes(troop.id), false, 'Opponent hand identifiers stay private');
  }

  const active = hostGame.currentPlayerId === hostState.me!.id ? host : guest;
  const inactive = active === host ? guest : host;
  const revision = active.state!.room!.game!.revision;
  assert.equal((await inactive.emit('game:action', { type: 'draw', playerId: active.state!.me!.id })).ok, false);
  assert.equal((await active.emit('game:action', { type: 'place', troopId: 'forged', nodeId: 'forged' })).ok, false);
  assert.equal((await active.emit('game:action', { type: 'choose', nodeId: 123 })).ok, false);
  assert.equal((await active.emit('game:action', { type: 'win', winnerId: active.state!.me!.id })).ok, false);
  assert.equal(active.state!.room!.game!.revision, revision);
  await active.success('game:action', { type: 'draw' });
  await Promise.all([
    active.waitFor((state) => state.room!.game!.revision > revision),
    inactive.waitFor((state) => state.room!.game!.revision > revision),
  ]);
  assert.equal(inactive.state!.room!.game!.currentPlayerId, inactive.state!.me!.id);

  const hostId = hostState.me!.id;
  const handBeforeDisconnect = host.state!.room!.game!.hand;
  host.socket.disconnect();
  await guest.waitFor((state) => state.room!.players.find((player) => player.id === hostId)?.connected === false);
  const paused = await guest.emit('game:action', { type: 'draw' });
  assert.equal(paused.ok === false && paused.code, 'PLAYER_DISCONNECTED');

  const { client: reconnected } = await client(undefined, credentials!.token);
  const restored = await reconnected.waitFor((state) => state.room?.id === roomId);
  assert.equal(restored.me!.id, hostId);
  assert.deepEqual(restored.room!.game!.hand, handBeforeDisconnect);
  assert.equal(restored.room!.players.length, 2);
  await reconnected.success('rooms:leave');
  const remaining = await guest.waitFor((state) => state.room?.phase === 'waiting');
  assert.equal(remaining.room!.hostId, remaining.me!.id);
  assert.equal(remaining.room!.players.length, 1);
  assert.equal(remaining.room!.game, null);
  assert.match(remaining.room!.notice!, /하늘/);
});

test('unknown tokens cannot impersonate players, and same-token tabs transfer the connection', async (t) => {
  const { client } = await fixture(t);
  const { client: host, credentials } = await client('가람');
  await host.success('rooms:create');
  const original = await host.waitFor((state) => Boolean(state.room));
  const { client: impostor } = await client(undefined, original.me!.id);
  assert.equal(impostor.state!.me, null);
  assert.equal((await impostor.emit('game:start')).ok, false);
  const replaced = socketEvent(host.socket, 'session:replaced');
  const { client: replacement } = await client(undefined, credentials!.token);
  await replaced;
  assert.equal(replacement.state!.me!.id, original.me!.id);
  assert.equal(replacement.state!.room!.id, original.room!.id);
  assert.equal(replacement.state!.room!.players[0]!.connected, true);
});

test('disconnected seats expire, return the remaining player to waiting, and can be filled', async (t) => {
  const { client } = await fixture(t, { reconnectGraceMs: 40, cleanupIntervalMs: 10 });
  const { client: host, credentials } = await client('봄');
  const { client: guest } = await client('여름');
  await host.success('rooms:create');
  const roomId = (await host.waitFor((state) => Boolean(state.room))).room!.id;
  await guest.success('rooms:join', { id: roomId });
  await host.success('game:start');
  await guest.waitFor((state) => state.room?.phase === 'playing');
  host.socket.disconnect();
  const remaining = await guest.waitFor((state) => state.room?.players.length === 1);
  assert.equal(remaining.room!.phase, 'waiting');
  assert.equal(remaining.room!.hostId, remaining.me!.id);
  const { client: returned } = await client(undefined, credentials!.token);
  assert.equal(returned.state!.room, null, 'Expired seat is not silently restored');
  await returned.success('rooms:join', { id: roomId });
  await guest.success('game:start');
  await returned.waitFor((state) => state.room?.phase === 'playing');
});

test('inactive rooms expire even when the browser remains connected', async (t) => {
  const { client } = await fixture(t, { roomIdleMs: 60, cleanupIntervalMs: 10 });
  const { client: host } = await client('가을');
  await host.success('rooms:create');
  await host.waitFor((state) => Boolean(state.room));
  const cleared = await host.waitFor((state) => state.room === null);
  assert.equal(cleared.rooms.length, 0);
  assert.equal(cleared.me!.name, '가을');
});

test('the turn clock advances an idle turn, pauses while a player is away, and resumes on return', async (t) => {
  const { client } = await fixture(t, { turnMs: 300 });
  const { client: host, credentials } = await client('아침');
  const { client: guest } = await client('저녁');
  await host.success('rooms:create');
  const roomId = (await host.waitFor((state) => Boolean(state.room))).room!.id;
  await guest.success('rooms:join', { id: roomId });
  await host.success('game:start');
  const started = await host.waitFor((state) => state.room?.phase === 'playing');
  assert.equal(started.room!.turnTimer?.running, true);
  assert.equal(started.room!.turnTimer?.totalMs, 300);
  assert.ok(started.room!.turnTimer!.remainingMs <= 300);
  const firstPlayer = started.room!.game!.currentPlayerId;

  const passed = await host.waitFor((state) => (state.room?.game?.turn ?? 0) >= 2);
  assert.notEqual(passed.room!.game!.currentPlayerId, firstPlayer, 'An idle turn passes on its own');
  assert.ok(passed.room!.game!.log.some((entry) => entry.text.includes('시간이 다 되어')));

  host.socket.disconnect();
  const paused = await guest.waitFor((state) => state.room?.turnTimer?.running === false);
  const turnWhilePaused = paused.room!.game!.turn;
  await new Promise((resolve) => setTimeout(resolve, 700));
  assert.equal(guest.state!.room!.game!.turn, turnWhilePaused, 'A paused clock never expires');

  const { client: back } = await client(undefined, credentials!.token);
  await back.waitFor((state) => state.room?.turnTimer?.running === true);
  await back.waitFor((state) => (state.room?.game?.turn ?? 0) > turnWhilePaused);
});

test('room rules are ignored unless the server allows them', async (t) => {
  const { client } = await fixture(t);
  const { client: host } = await client('기본');
  await host.success('rooms:create', { rules: { flank: true, depots: true, expansion: true } });
  const created = await host.waitFor((state) => Boolean(state.room));
  assert.deepEqual(created.room!.rules, { flank: false, depots: false, expansion: false });
});

test('room rules are validated, shown in the lobby, and dealt into the game', async (t) => {
  const { client } = await fixture(t, { allowCustomRules: true });
  const { client: host } = await client('규칙');
  const { client: guest } = await client('손님');
  await host.success('rooms:create', { title: '확장 한 판', rules: { flank: true, expansion: 'yes', bogus: true } });
  const created = await host.waitFor((state) => Boolean(state.room));
  assert.deepEqual(created.room!.rules, { flank: true, depots: false, expansion: false });
  const lobby = await guest.waitFor((state) => state.rooms.length === 1);
  assert.deepEqual(lobby.rooms[0]!.rules, { flank: true, depots: false, expansion: false });
  await guest.success('rooms:join', { id: created.room!.id });
  await host.success('game:start');
  const playing = await host.waitFor((state) => state.room?.phase === 'playing');
  assert.equal(playing.room!.game!.rules.flank, true);
  assert.equal(playing.room!.game!.hand.every((troop) => !['ninja', 'sapper', 'knight', 'bomb'].includes(troop.type)), true);
});
