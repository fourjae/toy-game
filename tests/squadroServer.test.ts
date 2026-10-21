import assert from 'node:assert/strict';
import test from 'node:test';
import type { SQView } from '../shared/squadro.ts';
import { duelFixture, roomLifecycleTests, type DuelClient } from './helpers/duelClient.ts';

roomLifecycleTests(test, 'squadro', '/squadro');

type C = DuelClient<SQView>;

test('squadro: turn order and payload checks, then a full race to a winner and a rematch', async t => {
  const f = await duelFixture<SQView>(t, '/squadro');
  const { host, guest } = await f.startedRoom();
  const actor = () => (host.game.currentPlayerId === host.id ? [host, guest] : [guest, host]) as [C, C];
  const [a, b] = actor();
  await b.fails('game:action', { type: 'move', lane: 0 });
  await a.fails('game:action', { type: 'move', lane: 5 });
  await a.fails('game:action', { type: 'move', lane: '1' });
  assert.equal(a.game.previews.length, 5);
  assert.equal(b.game.previews.length, 0);
  for (let i = 0; i < 600 && host.game.status === 'playing'; i++) {
    const [mover, watcher] = actor();
    const lane = mover.game.previews.findIndex(Boolean);
    const revision = mover.game.revision;
    await mover.success('game:action', { type: 'move', lane });
    await watcher.waitFor(s => (s.room?.game?.revision ?? 0) > revision);
    await mover.waitFor(s => (s.room?.game?.revision ?? 0) > revision);
  }
  assert.equal(host.game.status, 'finished');
  assert.equal(host.game.homeCount[host.game.winnerId!], 4);
  await host.success('game:ready');
  await guest.success('game:ready');
  await host.waitFor(s => s.room?.game?.turn === 1);
});
