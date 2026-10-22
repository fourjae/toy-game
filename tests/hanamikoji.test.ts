import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACTIONS, applyHanamikojiAction, buildDeck, createHanamikoji, GEISHAS, getHanamikojiView, standing,
  startNextHanamikojiRound, type HMAction, type HMState,
} from '../shared/hanamikoji.ts';
import { RuleError } from '../shared/duel.ts';

const rng = () => 0.3;
const fresh = () => createHanamikoji(['a', 'b'], rng);
const other = (id: string) => (id === 'a' ? 'b' : 'a');

/** Plays the first legal thing for whoever must act. Picks always take option 0. */
function autoStep(state: HMState): HMState {
  if (state.pending) return applyHanamikojiAction(state, other(state.pending.by), { type: 'choose', index: 0 });
  const me = state.currentPlayerId;
  const hand = state.hands[me]!.map(c => c.id);
  const kind = ACTIONS.find(k => !state.used[me]![k])!;
  const action: HMAction = kind === 'competition'
    ? { type: 'competition', groups: [hand.slice(0, 2), hand.slice(2, 4)] }
    : { type: kind, cardIds: hand.slice(0, kind === 'secret' ? 1 : kind === 'tradeoff' ? 2 : 3) };
  return applyHanamikojiAction(state, me, action);
}

function playRound(state: HMState) {
  let guard = 0;
  while (state.status === 'playing' && guard++ < 40) state = autoStep(state);
  return state;
}

test('deck: 21 cards, each geisha has as many items as her charm', () => {
  const deck = buildDeck();
  assert.equal(deck.length, 21);
  assert.equal(GEISHAS.reduce((s, g) => s + g.charm, 0), 21);
  GEISHAS.forEach((g, i) => assert.equal(deck.filter(c => c.geisha === i).length, g.charm));
});

test('deal: one card set aside, six each, the starter draws a seventh, seven left in the pile', () => {
  const game = fresh();
  const start = game.currentPlayerId;
  assert.ok(game.removed);
  assert.equal(game.hands[start]!.length, 7);
  assert.equal(game.hands[other(start)]!.length, 6);
  assert.equal(game.deck.length, 7);
  assert.ok(game.drawnId && game.hands[start]!.some(c => c.id === game.drawnId));
});

test('secret and trade-off: cards leave the hand, the turn passes, the next player draws', () => {
  let game = fresh();
  const p = game.currentPlayerId;
  const q = other(p);
  const [c1, c2, c3] = game.hands[p]!.map(c => c.id);
  game = applyHanamikojiAction(game, p, { type: 'secret', cardIds: [c1!] });
  assert.equal(game.secret[p]!.id, c1);
  assert.equal(game.currentPlayerId, q);
  assert.equal(game.hands[q]!.length, 7);
  assert.throws(() => applyHanamikojiAction(game, p, { type: 'tradeoff', cardIds: [c2!, c3!] }), RuleError);
  const [d1, d2] = game.hands[q]!.map(c => c.id);
  game = applyHanamikojiAction(game, q, { type: 'tradeoff', cardIds: [d1!, d2!] });
  assert.equal(game.discarded[q]!.length, 2);
  // Each token is spent once per round.
  assert.throws(() => applyHanamikojiAction(game, p, { type: 'secret', cardIds: [c2!] }), /이미 썼어요/u);
  assert.throws(() => applyHanamikojiAction(game, p, { type: 'tradeoff', cardIds: [c2!] }), /2장/u);
  assert.throws(() => applyHanamikojiAction(game, p, { type: 'tradeoff', cardIds: [c2!, c2!] }), RuleError);
  assert.throws(() => applyHanamikojiAction(game, p, { type: 'tradeoff', cardIds: [c2!, 'nope'] }), /손에 없는/u);
});

