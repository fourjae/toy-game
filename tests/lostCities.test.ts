import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyLostCitiesAction, canPlayOnExpedition, createLostCities, getLostCitiesView, legalDraws, scoreExpedition,
  startNextRound, buildDeck, matchTotals, scoreTotal, SITES, type LCCard, type LCState,
} from '../shared/lostCities.ts';

const card = (site: LCCard['site'], value: number, n = 1): LCCard => ({ id: value === 0 ? `${site}-h${n}` : `${site}-${value}`, site, value });
const rng = () => 0.3;
const fresh = (rounds = 3) => createLostCities(['a', 'b'], rng, rounds);

test('deck has 60 cards: 3 handshakes and 2-10 in each of five sites', () => {
  const deck = buildDeck();
  assert.equal(deck.length, 60);
  assert.equal(new Set(deck.map(c => c.id)).size, 60);
  for (const site of SITES) assert.equal(deck.filter(c => c.site === site).length, 12);
});

test('deal: eight cards each and a 44 card draw pile', () => {
  const game = fresh();
  assert.equal(game.hands.a!.length, 8);
  assert.equal(game.hands.b!.length, 8);
  assert.equal(game.deck.length, 44);
});

test('expedition order: handshakes first, then strictly ascending numbers', () => {
  assert.ok(canPlayOnExpedition([], card('egypt', 0)));
  assert.ok(canPlayOnExpedition([card('egypt', 0)], card('egypt', 0, 2)));
  assert.ok(canPlayOnExpedition([card('egypt', 0)], card('egypt', 2)));
  assert.ok(!canPlayOnExpedition([card('egypt', 5)], card('egypt', 0)));
  assert.ok(!canPlayOnExpedition([card('egypt', 5)], card('egypt', 5)));
  assert.ok(!canPlayOnExpedition([card('egypt', 5)], card('egypt', 3)));
  assert.ok(canPlayOnExpedition([card('egypt', 5)], card('egypt', 6)));
});

test('scoring: -20 start, handshake multipliers, 8 card bonus, untouched sites score 0', () => {
  assert.equal(scoreExpedition([]), 0);
  assert.equal(scoreExpedition([card('egypt', 2)]), -18);
  assert.equal(scoreExpedition([card('egypt', 0), card('egypt', 5)]), -30);
  // 40 points of cards, two handshakes: (40 - 20) * 3
  assert.equal(scoreExpedition([card('egypt', 0), card('egypt', 0, 2), card('egypt', 10), card('egypt', 9), card('egypt', 8), card('egypt', 7), card('egypt', 6)].sort((a, b) => a.value - b.value)), (40 - 20) * 3);
  const long = [2, 3, 4, 5, 6, 7, 8, 9].map(v => card('amazon', v));
  assert.equal(scoreExpedition(long), 44 - 20 + 20);
});

function withHand(game: LCState, id: string, cards: LCCard[]): LCState {
  const next = structuredClone(game);
  next.hands[id] = cards;
  return next;
}

test('a turn is play-or-discard then draw, and passes to the opponent', () => {
  let game = withHand(fresh(), fresh().currentPlayerId, [card('egypt', 4), card('amazon', 7)]);
  const me = game.currentPlayerId;
  const other = me === 'a' ? 'b' : 'a';
  assert.throws(() => applyLostCitiesAction(game, other, { type: 'discard', cardId: 'egypt-4' }), /차례/);
  assert.throws(() => applyLostCitiesAction(game, me, { type: 'draw', from: 'deck' }), /먼저/);
  game = applyLostCitiesAction(game, me, { type: 'play', cardId: 'egypt-4' });
  assert.equal(game.expeditions[me]!.egypt.length, 1);
  assert.throws(() => applyLostCitiesAction(game, me, { type: 'play', cardId: 'amazon-7' }), /뽑아/);
  game = applyLostCitiesAction(game, me, { type: 'draw', from: 'deck' });
  assert.equal(game.hands[me]!.length, 2);
  assert.equal(game.currentPlayerId, other);
  assert.equal(game.phase, 'play');
});

