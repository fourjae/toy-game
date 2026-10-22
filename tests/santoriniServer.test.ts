import assert from 'node:assert/strict';
import test from 'node:test';
import type { STView } from '../shared/santorini.ts';
import { duelFixture, roomLifecycleTests, type DuelClient } from './helpers/duelClient.ts';

roomLifecycleTests(test, 'santorini', '/santorini');

type C = DuelClient<STView>;
const actorOf = (host: C, guest: C) => (host.game.currentPlayerId === host.id ? [host, guest] : [guest, host]) as [C, C];

async function act(actor: C, watcher: C, action: object) {
  const revision = actor.game.revision;
  await actor.success('game:action', action);
  await watcher.waitFor(s => (s.room?.game?.revision ?? 0) > revision);
  await actor.waitFor(s => (s.room?.game?.revision ?? 0) > revision);
}

test('santorini: placement order, move-then-build, and server-side checks', async t => {
  const f = await duelFixture<STView>(t, '/santorini');
  const { host, guest } = await f.startedRoom();
  const [first, second] = actorOf(host, guest);
  await second.fails('game:action', { type: 'place', cell: 0 });
  await act(first, second, { type: 'place', cell: 0 });
  await first.fails('game:action', { type: 'place', cell: 0 });
  await first.fails('game:action', { type: 'place', cell: 25 });
  await act(first, second, { type: 'place', cell: 1 });
  await act(second, first, { type: 'place', cell: 23 });
  await act(second, first, { type: 'place', cell: 24 });
  assert.equal(first.game.phase, 'move');
  assert.equal(first.game.currentPlayerId, first.id);
  assert.ok(first.game.myMoves.length === 2);
  await first.fails('game:action', { type: 'build', cell: 5 });
  await first.fails('game:action', { type: 'move', worker: 0, to: 12 });
  await act(first, second, { type: 'move', worker: 0, to: 5 });
  assert.ok(first.game.myBuilds.includes(10));
  await act(first, second, { type: 'build', cell: 10 });
  assert.equal(second.game.levels[10], 1);
  assert.equal(second.game.currentPlayerId, second.id);
});

test('santorini: a played-out game finishes with a winner and both can rematch', async t => {
  const f = await duelFixture<STView>(t, '/santorini');
  const { host, guest } = await f.startedRoom();
  for (const cell of [0, 1, 23, 24]) { const [a, b] = actorOf(host, guest); await act(a, b, { type: 'place', cell }); }
  // Each turn: first worker that can move goes to its first target, builds on the first build target.
  for (let i = 0; i < 400 && host.game.status === 'playing'; i++) {
    const [a, b] = actorOf(host, guest);
    if (a.game.phase === 'move') {
      const move = a.game.myMoves.find(m => m.to.length)!;
      // Prefer climbing so the game ends.
      const best = [...move.to].sort((x, y) => a.game.levels[y]! - a.game.levels[x]!)[0]!;
      await act(a, b, { type: 'move', worker: move.worker, to: best });
    } else {
      await act(a, b, { type: 'build', cell: a.game.myBuilds[0]! });
    }
  }
  assert.equal(host.game.status, 'finished');
  assert.ok(host.game.winnerId);
  await host.success('game:ready');
  await guest.success('game:ready');
  const again = await host.waitFor(s => s.room?.game?.turn === 1 && s.room.game.status === 'playing');
  assert.deepEqual(again.room!.game!.levels, Array(25).fill(0));
});