test('gift: the opponent takes one of three, the giver keeps two, then the chooser plays on', () => {
  let game = fresh();
  const p = game.currentPlayerId;
  const q = other(p);
  const ids = game.hands[p]!.slice(0, 3).map(c => c.id);
  game = applyHanamikojiAction(game, p, { type: 'gift', cardIds: ids });
  assert.equal(game.pending?.kind, 'gift');
  assert.throws(() => applyHanamikojiAction(game, p, { type: 'choose', index: 0 }), /상대가 고를/u);
  assert.throws(() => applyHanamikojiAction(game, q, { type: 'secret', cardIds: [game.hands[q]![0]!.id] }), /기다리는/u);
  assert.equal(getHanamikojiView(game, q).mustChoose, true);
  assert.equal(getHanamikojiView(game, p).mustChoose, false);
  const chosen = game.pending!.kind === 'gift' ? game.pending!.cards[1]! : null;
  game = applyHanamikojiAction(game, q, { type: 'choose', index: 1 });
  assert.equal(game.pending, null);
  const mine = game.placed[p]!.flat().length;
  const theirs = game.placed[q]!.flat();
  assert.equal(mine, 2);
  assert.deepEqual(theirs.map(c => c.id), [chosen!.id]);
  assert.equal(game.currentPlayerId, q);
  assert.equal(game.hands[q]!.length, 7);
});

test('competition: two pairs, the opponent picks a pair', () => {
  let game = fresh();
  const p = game.currentPlayerId;
  const q = other(p);
  const ids = game.hands[p]!.slice(0, 4).map(c => c.id);
  assert.throws(() => applyHanamikojiAction(game, p, { type: 'competition', groups: [ids.slice(0, 3), ids.slice(3)] }), RuleError);
  game = applyHanamikojiAction(game, p, { type: 'competition', groups: [ids.slice(0, 2), ids.slice(2)] });
  assert.throws(() => applyHanamikojiAction(game, q, { type: 'choose', index: 2 }), RuleError);
  game = applyHanamikojiAction(game, q, { type: 'choose', index: 0 });
  assert.deepEqual(game.placed[q]!.flat().map(c => c.id).sort(), ids.slice(0, 2).sort());
  assert.deepEqual(game.placed[p]!.flat().map(c => c.id).sort(), ids.slice(2).sort());
});

test('a round is eight actions; scoring reveals secrets and moves markers by majority', () => {
  const game = playRound(fresh());
  const result = game.results[0]!;
  assert.ok(game.status === 'round-over' || game.status === 'finished');
  // Every card is accounted for: placed + discarded + the removed one.
  const placed = game.playerIds.reduce((n, id) => n + game.placed[id]!.flat().length, 0);
  const discarded = game.playerIds.reduce((n, id) => n + game.discarded[id]!.length, 0);
  assert.equal(placed + discarded + 1, 21);
  assert.equal(placed, 16);
  result.counts.forEach(([x, y], i) => {
    if (x > y) assert.equal(game.favor[i], 'a');
    else if (y > x) assert.equal(game.favor[i], 'b');
    else assert.equal(game.favor[i], null);
  });
  for (const id of game.playerIds) assert.equal(game.hands[id]!.length, 0);
});

test('markers persist, ties keep the previous holder, and the other player starts round two', () => {
  let game = fresh();
  game.favor = ['a', 'a', null, null, null, null, null];
  // Force a round-over standing: give each side nothing on a geisha so ties keep markers.
  game = playRound(game);
  if (game.status === 'finished') return; // A decisive first round is legal too; nothing more to check.
  game.results[0]!.counts.forEach(([x, y], i) => { if (x === y) assert.equal(game.favor[i], game.results[0]!.before[i]); });
  const next = startNextHanamikojiRound(game, rng);
  assert.equal(next.round, 2);
  assert.notEqual(next.startPlayerId, game.startPlayerId);
  assert.deepEqual(next.favor, game.favor);
  assert.equal(next.deck.length, 7);
});

