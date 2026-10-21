import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test, { type TestContext } from 'node:test';
import { io, type Socket } from 'socket.io-client';
import { createGameServer, type GameServerOptions } from '../server/app.js';
import type { AckResult, ClientState, LCClientState } from '../server/types.js';
import type { LCView } from '../shared/lostCities.js';

type Success = Extract<AckResult, { ok: true }>;

class LCClient {
  readonly socket: Socket;
  state: LCClientState | null = null;

  constructor(url: string, token?: string) {
    this.socket = io(`${url}/lost-cities`, { autoConnect: false, reconnection: false, transports: ['websocket'], auth: { token } });
    this.socket.on('state', (state: LCClientState) => { this.state = state; });
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

  waitFor(predicate: (state: LCClientState) => boolean): Promise<LCClientState> {
    if (this.state && predicate(this.state)) return Promise.resolve(this.state);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.socket.off('state', handle); reject(new Error(`state timed out: ${JSON.stringify(this.state)?.slice(0, 400)}`)); }, 2_000);
      const handle = (state: LCClientState) => {
        if (!predicate(state)) return;
        clearTimeout(timer);
        this.socket.off('state', handle);
        resolve(state);
      };
      this.socket.on('state', handle);
    });
  }

  get game(): LCView { return this.state!.room!.game!; }
}

async function fixture(t: TestContext, options: GameServerOptions = {}) {
  // Whole games are played in a few milliseconds here, far past the pace limit a person could reach.
  const server = createGameServer({ rng: () => 0.3, ...options, lostCities: { actionLimit: 10_000, ...options.lostCities } });
  await server.listen(0, '127.0.0.1');
  const url = `http://127.0.0.1:${(server.httpServer.address() as AddressInfo).port}`;
  const clients: LCClient[] = [];
  t.after(async () => {
    for (const client of clients) client.socket.disconnect();
    await server.close();
  });
  async function player(name?: string, token?: string) {
    const client = new LCClient(url, token);
    clients.push(client);
    await client.connect();
    let credentials: Success | undefined;
    if (name) {
      credentials = await client.success('session:enter', { name });
      await client.waitFor(state => state.me?.name === name);
    }
    return { client, credentials };
  }
  return { url, player };
}

/** Host creates, guest joins by code, host starts. */
async function startedRoom(t: TestContext, rounds?: number, options: GameServerOptions = {}) {
  const f = await fixture(t, options);
  const { client: host, credentials: hostCredentials } = await f.player('민수');
  const { client: guest, credentials: guestCredentials } = await f.player('지수');
  await host.success('rooms:create', { title: '탐험 한 판', ...(rounds ? { rounds } : {}) });
  const code = (await host.waitFor(state => state.room !== null)).room!.code;
  await guest.success('rooms:join', { code });
  await host.waitFor(state => state.room?.players.length === 2);
  await host.success('game:start');
  await host.waitFor(state => state.room?.phase === 'playing');
  await guest.waitFor(state => state.room?.phase === 'playing');
  return { ...f, host, guest, hostCredentials: hostCredentials!, guestCredentials: guestCredentials!, code };
}

const ofTurn = (host: LCClient, guest: LCClient) => host.game.currentPlayerId === host.state!.me!.id ? [host, guest] as const : [guest, host] as const;

/** Plays one full turn for whoever is up: lay the first card that fits (else discard), then draw from the deck. */
async function playTurn(host: LCClient, guest: LCClient) {
  const [mover, watcher] = ofTurn(host, guest);
  const hand = mover.game.hand;
  const layable = hand.find(card => mover.game.playable[card.id]);
  const revision = mover.game.revision;
  if (layable) await mover.success('game:action', { type: 'play', cardId: layable.id });
  else await mover.success('game:action', { type: 'discard', cardId: hand[0]!.id });
  await mover.waitFor(state => state.room?.game?.phase === 'draw');
  await mover.success('game:action', { type: 'draw', from: 'deck' });
  await watcher.waitFor(state => (state.room?.game?.revision ?? 0) >= revision + 2);
  await mover.waitFor(state => (state.room?.game?.revision ?? 0) >= revision + 2);
}

