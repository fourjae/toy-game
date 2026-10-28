import assert from 'node:assert/strict';
import test from 'node:test';
import { applyOmokAction, BLACK, CELLS, createOmok, forbiddenReason, getOmokView, SIZE, WHITE, type OMState } from '../shared/omok.ts';
import { RuleError } from '../shared/duel.ts';

const at = (x: number, y: number) => y * SIZE + x;
/** a is black (rng 0 picks the first id) and moves first. */
function fresh(renju = false): OMState {
  return createOmok(['a', 'b'], () => 0, { renju });
}
const place = (s: OMState, who: string, x: number, y: number) => applyOmokAction(s, who, { type: 'place', cell: at(x, y) });
/** Puts stones straight on the board, for setting up a position. */
function setup(s: OMState, black: Array<[number, number]>, white: Array<[number, number]> = []) {
  for (const [x, y] of black) s.stones[at(x, y)] = BLACK;
  for (const [x, y] of white) s.stones[at(x, y)] = WHITE;
  return s;
}
/** Plays black stones with white throwing away moves far from the action in the bottom rows. */
function play(s: OMState, blackMoves: Array<[number, number]>): OMState {
  let next = s;
  let filler = 0;
  for (const [x, y] of blackMoves) {
    next = place(next, 'a', x, y);
    if (next.status === 'finished') break;
    // Two white stones per row at most, so white never gets close to five.
    next = place(next, 'b', (filler % 7) * 2, 14 - Math.floor(filler / 7));
    filler++;
  }
  return next;
}

test('the board is 15x15, black is drawn from the rng and moves first', () => {
  assert.equal(CELLS, 225);
  const s = createOmok(['a', 'b'], () => 0.9);
  assert.equal(s.blackId, 'b');
  assert.equal(s.currentPlayerId, 'b');
  assert.equal(fresh().stones.filter(Boolean).length, 0);
});

test('turns alternate, and occupied, out-of-board or out-of-turn moves are refused', () => {
  let s = fresh();
  assert.throws(() => place(s, 'b', 7, 7), RuleError);
  s = place(s, 'a', 7, 7);
  assert.equal(s.stones[at(7, 7)], BLACK);
  assert.equal(s.currentPlayerId, 'b');
  assert.throws(() => place(s, 'a', 8, 8), RuleError);
  assert.throws(() => place(s, 'b', 7, 7), RuleError, 'occupied');
  assert.throws(() => applyOmokAction(s, 'b', { type: 'place', cell: CELLS }), RuleError);
  assert.throws(() => applyOmokAction(s, 'b', { type: 'place', cell: -1 }), RuleError);
  assert.throws(() => applyOmokAction(s, 'b', { type: 'place', cell: 1.5 }), RuleError);
  s = place(s, 'b', 8, 8);
  assert.equal(s.stones[at(8, 8)], WHITE);
  assert.equal(s.revision, 2);
  assert.equal(s.lastMove!.playerId, 'b');
});

test('applying a move never changes the previous state', () => {
  const s = fresh();
  const snapshot = structuredClone(s);
  place(s, 'a', 3, 3);
  assert.deepEqual(s, snapshot);
});

test('five in a row wins in each of the four directions, and the line is recorded', () => {
  const lines: Array<Array<[number, number]>> = [
    [[3, 5], [4, 5], [5, 5], [6, 5], [7, 5]],
    [[5, 3], [5, 4], [5, 5], [5, 6], [5, 7]],
    [[3, 3], [4, 4], [5, 5], [6, 6], [7, 7]],
    [[7, 3], [6, 4], [5, 5], [4, 6], [3, 7]],
  ];
  for (const line of lines) {
    const s = play(fresh(), line);
    assert.equal(s.status, 'finished', JSON.stringify(line));
    assert.equal(s.winnerId, 'a');
    assert.deepEqual([...s.winLine].sort((p, q) => p - q), line.map(([x, y]) => at(x, y)).sort((p, q) => p - q));
    assert.throws(() => place(s, 'b', 0, 0), RuleError, 'no moves after the end');
  }
});