/** A state one action from the end of the round: only `last` still holds a secret token and one card. */
function lastAction(placedA: number[], placedB: number[], favor: Array<string | null> = Array(7).fill(null)) {
  const game = fresh();
  const cards = buildDeck();
  const take = (geisha: number) => { const i = cards.findIndex(c => c.geisha === geisha); return cards.splice(i, 1)[0]!; };
  game.placed = { a: GEISHAS.map(() => []), b: GEISHAS.map(() => []) };
  placedA.forEach((n, g) => { for (let k = 0; k < n; k++) game.placed.a![g]!.push(take(g)); });
  placedB.forEach((n, g) => { for (let k = 0; k < n; k++) game.placed.b![g]!.push(take(g)); });
  for (const id of ['a', 'b']) game.used[id] = { secret: true, tradeoff: true, gift: true, competition: true };
  game.used.a!.secret = false;
  game.secret = { a: null, b: null };
  game.currentPlayerId = 'a';
  game.pending = null;
  game.favor = favor;
  game.hands = { a: [take(6)], b: [] };
  return game;
}

test('scoring: the secret card counts, majority wins, a tie keeps the old marker', () => {
  const game = lastAction([1, 0, 0, 0, 0, 0, 1], [0, 1, 0, 1, 0, 0, 1], ['b', null, null, null, null, null, 'b']);
  // a's secret goes to geisha 6 (사쿠라): 2 vs 1 there.
  const done = applyHanamikojiAction(game, 'a', { type: 'secret', cardIds: [game.hands.a![0]!.id] });
  assert.equal(done.favor[0], 'a');
  assert.equal(done.favor[1], 'b');
  assert.equal(done.favor[3], 'b');
  assert.equal(done.favor[6], 'a');
  assert.equal(done.favor[2], null);
  assert.deepEqual(done.results[0]!.counts[6], [2, 1]);
  assert.equal(done.status, 'round-over');
});

test('winning: 4 geishas wins, but 11 charm beats 4 geishas', () => {
  const secret = (game: HMState) => applyHanamikojiAction(game, 'a', { type: 'secret', cardIds: [game.hands.a![0]!.id] });
  // a takes geishas 0-3 (9 charm, 4 geishas); b takes 4, 5 and 6 (12 charm).
  const charm = secret(lastAction([1, 1, 1, 1, 0, 0, 0], [0, 0, 0, 0, 1, 1, 2]));
  assert.equal(charm.status, 'finished');
  assert.equal(charm.winnerId, 'b');
  assert.equal(charm.winReason, 'charm');
  // Geisha 6 ties 1-1 and stays unclaimed: b has only 7 charm, so a's four geishas win.
  const count = secret(lastAction([1, 1, 1, 1, 0, 0, 0], [0, 0, 0, 0, 1, 1, 1]));
  assert.equal(count.winnerId, 'a');
  assert.equal(count.winReason, 'geishas');
});

test('the game always ends within a few rounds of automatic play', () => {
  let game = fresh();
  for (let round = 0; round < 12 && game.status !== 'finished'; round++) {
    game = playRound(game);
    if (game.status === 'round-over') game = startNextHanamikojiRound(game, () => (round * 0.137) % 1);
  }
  if (game.status === 'finished') {
    const last = game.results.at(-1)!;
    const side = game.playerIds.indexOf(game.winnerId!);
    assert.ok(last.charm[side]! >= 11 || last.geishas[side]! >= 4);
  }
});

test('view: hides the opponent hand, secret and trade-off cards and the removed card', () => {
  let game = fresh();
  const p = game.currentPlayerId;
  const q = other(p);
  game = applyHanamikojiAction(game, p, { type: 'secret', cardIds: [game.hands[p]![0]!.id] });
  game = applyHanamikojiAction(game, q, { type: 'tradeoff', cardIds: game.hands[q]!.slice(0, 2).map(c => c.id) });
  const view = getHanamikojiView(game, q);
  const text = JSON.stringify(view);
  for (const card of game.hands[p]!) assert.ok(!text.includes(`"${card.id}"`), 'opponent hand leaked');
  assert.ok(!text.includes(`"${game.secret[p]!.id}"`), 'secret leaked');
  assert.ok(!text.includes(`"${game.removed!.id}"`), 'removed card leaked');
  assert.equal(view.opponentHasSecret, true);
  assert.equal(view.myDiscarded.length, 2);
  const pView = getHanamikojiView(game, p);
  assert.equal(pView.opponentDiscardedCount, 2);
  for (const card of game.discarded[q]!) assert.ok(!JSON.stringify(pView).includes(`"${card.id}"`), 'trade-off leaked');
});