test('cannot lay a lower number, and cannot take back the card just discarded', () => {
  let game = withHand(fresh(), fresh().currentPlayerId, [card('egypt', 6), card('egypt', 3), card('amazon', 8)]);
  const me = game.currentPlayerId;
  game = applyLostCitiesAction(game, me, { type: 'play', cardId: 'egypt-6' });
  game = applyLostCitiesAction(game, me, { type: 'draw', from: 'deck' });
  const other = game.currentPlayerId;
  game.hands[me] = [card('egypt', 3), card('amazon', 8)];
  game = withHand(game, other, [card('himalaya', 2)]);
  game = applyLostCitiesAction(game, other, { type: 'discard', cardId: 'himalaya-2' });
  assert.deepEqual(legalDraws(game).includes('himalaya'), false);
  assert.throws(() => applyLostCitiesAction(game, other, { type: 'draw', from: 'himalaya' }), /도로/);
  game = applyLostCitiesAction(game, other, { type: 'draw', from: 'deck' });
  // Now the first player: 3 can't go on a 6.
  assert.throws(() => applyLostCitiesAction(game, me, { type: 'play', cardId: 'egypt-3' }), /더 큰/);
  game = applyLostCitiesAction(game, me, { type: 'discard', cardId: 'egypt-3' });
  game = applyLostCitiesAction(game, me, { type: 'draw', from: 'himalaya' });
  assert.ok(game.hands[me]!.some(c => c.id === 'himalaya-2'));
});

test('drawing the last card ends the round; the lower scorer opens the next one', () => {
  let game = withHand(fresh(2), fresh().currentPlayerId, [card('egypt', 9)]);
  const me = game.currentPlayerId;
  const other = me === 'a' ? 'b' : 'a';
  game.deck = [card('amazon', 2)];
  game = applyLostCitiesAction(game, me, { type: 'play', cardId: 'egypt-9' });
  game = applyLostCitiesAction(game, me, { type: 'draw', from: 'deck' });
  assert.equal(game.status, 'round-over');
  assert.equal(game.roundScores.length, 1);
  const mine = game.playerIds.indexOf(me);
  assert.equal(game.roundScores[0]![mine], -11);
  assert.throws(() => applyLostCitiesAction(game, other, { type: 'discard', cardId: 'x' }), /끝난/);
  const next = startNextRound(game, rng);
  assert.equal(next.round, 2);
  assert.equal(next.status, 'playing');
  assert.equal(next.deck.length, 44);
  const [scoreA, scoreB] = game.roundScores[0]!;
  assert.equal(next.currentPlayerId, scoreA < scoreB ? 'a' : 'b');
  assert.equal(next.expeditions[me]!.egypt.length, 0);
});

test('final round finishes the match with a winner by combined score', () => {
  let game = withHand(fresh(1), fresh().currentPlayerId, [card('egypt', 9)]);
  const me = game.currentPlayerId;
  game.deck = [card('amazon', 2)];
  game = applyLostCitiesAction(game, me, { type: 'play', cardId: 'egypt-9' });
  game = applyLostCitiesAction(game, me, { type: 'draw', from: 'deck' });
  assert.equal(game.status, 'finished');
  assert.equal(game.winnerId, game.playerIds.find(id => id !== me));
});

test('view hides the opponent hand and the draw pile', () => {
  const game = fresh();
  const view = getLostCitiesView(game, 'a');
  assert.equal(view.hand.length, 8);
  assert.equal(view.opponentHandCount, 8);
  assert.equal(view.deckCount, 44);
  assert.ok(!JSON.stringify(view).includes(JSON.stringify(game.hands.b![0]!)));
  assert.equal('deck' in view, false);
  assert.equal('hands' in view, false);
});

// ---- more rules coverage ----

