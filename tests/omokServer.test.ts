import assert from 'node:assert/strict';
import test from 'node:test';
import { SIZE, type OMView } from '../shared/omok.ts';
import { duelFixture, roomLifecycleTests, type DuelClient } from './helpers/duelClient.ts';

roomLifecycleTests(test, 'omok', '/omok');

type C = DuelClient<OMView>;
const at = (x: number, y: number) => y * SIZE + x;

test('omok: turn order and payload checks, then a five-in-a-row win and a rematch', async t => {
  const f = await duelFixture<OMView>(t, '/omok');
  const { host, guest } = await f.startedRoom();
  const bySeat = () => (host.game.currentPlayerId === host.id ? [host, guest] : [guest, host]) as [C, C];
  const [black, white] = bySeat();
  assert.equal(black.game.blackId, black.id);
  await white.fails('game:action', { type: 'place', cell: at(0, 0) });
  await black.fails('game:action', { type: 'place', cell: 225 });
  await black.fails('game:action', { type: 'place', cell: -1 });
  await black.fails('game:action', { type: 'place', cell: '3' });
  await black.fails('game:action', { type: 'place', cell: 1.5 });
  await black.fails('game:action', { type: 'pass' });
  const play = async (mover: C, watcher: C, x: number, y: number) => {
    const revision = mover.game.revision;
    await mover.success('game:action', { type: 'place', cell: at(x, y) });
    await watcher.waitFor(s => (s.room?.game?.revision ?? 0) > revision);
    await mover.waitFor(s => (s.room?.game?.revision ?? 0) > revision);
  };
  // Black fills row 7; white answers on row 0 with gaps so it never gets near five.
  for (let i = 0; i < 5; i++) {
    await play(black, white, 3 + i, 7);
    if (i < 4) {
      await play(white, black, i * 2, 0);
      // The same crossing twice is refused.
      await black.fails('game:action', { type: 'place', cell: at(0, 0) });
    }
  }
  assert.equal(white.game.status, 'finished');
  assert.equal(white.game.winnerId, black.id);
  assert.equal(white.game.winLine.length, 5);
  await white.fails('game:action', { type: 'place', cell: at(10, 10) });
  await host.success('game:ready');
  await guest.success('game:ready');
  await host.waitFor(s => s.room?.game?.moveCount === 0);
  assert.equal(host.game.status, 'playing');
});

test('omok: the renju option is validated, can be changed in the waiting room, and reaches the game', async t => {
  const f = await duelFixture<OMView>(t, '/omok');
  const { client: host } = await f.player('민수');
  const { client: guest } = await f.player('지수');
  await host.fails('rooms:create', { options: { renju: 'yes' } });
  await host.fails('rooms:create', { options: 3 });
  await host.success('rooms:create', { title: '한 판', options: { renju: false } });
  const code = (await host.waitFor(s => s.room !== null)).room!.code;
  await guest.success('rooms:join', { code });
  await guest.fails('rooms:options', { options: { renju: true } });
  await host.fails('rooms:options', { options: {} });
  await host.success('rooms:options', { options: { renju: true } });
  await guest.waitFor(s => (s.room?.options as { renju: boolean } | undefined)?.renju === true);
  await host.success('game:start');
  await host.waitFor(s => s.room?.phase === 'playing');
  await guest.waitFor(s => s.room?.phase === 'playing');
  await host.fails('rooms:options', { options: { renju: false } });
  const [black, white] = (host.game.currentPlayerId === host.id ? [host, guest] : [guest, host]) as [C, C];
  assert.equal(black.game.renju, true);
  // Black builds two open threes that meet at (7,7); the server must refuse the move that joins them
  // and tell only black where the forbidden points are.
  const moves: Array<[C, number, number]> = [
    [black, 5, 7], [white, 0, 0], [black, 6, 7], [white, 2, 0], [black, 7, 5], [white, 4, 0], [black, 7, 6], [white, 6, 0],
  ];
  for (const [who, x, y] of moves) {
    const revision = host.game.revision;
    await who.success('game:action', { type: 'place', cell: at(x, y) });
    await host.waitFor(s => (s.room?.game?.revision ?? 0) > revision);
    await guest.waitFor(s => (s.room?.game?.revision ?? 0) > revision);
  }
  await black.waitFor(s => s.room?.game?.forbidden.some(p => p.cell === at(7, 7)) === true);
  assert.equal(white.game.forbidden.length, 0, 'white is never told');
  const refused = await black.fails('game:action', { type: 'place', cell: at(7, 7) });
  assert.match(JSON.stringify(refused), /3-3/);
  await black.success('game:action', { type: 'place', cell: at(9, 9) });
});