test('four in a row does not win, and a gap breaks the line', () => {
  const s = play(fresh(), [[3, 5], [4, 5], [5, 5], [6, 5], [8, 5]]);
  assert.equal(s.status, 'playing');
  assert.equal(s.winnerId, null);
});

test('white can win too', () => {
  let s = fresh();
  const moves: Array<[string, number, number]> = [
    ['a', 0, 0], ['b', 5, 5], ['a', 2, 0], ['b', 5, 6], ['a', 4, 0], ['b', 5, 7], ['a', 6, 0], ['b', 5, 8], ['a', 8, 0], ['b', 5, 9],
  ];
  for (const [who, x, y] of moves) s = place(s, who, x, y);
  assert.equal(s.status, 'finished');
  assert.equal(s.winnerId, 'b');
});

test('free style: six or more in a row also wins for black', () => {
  const s = setup(fresh(), [[3, 5], [4, 5], [5, 5], [7, 5], [8, 5]]);
  const next = place(s, 'a', 6, 5);
  assert.equal(next.status, 'finished');
  assert.equal(next.winnerId, 'a');
  assert.equal(next.winLine.length, 6);
});

test('a full board with no five is a draw', () => {
  const s = fresh();
  // A pattern with no five anywhere: color by (x + 2*y) block parity pairs.
  for (let cell = 0; cell < CELLS - 1; cell++) {
    const x = cell % SIZE, y = Math.floor(cell / SIZE);
    s.stones[cell] = (Math.floor(x / 2) + y) % 2 === 0 ? BLACK : WHITE;
  }
  const blacks = s.stones.filter(v => v === BLACK).length;
  const whites = s.stones.filter(v => v === WHITE).length;
  s.moveCount = CELLS - 1;
  // The last crossing goes to whoever is to move; pick the color that cannot make five there.
  s.currentPlayerId = blacks > whites ? 'b' : 'a';
  const next = applyOmokAction(s, s.currentPlayerId, { type: 'place', cell: CELLS - 1 });
  assert.equal(next.status, 'finished');
  assert.equal(next.winnerId, null);
  assert.equal(next.moveCount, CELLS);
});

test('renju: black may not make an overline, but white may', () => {
  const s = setup(fresh(true), [[3, 5], [4, 5], [5, 5], [7, 5], [8, 5]]);
  assert.equal(forbiddenReason(s.stones, at(6, 5)), 'six');
  assert.throws(() => place(s, 'a', 6, 5), /금수/);
  const w = setup(fresh(true), [], [[3, 5], [4, 5], [5, 5], [7, 5], [8, 5]]);
  w.currentPlayerId = 'b';
  const next = place(w, 'b', 6, 5);
  assert.equal(next.winnerId, 'b');
});

test('renju: double-four is forbidden, a single four is fine', () => {
  // (5,8) would make a vertical four (5,5-5,8) and a horizontal four (2,8-5,8) at once.
  const t = setup(fresh(true), [[5, 5], [5, 6], [5, 7], [2, 8], [3, 8], [4, 8]]);
  assert.equal(forbiddenReason(t.stones, at(5, 8)), 'four-four');
  assert.throws(() => place(t, 'a', 5, 8), /4-4/);
  const single = setup(fresh(true), [[5, 4], [5, 5], [5, 6]]);
  assert.equal(forbiddenReason(single.stones, at(5, 7)), null);
  // A four with a gap in it counts as a four too.
  const split = setup(fresh(true), [[5, 3], [5, 4], [5, 6], [2, 7], [3, 7], [4, 7]]);
  assert.equal(forbiddenReason(split.stones, at(5, 7)), 'four-four');
});

