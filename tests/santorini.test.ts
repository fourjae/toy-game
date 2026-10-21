import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applySantoriniAction, buildTargets, createSantorini, getSantoriniView, moveTargets, neighbours, SUPPLY,
  type STState,
} from '../shared/santorini.ts';
import { RuleError } from '../shared/duel.ts';

const fresh = () => createSantorini(['a', 'b'], () => 0.3);
const other = (id: string) => (id === 'a' ? 'b' : 'a');

/** a's workers on 0 and 4, b's on 20 and 24, a to move. */
function placed(): STState {
  let s = fresh();
  const p = s.currentPlayerId;
  const q = other(p);
  s = applySantoriniAction(s, p, { type: 'place', cell: 0 });
  s = applySantoriniAction(s, p, { type: 'place', cell: 4 });
  s = applySantoriniAction(s, q, { type: 'place', cell: 20 });
  s = applySantoriniAction(s, q, { type: 'place', cell: 24 });
  // Rename seats so tests can talk about a and b.
  return p === 'a' ? s : swap(s);
}
function swap(s: STState): STState {
  return { ...s, workers: { a: s.workers.b!, b: s.workers.a! }, currentPlayerId: 'a', firstPlayerId: 'a' };
}

test('neighbours: corners have 3, edges 5, the middle 8', () => {
  assert.equal(neighbours(0).length, 3);
  assert.equal(neighbours(2).length, 5);
  assert.equal(neighbours(12).length, 8);
});

test('placement: the first player places both workers, then the second, then the first moves', () => {
  let s = fresh();
  const p = s.currentPlayerId;
  const q = other(p);
  s = applySantoriniAction(s, p, { type: 'place', cell: 6 });
  assert.equal(s.currentPlayerId, p);
  assert.throws(() => applySantoriniAction(s, p, { type: 'place', cell: 6 }), RuleError);
  s = applySantoriniAction(s, p, { type: 'place', cell: 7 });
  assert.equal(s.currentPlayerId, q);
  assert.throws(() => applySantoriniAction(s, q, { type: 'move', worker: 0, to: 1 }), /놓아/u);
  s = applySantoriniAction(s, q, { type: 'place', cell: 12 });
  s = applySantoriniAction(s, q, { type: 'place', cell: 18 });
  assert.equal(s.phase, 'move');
  assert.equal(s.currentPlayerId, p);
  assert.throws(() => applySantoriniAction(s, p, { type: 'place', cell: 0 }), RuleError);
});

test('a turn is move then build next to the moved worker', () => {
  let s = placed();
  assert.throws(() => applySantoriniAction(s, 'a', { type: 'build', cell: 1 }), /움직여/u);
  assert.throws(() => applySantoriniAction(s, 'a', { type: 'move', worker: 0, to: 2 }), RuleError);
  s = applySantoriniAction(s, 'a', { type: 'move', worker: 0, to: 6 });
  assert.equal(s.phase, 'build');
  assert.throws(() => applySantoriniAction(s, 'a', { type: 'move', worker: 1, to: 3 }), RuleError);
  // 3 is next to the other worker, not the one that moved.
  assert.throws(() => applySantoriniAction(s, 'a', { type: 'build', cell: 3 }), /옆/u);
  assert.throws(() => applySantoriniAction(s, 'a', { type: 'build', cell: 6 }), RuleError);
  s = applySantoriniAction(s, 'a', { type: 'build', cell: 7 });
  assert.equal(s.levels[7], 1);
  assert.equal(s.supply[1], SUPPLY[1] - 1);
  assert.equal(s.currentPlayerId, 'b');
  assert.equal(s.phase, 'move');
});

test('climbing: up one level at most, down any number, domes block', () => {
  const s = placed();
  s.levels[1] = 2; s.levels[5] = 1; s.levels[6] = 3;
  s.domes[5] = false;
  assert.deepEqual(moveTargets(s, 0).sort(), [5]);
  s.levels[0] = 3;
  assert.deepEqual(moveTargets(s, 0).sort((x, y) => x - y), [1, 5, 6]);
  s.domes[6] = true;
  assert.deepEqual(moveTargets(s, 0).sort((x, y) => x - y), [1, 5]);
});

test('building: levels 0-2 get a block, level 3 gets a dome, domed cells are closed', () => {
  let s = placed();
  s.levels[1] = 3;
  s = applySantoriniAction(s, 'a', { type: 'move', worker: 0, to: 5 });
  s = applySantoriniAction(s, 'a', { type: 'build', cell: 1 });
  assert.equal(s.domes[1], true);
  assert.equal(s.levels[1], 3);
  assert.equal(s.supply.dome, SUPPLY.dome - 1);
  assert.ok(!buildTargets(s, 0).includes(1));
});

test('stepping up onto level 3 wins at once', () => {
  let s = placed();
  s.levels[0] = 2; s.levels[1] = 3;
  s = applySantoriniAction(s, 'a', { type: 'move', worker: 0, to: 1 });
  assert.equal(s.status, 'finished');
  assert.equal(s.winnerId, 'a');
  assert.equal(s.winReason, 'climb');
  assert.throws(() => applySantoriniAction(s, 'b', { type: 'move', worker: 0, to: 15 }), RuleError);
});

test('a player who cannot move on their turn loses', () => {
  let s = placed();
  // Box in both b workers: domes around 20 and 24 except the cells a will build on.
  for (const cell of [15, 16, 21, 19, 23]) s.domes[cell] = true;
  s.levels[18] = 3;
  s = applySantoriniAction(s, 'a', { type: 'move', worker: 1, to: 9 });
  s = applySantoriniAction(s, 'a', { type: 'build', cell: 14 });
  // b still has 18 (level 3 is too high from 0) — so b should be stuck.
  assert.equal(s.status, 'finished');
  assert.equal(s.winnerId, 'a');
  assert.equal(s.winReason, 'stuck');
});

test('a player who moves into a spot with nothing to build on loses (here: the level-1 blocks ran out)', () => {
  let s = placed();
  for (const cell of [2, 5, 6, 7]) s.domes[cell] = true;
  s.supply[1] = 0;
  s = applySantoriniAction(s, 'a', { type: 'move', worker: 0, to: 1 });
  assert.equal(s.status, 'finished');
  assert.equal(s.winnerId, 'b');
  assert.equal(s.winReason, 'no-build');
});

test('view: legal moves only on my turn; everything else is public', () => {
  const s = placed();
  const a = getSantoriniView(s, 'a');
  const b = getSantoriniView(s, 'b');
  assert.ok(a.myMoves.some(m => m.to.length));
  assert.deepEqual(b.myMoves, []);
  assert.deepEqual(a.levels, b.levels);
});
