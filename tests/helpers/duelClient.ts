import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { TestContext } from 'node:test';
import { io, type Socket } from 'socket.io-client';
import { createGameServer, type GameServerOptions } from '../../server/app.js';
import type { AckResult, DuelClientState } from '../../server/types.js';

export type Success = Extract<AckResult, { ok: true }>;

/** A socket.io client for one of the server/duel.ts namespaces. */
export class DuelClient<View> {
  readonly socket: Socket;
  state: DuelClientState<View> | null = null;

  constructor(url: string, namespace: string, token?: string) {
    this.socket = io(`${url}${namespace}`, { autoConnect: false, reconnection: false, transports: ['websocket'], auth: { token } });
    this.socket.on('state', (state: DuelClientState<View>) => { this.state = state; });
  }

  async connect() {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('connect timed out')), 2_000);
      this.socket.once('connect', () => { clearTimeout(timer); resolve(); });
      this.socket.connect();
    });
    await this.waitFor(Boolean);
    return this;
  }

  emit(event: string, payload: unknown = {}) {
    return this.socket.timeout(2_000).emitWithAck(event, payload) as Promise<AckResult>;
  }

  async success(event: string, payload: unknown = {}) {
    const result = await this.emit(event, payload);
    assert.equal(result.ok, true, JSON.stringify(result));
    return result as Success;
  }

  async fails(event: string, payload: unknown = {}) {
    const result = await this.emit(event, payload);
    assert.equal(result.ok, false, `${event} should have been refused`);
    return result as Extract<AckResult, { ok: false }>;
  }

  waitFor(predicate: (state: DuelClientState<View>) => boolean): Promise<DuelClientState<View>> {
    if (this.state && predicate(this.state)) return Promise.resolve(this.state);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.socket.off('state', handle); reject(new Error(`state timed out: ${JSON.stringify(this.state)?.slice(0, 400)}`)); }, 2_000);
      const handle = (state: DuelClientState<View>) => {
        if (!predicate(state)) return;
        clearTimeout(timer);
        this.socket.off('state', handle);
        resolve(state);
      };
      this.socket.on('state', handle);
    });
  }

  get game(): View { return this.state!.room!.game!; }
  get id(): string { return this.state!.me!.id; }
}

export async function duelFixture<View>(t: TestContext, namespace: string, options: GameServerOptions = {}) {
  const server = createGameServer({ rng: () => 0.3, ...options, duels: { actionLimit: 10_000, ...options.duels } });
  await server.listen(0, '127.0.0.1');
  const url = `http://127.0.0.1:${(server.httpServer.address() as AddressInfo).port}`;
  const clients: DuelClient<View>[] = [];
  t.after(async () => {
    for (const client of clients) client.socket.disconnect();
    await server.close();
  });
  async function player(name?: string, token?: string) {
    const client = new DuelClient<View>(url, namespace, token);
    clients.push(client);
    await client.connect();
    let credentials: Success | undefined;
    if (name) {
      credentials = await client.success('session:enter', { name });
      await client.waitFor(state => state.me?.name === name);
    }
    return { client, credentials };
  }
  /** Host creates, guest joins by code, host starts. */
  async function startedRoom(roomOptions?: unknown) {
    const { client: host, credentials: hostCredentials } = await player('민수');
    const { client: guest, credentials: guestCredentials } = await player('지수');
    await host.success('rooms:create', { title: '한 판', ...(roomOptions ? { options: roomOptions } : {}) });
    const code = (await host.waitFor(state => state.room !== null)).room!.code;
    await guest.success('rooms:join', { code });
    await host.waitFor(state => state.room?.players.length === 2);
    await host.success('game:start');
    await host.waitFor(state => state.room?.phase === 'playing');
    await guest.waitFor(state => state.room?.phase === 'playing');
    return { host, guest, hostCredentials: hostCredentials!, guestCredentials: guestCredentials!, code };
  }
  return { url, player, startedRoom };
}

/** Shared room-lifecycle checks every duel game should pass. */
export function roomLifecycleTests(
  test: (name: string, fn: (t: TestContext) => Promise<void>) => void,
  label: string,
  namespace: string,
) {
  test(`${label}: rooms are their own namespace with codes, a two-seat limit and host-only start`, async t => {
    const f = await duelFixture(t, namespace);
    const { client: host } = await f.player('민수');
    const { client: second } = await f.player('지수');
    const { client: third } = await f.player('영희');
    await host.fails('game:start');
    await host.success('rooms:create', {});
    const room = (await host.waitFor(state => state.room !== null)).room!;
    assert.match(room.code, /^[A-F0-9]{6}$/u);
    assert.match(room.title, /민수/u);
    await host.fails('game:start');
    const joins = await Promise.all([second.emit('rooms:join', { code: room.code.toLowerCase() }), third.emit('rooms:join', { id: room.id })]);
    assert.equal(joins.filter(result => result.ok).length, 1, 'only one entrant gets the second seat');
    const seated = joins[0]!.ok ? second : third;
    await seated.fails('game:start');
    await host.success('game:start');
    await seated.waitFor(state => state.room?.phase === 'playing');
    await host.fails('game:start');
    await seated.fails('session:enter', { name: '새이름' });
  });

  test(`${label}: leaving mid-game sends the room back to waiting`, async t => {
    const f = await duelFixture(t, namespace);
    const { host, guest } = await f.startedRoom();
    await guest.success('rooms:leave');
    const state = await host.waitFor(s => s.room?.phase === 'waiting');
    assert.equal(state.room!.players.length, 1);
    assert.equal(state.room!.game, null);
    assert.match(state.room!.notice ?? '', /나갔어요/u);
  });

  test(`${label}: reconnecting with the token restores the seat and the game`, async t => {
    const f = await duelFixture(t, namespace);
    const { host, guest, guestCredentials } = await f.startedRoom();
    const before = JSON.stringify(guest.game);
    guest.socket.disconnect();
    await host.waitFor(state => state.room?.players.some(p => !p.connected) === true);
    const { client: again } = await f.player(undefined, guestCredentials.token);
    const restored = await again.waitFor(state => state.room?.game != null);
    assert.equal(restored.me?.id, guestCredentials.playerId);
    assert.equal(JSON.stringify(restored.room!.game), before);
  });

  test(`${label}: a player away past the grace period loses the room back to waiting`, async t => {
    const f = await duelFixture(t, namespace, { duels: { reconnectGraceMs: 150, cleanupIntervalMs: 40 } });
    const { host, guest } = await f.startedRoom();
    guest.socket.disconnect();
    const state = await host.waitFor(s => s.room?.phase === 'waiting');
    assert.match(state.room!.notice ?? '', /연결이 끊어져/u);
  });
}
