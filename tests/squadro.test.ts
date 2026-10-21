import assert from 'node:assert/strict';
import test from 'node:test';
import { applySquadroAction, createSquadro, EDGE, getSquadroView, previewMove, speedOf, squareOf, type SQState } from '../shared/squadro.ts';
import { RuleError } from '../shared/duel.ts';

/** a is seat 0 (columns), b is seat 1 (rows); a moves first. */
function fresh(): SQState {
  const s = createSquadro(['a', 'b'], () => 0.3);
  s.currentPlayerId = 'a';
  return s;
}

test('speeds: 1-3-2-3-1 out for seat 0, the reverse for seat 1, and out + back = 4', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map(l => speedOf(0, l, false)), [1, 3, 2, 3, 1]);
  assert.deepEqual([0, 1, 2, 3, 4].map(l => speedOf(1, l, false)), [3, 1, 2, 1, 3]);
  for (const seat of [0, 1]) for (let l = 0; l < 5; l++) assert.equal(speedOf(seat, l, false) + speedOf(seat, l, true), 4);
});

test('squares: the two sets of tracks cross on the middle 5x5', () => {
  assert.deepEqual(squareOf(0, 0, 0), { x: 1, y: 6 });
  assert.deepEqual(squareOf(0, 0, 6), { x: 1, y: 0 });
  assert.deepEqual(squareOf(1, 4, 0), { x: 0, y: 5 });
});

test('a plain move goes its speed and the turn passes', () => {
  let s = fresh();
  s = applySquadroAction(s, 'a', { type: 'move', lane: 1 });
  assert.equal(s.pieces.a![1]!.pos, 3);
  assert.equal(s.currentPlayerId, 'b');
  assert.throws(() => applySquadroAction(s, 'a', { type: 'move', lane: 0 }), RuleError);
  assert.throws(() => applySquadroAction(s, 'b', { type: 'move', lane: 7 }), RuleError);
});

test('reaching the far edge stops the piece and turns it around; steps left over are lost', () => {
  const s = fresh();
  s.pieces.a![1] = { pos: 4, returning: false, done: false };
  const next = applySquadroAction(s, 'a', { type: 'move', lane: 1 });
  assert.deepEqual(next.pieces.a![1], { pos: EDGE, returning: true, done: false });
  // Lane 1 now comes back at speed 1.
  next.currentPlayerId = 'a';
  assert.equal(applySquadroAction(next, 'a', { type: 'move', lane: 1 }).pieces.a![1]!.pos, 5);
});

test('jumping: the mover hops a run of pieces, stops right after, and they go back to their last edge', () => {
  const s = fresh();
  // a lane 2 (column x=3) at pos 0, speed 2. b pieces on its squares pos 1 (y=5 → b lane 4) and pos 2 (y=4 → b lane 3).
  s.pieces.b![4] = { pos: 3, returning: false, done: false };
  s.pieces.b![3] = { pos: 3, returning: true, done: false };
  const preview = previewMove(s, 'a', 2)!;
  assert.deepEqual(preview.sent.sort(), [3, 4]);
  assert.equal(preview.to.pos, 3);
  const next = applySquadroAction(s, 'a', { type: 'move', lane: 2 });
  assert.equal(next.pieces.a![2]!.pos, 3, 'stops on the first free square after the run');
  assert.equal(next.pieces.b![4]!.pos, 0, 'outward piece goes back to its start');
  assert.equal(next.pieces.b![3]!.pos, EDGE, 'returning piece goes back to the turn-around edge');
  assert.equal(next.pieces.b![3]!.returning, true);
  assert.equal(next.lastMove!.sent.length, 2);
});

test('a jump ends the move even with steps left', () => {
  const s = fresh();
  // a lane 1 (x=2) speed 3; b lane 4 piece at pos 2 sits on a's pos 1.
  s.pieces.b![4] = { pos: 2, returning: false, done: false };
  const next = applySquadroAction(s, 'a', { type: 'move', lane: 1 });
  assert.equal(next.pieces.a![1]!.pos, 2);
  assert.equal(next.pieces.b![4]!.pos, 0);
});

test('coming home removes the piece; four home wins', () => {
  const s = fresh();
  for (let l = 0; l < 3; l++) s.pieces.a![l] = { pos: 0, returning: true, done: true };
  s.pieces.a![3] = { pos: 1, returning: true, done: false };
  const next = applySquadroAction(s, 'a', { type: 'move', lane: 3 });
  assert.equal(next.pieces.a![3]!.done, true);
  assert.equal(next.status, 'finished');
  assert.equal(next.winnerId, 'a');
  assert.throws(() => applySquadroAction(next, 'b', { type: 'move', lane: 0 }), RuleError);
  const done = fresh();
  done.pieces.a![0] = { pos: 0, returning: true, done: true };
  assert.throws(() => applySquadroAction(done, 'a', { type: 'move', lane: 0 }), /돌아온/u);
});

test('automatic play always finishes, and previews match real moves', () => {
  let s = createSquadro(['a', 'b'], () => 0.7);
  for (let i = 0; i < 2000 && s.status === 'playing'; i++) {
    const me = s.currentPlayerId;
    const view = getSquadroView(s, me);
    const lane = view.previews.findIndex((p, k) => p && (i + k) % 3 !== 0) >= 0 ? view.previews.findIndex((p, k) => p && (i + k) % 3 !== 0) : view.previews.findIndex(Boolean);
    const expected = view.previews[lane]!;
    s = applySquadroAction(s, me, { type: 'move', lane });
    assert.deepEqual(s.pieces[me]![lane], expected.to);
  }
  assert.equal(s.status, 'finished');
  assert.ok(s.winnerId);
});
