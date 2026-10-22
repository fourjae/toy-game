import assert from 'node:assert/strict';
import test from 'node:test';
import { ACTIONS, type HMView } from '../shared/hanamikoji.ts';
import { duelFixture, roomLifecycleTests, type DuelClient } from './helpers/duelClient.ts';

roomLifecycleTests(test, 'hanamikoji', '/hanamikoji');

type C = DuelClient<HMView>;

/** Whoever must act does the first legal thing; picks take option 0. */
async function step(host: C, guest: C) {
  const actor = [host, guest].find(c => c.game.mustChoose || (!c.game.pending && c.game.currentPlayerId === c.id && c.game.status === 'playing'))!;
  const watcher = actor === host ? guest : host;
  const view = actor.game;
  const revision = view.revision;
  if (view.mustChoose) await actor.success('game:action', { type: 'choose', index: 0 });
  else {
    const kind = ACTIONS.find(k => !view.used[actor.id]![k])!;
    const ids = view.hand.map(c => c.id);
    await actor.success('game:action', kind === 'competition'
      ? { type: kind, groups: [ids.slice(0, 2), ids.slice(2, 4)] }
      : { type: kind, cardIds: ids.slice(0, kind === 'secret' ? 1 : kind === 'tradeoff' ? 2 : 3) });
  }
  await watcher.waitFor(s => (s.room?.game?.revision ?? 0) > revision);
  await actor.waitFor(s => (s.room?.game?.revision ?? 0) > revision);
}

test('hanamikoji: hidden hands, turn order and the gift pick are enforced by the server', async t => {
  const f = await duelFixture<HMView>(t, '/hanamikoji');
  const { host, guest } = await f.startedRoom();
  const [mover, other] = host.game.currentPlayerId === host.id ? [host, guest] : [guest, host];
  assert.equal(mover.game.hand.length, 7);
  assert.equal(other.game.hand.length, 6);
  assert.equal(other.game.opponentHandCount, 7);
  const text = JSON.stringify(other.state);
  for (const card of mover.game.hand) assert.ok(!text.includes(`"${card.id}"`), 'mover hand leaked');
  await other.fails('game:action', { type: 'secret', cardIds: [other.game.hand[0]!.id] });
  await mover.fails('game:action', { type: 'secret', cardIds: [] });
  await mover.fails('game:action', { type: 'dance' });
  await mover.success('game:action', { type: 'gift', cardIds: mover.game.hand.slice(0, 3).map(c => c.id) });
  await other.waitFor(s => s.room?.game?.mustChoose === true);
  await mover.fails('game:action', { type: 'choose', index: 0 });
  await other.fails('game:action', { type: 'choose', index: 5 });
  await other.success('game:action', { type: 'choose', index: 2 });
  const after = await other.waitFor(s => s.room?.game?.pending === null);
  assert.equal(after.room!.game!.currentPlayerId, other.id);
  assert.equal(after.room!.game!.placed[other.id]!.flat().length, 1);
});

test('hanamikoji: rounds play out, both vote for the next round, and the match ends', async t => {
  const f = await duelFixture<HMView>(t, '/hanamikoji');
  const { host, guest } = await f.startedRoom();
  for (let round = 1; round <= 10; round++) {
    for (let i = 0; i < 20 && host.game.status === 'playing'; i++) await step(host, guest);
    const status = (await guest.waitFor(s => s.room?.game?.status !== 'playing')).room!.game!.status;
    if (status === 'finished') break;
    await host.success('game:ready');
    await host.fails('game:action', { type: 'choose', index: 0 });
    await guest.success('game:ready');
    await host.waitFor(s => s.room?.game?.round === round + 1);
    assert.equal(host.game.results.length, round);
  }
  const final = host.game;
  if (final.status === 'finished') {
    assert.ok(final.winnerId);
    await host.success('game:ready');
    await guest.success('game:ready');
    const rematch = await host.waitFor(s => s.room?.game?.round === 1 && s.room.game.status === 'playing');
    assert.deepEqual(rematch.room!.game!.favor, Array(7).fill(null));
  }
});