test('lost cities: login, name rules, room codes and the two-seat limit', async t => {
  const f = await fixture(t);
  const { client: anonymous } = await f.player();
  assert.equal((await anonymous.fails('rooms:create')).code, 'LOGIN_REQUIRED');
  await anonymous.fails('session:enter', { name: '   ' });
  await anonymous.fails('session:enter', { name: 'a'.repeat(17) });
  const { client: host, credentials } = await f.player('민수');
  const { client: second } = await f.player('지수');
  const { client: third } = await f.player('하늘');
  assert.equal(credentials?.token?.length, 64);
  await host.fails('rooms:create', { rounds: 2 });
  await host.success('rooms:create', { title: '원정대', rounds: 1 });
  const room = (await host.waitFor(state => state.room !== null)).room!;
  assert.equal(room.rounds, 1);
  assert.match(room.code, /^[A-F0-9]{6}$/u);
  await host.fails('game:start');
  const joins = await Promise.all([second.emit('rooms:join', { code: room.code.toLowerCase() }), third.emit('rooms:join', { id: room.id })]);
  assert.equal(joins.filter(result => result.ok).length, 1, 'only one entrant gets the second seat');
  assert.equal(joins.find(result => !result.ok && result.code === 'ROOM_FULL') !== undefined, true);
  await second.fails('rooms:join', { code: 'ZZZZZZ' });
});

test('lost cities: rooms and sessions are separate from Toy Battle', async t => {
  const f = await fixture(t);
  const { client: host } = await f.player('민수');
  await host.success('rooms:create');
  await host.waitFor(state => state.room !== null);
  // A Toy Battle client on the default namespace sees no Lost Cities rooms, and its token means nothing here.
  const toy = io(f.url, { autoConnect: false, reconnection: false, transports: ['websocket'] });
  const toyState = new Promise<ClientState>(resolve => toy.once('state', resolve));
  toy.connect();
  assert.deepEqual((await toyState).rooms, []);
  const toyLogin = await toy.timeout(2_000).emitWithAck('session:enter', { name: '토이' }) as Success;
  toy.disconnect();
  const { client: stranger } = await f.player(undefined, toyLogin.token);
  assert.equal(stranger.state!.me, null, 'a Toy Battle token does not log in to Lost Cities');
});

test('lost cities: the game starts with hidden hands and only the host may start or set rounds', async t => {
  const f = await fixture(t);
  const { client: host } = await f.player('민수');
  const { client: guest } = await f.player('지수');
  const { client: watcher } = await f.player('구경');
  await host.success('rooms:create');
  const code = (await host.waitFor(state => state.room !== null)).room!.code;
  await guest.success('rooms:join', { code });
  await guest.fails('game:start');
  await guest.fails('rooms:rounds', { rounds: 1 });
  await host.success('rooms:rounds', { rounds: 1 });
  await guest.waitFor(state => state.room?.rounds === 1);
  await host.success('game:start');
  await host.fails('rooms:rounds', { rounds: 3 });
  await host.waitFor(state => state.room?.phase === 'playing');
  await guest.waitFor(state => state.room?.phase === 'playing');
  assert.equal(host.game.hand.length, 8);
  assert.equal(guest.game.hand.length, 8);
  assert.equal(host.game.deckCount, 44);
  assert.equal(host.game.opponentHandCount, 8);
  const hostIds = new Set(host.game.hand.map(card => card.id));
  assert.ok(guest.game.hand.every(card => !hostIds.has(card.id)), 'hands are disjoint');
  assert.ok(!JSON.stringify(guest.state).includes(JSON.stringify(host.game.hand[0]!)), "the guest's payload never contains the host's cards");
  const lobby = await watcher.waitFor(state => state.rooms[0]?.phase === 'playing');
  assert.equal(lobby.room, null);
  assert.equal(lobby.rooms[0]!.canJoin, false);
  assert.equal('game' in lobby.rooms[0]!, false, 'lobby observers receive no game data');
  await watcher.fails('rooms:join', { code });
});

test('lost cities: turn order, illegal moves and the draw rules are enforced by the server', async t => {
  const { host, guest } = await startedRoom(t, 1);
  const [mover, waiter] = ofTurn(host, guest);
  const card = mover.game.hand[0]!;
  await waiter.fails('game:action', { type: 'discard', cardId: waiter.game.hand[0]!.id });
  await mover.fails('game:action', { type: 'draw', from: 'deck' });
  await mover.fails('game:action', { type: 'play', cardId: 'nope-1' });
  await mover.fails('game:action', { type: 'explode' });
  await mover.fails('game:action', { type: 'discard' });
  await mover.success('game:action', { type: 'discard', cardId: card.id });
  await mover.waitFor(state => state.room?.game?.phase === 'draw');
  const back = await mover.fails('game:action', { type: 'draw', from: card.site });
  assert.match(back.error, /도로/);
  await mover.fails('game:action', { type: 'discard', cardId: mover.game.hand[0]!.id });
  await mover.success('game:action', { type: 'draw', from: 'deck' });
  await waiter.waitFor(state => state.room?.game?.currentPlayerId === waiter.state!.me!.id);
  assert.equal(waiter.game.discards[card.site].at(-1)?.id, card.id);
  assert.equal(waiter.game.deckCount, 43);
  const spare = waiter.game.hand.find(c => c.site !== card.site)!;
  await waiter.success('game:action', { type: 'discard', cardId: spare.id });
  await waiter.waitFor(state => state.room?.game?.phase === 'draw');
  assert.ok(waiter.game.drawable.includes(card.site), 'the opponent may take the card I discarded');
  assert.ok(!waiter.game.drawable.includes(spare.site), 'but not the one they just discarded');
});