test('handshake cards cannot follow a number, but several handshakes can stack', () => {
  assert.ok(!canPlayOnExpedition([card('egypt', 2)], card('egypt', 0)));
  assert.ok(!canPlayOnExpedition([card('egypt', 0), card('egypt', 3)], card('egypt', 0, 2)));
  assert.ok(canPlayOnExpedition([card('egypt', 0), card('egypt', 0, 2)], card('egypt', 0, 3)));
  assert.ok(canPlayOnExpedition([card('egypt', 0, 3)], card('egypt', 2)));
});

test('scoring edge cases: boundary of the long-expedition bonus and negative multipliers', () => {
  // Seven cards: no bonus. Eight cards: +20, and handshakes count toward the eight.
  assert.equal(scoreExpedition([2, 3, 4, 5, 6, 7, 8].map(v => card('amazon', v))), 35 - 20);
  assert.equal(scoreExpedition([0, 0, 0].map((v, n) => card('amazon', v, n + 1)).concat([2, 3, 4, 5, 6].map(v => card('amazon', v)))), (20 - 20) * 4 + 20);
  // A handshake multiplies a loss too.
  assert.equal(scoreExpedition([card('egypt', 0), card('egypt', 3), card('egypt', 5), card('egypt', 8)]), (16 - 20) * 2);
  // Only a handshake card on the table: -20 x2.
  assert.equal(scoreExpedition([card('egypt', 0)]), -40);
});

test('drawing from an empty discard pile is refused; the same site is fine after a play', () => {
  let game = withHand(fresh(), fresh().currentPlayerId, [card('egypt', 4), card('amazon', 7)]);
  const me = game.currentPlayerId;
  game.discards.egypt = [card('egypt', 9)];
  game = applyLostCitiesAction(game, me, { type: 'play', cardId: 'egypt-4' });
  assert.throws(() => applyLostCitiesAction(game, me, { type: 'draw', from: 'atlantis' }), /뽑을 수 없/);
  assert.deepEqual(legalDraws(game).sort(), ['deck', 'egypt']);
  game = applyLostCitiesAction(game, me, { type: 'draw', from: 'egypt' });
  assert.equal(game.discards.egypt.length, 0);
  assert.ok(game.hands[me]!.some(c => c.id === 'egypt-9'));
});

test('discards stack last-in-first-out and the view exposes only the legal draws to the mover', () => {
  let game = withHand(fresh(), fresh().currentPlayerId, [card('egypt', 4), card('egypt', 6)]);
  const me = game.currentPlayerId;
  const other = me === 'a' ? 'b' : 'a';
  game = applyLostCitiesAction(game, me, { type: 'discard', cardId: 'egypt-4' });
  assert.deepEqual(getLostCitiesView(game, me).drawable, ['deck']);
  game = applyLostCitiesAction(game, me, { type: 'draw', from: 'deck' });
  game = withHand(game, other, [card('egypt', 8), card('amazon', 3)]);
  game = applyLostCitiesAction(game, other, { type: 'discard', cardId: 'egypt-8' });
  assert.deepEqual(game.discards.egypt.map(c => c.id), ['egypt-4', 'egypt-8']);
  assert.deepEqual(getLostCitiesView(game, me).drawable, [], 'Only the player on the move sees draw options');
  assert.deepEqual(getLostCitiesView(game, other).drawable, ['deck']);
});

test('a tied round flips who opens the next one, and a 3-round match totals every round', () => {
  let game = withHand(fresh(3), fresh().currentPlayerId, [card('egypt', 9)]);
  const first = game.currentPlayerId;
  game.deck = [card('amazon', 2)];
  game.expeditions[first === 'a' ? 'b' : 'a']!.egypt = [card('egypt', 9)];
  game = applyLostCitiesAction(game, first, { type: 'play', cardId: 'egypt-9' });
  game = applyLostCitiesAction(game, first, { type: 'draw', from: 'deck' });
  assert.equal(game.status, 'round-over');
  assert.deepEqual(game.roundScores[0], [-11, -11]);
  const second = startNextRound(game, rng);
  assert.notEqual(second.currentPlayerId, game.currentPlayerId, 'Tie: the turn order flips');
  assert.equal(second.round, 2);
  assert.deepEqual(second.roundScores, [[-11, -11]], 'Earlier round scores carry over');
  assert.throws(() => startNextRound(second, rng), /다음 라운드/);
});

