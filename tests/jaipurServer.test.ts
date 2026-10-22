import assert from 'node:assert/strict';
import test from 'node:test';
import type { JPCard, JPView } from '../shared/jaipur.ts';
import { duelFixture, roomLifecycleTests, type DuelClient } from './helpers/duelClient.ts';

roomLifecycleTests(test, 'jaipur', '/jaipur');

type C = DuelClient<JPView>;
const precious = new Set(['diamond', 'gold', 'silver']);

/** Sell when a pile of one kind is sellable, otherwise take a good, otherwise camels. */
function pick(view: JPView): object {
  const groups = new Map<string, JPCard[]>();
  for (const c of view.hand) groups.set(c.kind, [...(groups.get(c.kind) ?? []), c]);
  const sell = [...groups.values()].find(cs => cs.length >= (precious.has(cs[0]!.kind) ? 2 : 1));
  const good = view.market.find(c => c.kind !== 'camel');
  if (sell && (view.hand.length >= 4 || !good)) return { type: 'sell', cardIds: sell.map(c => c.id) };
  if (good && view.hand.length < 7) return { type: 'take', marketId: good.id };
  if (view.market.some(c => c.kind === 'camel')) return { type: 'camels' };
  return { type: 'sell', cardIds: (sell ?? [view.hand[0]!]).map(c => c.id) };
}

test('jaipur: hidden hands, checks, and a whole match to two seals with a next-round vote', async t => {
  const f = await duelFixture<JPView>(t, '/jaipur');
  const { host, guest } = await f.startedRoom();
  const actor = () => (host.game.currentPlayerId === host.id ? [host, guest] : [guest, host]) as [C, C];
  const [a, b] = actor();
  assert.equal(b.game.opponentHandCount, a.game.hand.length);
  for (const c of a.game.hand) assert.ok(!JSON.stringify(b.state).includes(`"${c.id}"`));
  await b.fails('game:action', { type: 'camels' });
  await a.fails('game:action', { type: 'take', marketId: 'nope' });
  await a.fails('game:action', { type: 'exchange', marketIds: ['x'], handIds: [], camels: 0 });
  for (let i = 0; i < 1500 && host.game.status !== 'finished'; i++) {
    if (host.game.status === 'round-over') {
      const round = host.game.round;
      await host.success('game:ready');
      await guest.success('game:ready');
      await host.waitFor(s => s.room?.game?.round === round + 1);
      await guest.waitFor(s => s.room?.game?.round === round + 1);
      continue;
    }
    const [mover, watcher] = actor();
    const revision = mover.game.revision;
    const result = await mover.emit('game:action', pick(mover.game));
    if (!result.ok) await mover.success('game:action', mover.game.market.some(c => c.kind === 'camel') ? { type: 'camels' } : { type: 'take', marketId: mover.game.market[0]!.id });
    await watcher.waitFor(s => (s.room?.game?.revision ?? 0) > revision);
    await mover.waitFor(s => (s.room?.game?.revision ?? 0) > revision);
  }
  assert.equal(host.game.status, 'finished');
  assert.equal(host.game.seals[host.game.winnerId!], 2);
});