test('lost cities: a one-round match plays to the end and both players can rematch', async t => {
  const { host, guest } = await startedRoom(t, 1);
  for (let i = 0; i < 200 && host.game.status === 'playing'; i++) await playTurn(host, guest);
  await host.waitFor(state => state.room?.phase === 'finished');
  await guest.waitFor(state => state.room?.phase === 'finished');
  assert.equal(host.game.deckCount, 0);
  assert.equal(host.game.roundScores.length, 1);
  assert.equal(host.game.status, 'finished');
  const [scoreA, scoreB] = host.game.roundScores[0]!;
  assert.equal(host.game.winnerId, scoreA === scoreB ? null : scoreA > scoreB ? host.game.playerIds[0] : host.game.playerIds[1]);
  await host.fails('game:action', { type: 'discard', cardId: host.game.hand[0]!.id });
  await host.success('game:ready');
  await host.waitFor(state => state.room?.readyVotes.length === 1);
  assert.equal(host.game.status, 'finished', 'one vote is not enough');
  await guest.success('game:ready');
  await host.waitFor(state => state.room?.game?.status === 'playing');
  assert.equal(host.game.deckCount, 44);
  assert.equal(host.game.roundScores.length, 0);
});

test('lost cities: a 3-round match needs both votes between rounds and keeps the running total', async t => {
  const { host, guest } = await startedRoom(t, 3);
  await host.fails('game:ready');
  for (let i = 0; i < 200 && host.game.status === 'playing'; i++) await playTurn(host, guest);
  await host.waitFor(state => state.room?.game?.status === 'round-over');
  await guest.waitFor(state => state.room?.game?.status === 'round-over');
  assert.equal(host.state!.room!.phase, 'playing');
  const firstRound = host.game.roundScores[0]!;
  await guest.success('game:ready');
  await host.success('game:ready');
  await host.waitFor(state => state.room?.game?.round === 2);
  assert.equal(host.game.status, 'playing');
  assert.deepEqual(host.game.roundScores, [firstRound]);
  assert.deepEqual(host.game.matchTotals, firstRound);
  assert.equal(host.game.deckCount, 44);
  // The player with the lower score opens the next round.
  const lower = firstRound[0] === firstRound[1] ? null : firstRound[0] < firstRound[1] ? host.game.playerIds[0] : host.game.playerIds[1];
  if (lower) assert.equal(host.game.currentPlayerId, lower);
});

test('lost cities: leaving mid-game returns the room to waiting for the one who stays', async t => {
  const { host, guest } = await startedRoom(t);
  await guest.success('rooms:leave');
  const state = await host.waitFor(s => s.room?.phase === 'waiting');
  assert.equal(state.room!.players.length, 1);
  assert.equal(state.room!.game, null);
  assert.match(state.room!.notice ?? '', /나갔어요/);
  assert.equal(state.rooms[0]!.canJoin, true);
});

test('lost cities: reconnecting with the token restores the seat and the game', async t => {
  const f = await startedRoom(t);
  const before = f.guest.game;
  f.guest.socket.disconnect();
  await f.host.waitFor(state => state.room?.players.some(p => !p.connected) === true);
  await f.host.fails('game:action', { type: 'discard', cardId: f.host.game.hand[0]!.id }).catch(() => undefined);
  const { client: again } = await f.player(undefined, f.guestCredentials.token);
  const restored = await again.waitFor(state => state.room?.game !== null && state.room !== null);
  assert.equal(restored.me?.id, f.guestCredentials.playerId);
  assert.deepEqual(restored.room!.game!.hand, before.hand);
  assert.equal(restored.room!.game!.revision, before.revision);
});

test('lost cities: a player who stays away past the grace period loses the room back to waiting', async t => {
  const f = await startedRoom(t, undefined, { lostCities: { reconnectGraceMs: 150, cleanupIntervalMs: 40 } });
  f.guest.socket.disconnect();
  const state = await f.host.waitFor(s => s.room?.phase === 'waiting');
  assert.equal(state.room!.players.length, 1);
  assert.match(state.room!.notice ?? '', /연결이 끊어져/);
});