test('renju: double-three is forbidden, but a three blocked on one end does not count', () => {
  // Two open threes crossing at (7,7): horizontal 5,6 and vertical 7,5/7,6... lay out with room around.
  const s = setup(fresh(true), [[5, 7], [6, 7], [7, 5], [7, 6]]);
  assert.equal(forbiddenReason(s.stones, at(7, 7)), 'three-three');
  assert.throws(() => place(s, 'a', 7, 7), /3-3/);
  // The same shape with white stones capping the horizontal three on both ends is only one three.
  const blocked = setup(fresh(true), [[5, 7], [6, 7], [7, 5], [7, 6]], [[4, 7]]);
  assert.equal(forbiddenReason(blocked.stones, at(7, 7)), null);
  // White can always play there.
  s.currentPlayerId = 'b';
  assert.equal(place(s, 'b', 7, 7).stones[at(7, 7)], WHITE);
});

test('renju: an exact five wins even on a point that would otherwise be forbidden', () => {
  const s = setup(fresh(true), [[3, 5], [4, 5], [5, 5], [6, 5], [7, 8], [7, 9], [7, 10], [7, 11]]);
  // (7,5) would finish five in a row and nothing else illegal.
  assert.equal(forbiddenReason(s.stones, at(7, 5)), null);
  assert.equal(place(s, 'a', 7, 5).winnerId, 'a');
});

test('renju: a three whose only open-four point is itself forbidden does not count', () => {
  // Two threes meet at (7,7). White at (3,7) leaves the horizontal one a single way to open four, (8,7).
  const stones: Array<[number, number]> = [[5, 7], [6, 7], [7, 5], [7, 6]];
  const control = setup(fresh(true), stones, [[3, 7]]);
  assert.equal(forbiddenReason(control.stones, at(7, 7)), 'three-three');
  // Black stones below (8,7) turn (8,7) into a double-four, so that three is not a real three.
  const s = setup(fresh(true), [...stones, [8, 8], [8, 9], [8, 10]], [[3, 7]]);
  // Seen from the board after black has put a stone on (7,7), (8,7) joins the row into a four and the column into a four.
  const afterSeven = [...s.stones];
  afterSeven[at(7, 7)] = BLACK;
  assert.equal(forbiddenReason(afterSeven, at(8, 7)), 'four-four');
  assert.equal(forbiddenReason(s.stones, at(7, 7)), null);
});

test('occupied crossings are never forbidden', () => {
  const s = setup(fresh(true), [[5, 7], [6, 7], [7, 5], [7, 6]]);
  assert.equal(forbiddenReason(s.stones, at(5, 7)), null);
});

test('free style never forbids anything, and the view lists forbidden points only for black in renju', () => {
  const s = setup(fresh(false), [[5, 7], [6, 7], [7, 5], [7, 6]]);
  assert.equal(getOmokView(s, 'a').forbidden.length, 0);
  assert.equal(place(s, 'a', 7, 7).status, 'playing');
  const r = setup(fresh(true), [[5, 7], [6, 7], [7, 5], [7, 6]]);
  const mine = getOmokView(r, 'a');
  assert.ok(mine.forbidden.some(f => f.cell === at(7, 7) && f.reason === 'three-three'));
  assert.equal(getOmokView(r, 'b').forbidden.length, 0, 'white sees none');
  r.currentPlayerId = 'b';
  assert.equal(getOmokView(r, 'a').forbidden.length, 0, 'not black\'s turn');
});

test('the view tells each player who they are and has the whole board', () => {
  const s = place(fresh(), 'a', 7, 7);
  const v = getOmokView(s, 'b');
  assert.equal(v.meId, 'b');
  assert.equal(v.opponentId, 'a');
  assert.equal(v.blackId, 'a');
  assert.equal(v.stones[at(7, 7)], BLACK);
  assert.equal(v.lastMove!.cell, at(7, 7));
  assert.match(v.log.at(-1)!.text, /H8/);
});