test('the round only ends on the deck draw, never on a discard draw, and input state is never mutated', () => {
  let game = withHand(fresh(), fresh().currentPlayerId, [card('egypt', 4)]);
  const me = game.currentPlayerId;
  game.deck = [card('amazon', 2), card('amazon', 3)];
  game.discards.pompeii = [card('pompeii', 5)];
  const snapshot = JSON.stringify(game);
  const afterPlay = applyLostCitiesAction(game, me, { type: 'discard', cardId: 'egypt-4' });
  assert.equal(JSON.stringify(game), snapshot, 'applyLostCitiesAction returns a copy');
  const afterDraw = applyLostCitiesAction(afterPlay, me, { type: 'draw', from: 'pompeii' });
  assert.equal(afterDraw.status, 'playing');
  assert.equal(afterDraw.deck.length, 2);
});

function seededRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The set of every card id in play, wherever it currently sits. */
function allCards(game: LCState): string[] {
  return [
    ...game.deck, ...Object.values(game.hands).flat(),
    ...Object.values(game.discards).flat(),
    ...Object.values(game.expeditions).flatMap(e => Object.values(e).flat()),
  ].map(c => c.id);
}

test('fuzz: random legal play for 60 seeds keeps the deck whole, ordered, and ends exactly when the deck runs out', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const random = seededRng(seed);
    let game = createLostCities(['a', 'b'], random, 3);
    let steps = 0;
    while (game.status !== 'finished') {
      if (game.status === 'round-over') {
        assert.equal(game.deck.length, 0);
        game = startNextRound(game, random);
      }
      const me = game.currentPlayerId;
      assert.equal(game.hands[me]!.length, 8, `seed ${seed}: hand is 8 at the start of a turn`);
      const hand = game.hands[me]!;
      const card = hand[Math.floor(random() * hand.length)]!;
      const canLay = canPlayOnExpedition(game.expeditions[me]![card.site], card);
      game = applyLostCitiesAction(game, me, canLay && random() < 0.6 ? { type: 'play', cardId: card.id } : { type: 'discard', cardId: card.id });
      assert.equal(game.hands[me]!.length, 7);
      const draws = legalDraws(game);
      assert.ok(draws.length > 0, `seed ${seed}: there is always something to draw`);
      // Drawing from a discard pile does not shrink the deck, so lean toward the deck to keep games finite.
      const pick = draws.includes('deck') && random() < 0.7 ? 'deck' : draws[Math.floor(random() * draws.length)]!;
      game = applyLostCitiesAction(game, me, { type: 'draw', from: pick });
      const ids = allCards(game);
      assert.equal(ids.length, 60, `seed ${seed}: all 60 cards accounted for`);
      assert.equal(new Set(ids).size, 60, `seed ${seed}: no card duplicated`);
      for (const id of game.playerIds) {
        for (const site of SITES) {
          const run = game.expeditions[id]![site];
          assert.ok(run.every(c => c.site === site));
          for (let i = 1; i < run.length; i++) {
            assert.ok(run[i]!.value > run[i - 1]!.value || (run[i]!.value === 0 && run[i - 1]!.value === 0), `seed ${seed}: ${site} ascends`);
          }
        }
      }
      assert.ok(++steps < 3000, `seed ${seed}: game terminates`);
    }
    assert.equal(game.roundScores.length, 3);
    const totals = matchTotals(game);
    assert.equal(game.winnerId, totals[0] === totals[1] ? null : totals[0] > totals[1] ? 'a' : 'b');
    // Recomputing the last round's score from the board must give what was recorded.
    assert.deepEqual(game.roundScores[2], [scoreTotal(game.expeditions.a!), scoreTotal(game.expeditions.b!)]);
  }
});
