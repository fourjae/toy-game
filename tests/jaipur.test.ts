import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyJaipurAction, buildDeck, createJaipur, getJaipurView, startNextJaipurRound, BONUS, TOKENS,
  type JPCard, type JPState,
} from '../shared/jaipur.ts';
import { RuleError } from '../shared/duel.ts';

const fresh = () => { const s = createJaipur(['a', 'b'], () => 0.3); s.currentPlayerId = 'a'; return s; };
const card = (kind: JPCard['kind'], n: number): JPCard => ({ id: `${kind}-${n}`, kind });

/** A hand-built position: a holds `hand`, the market is `market`. */
function setup(hand: JPCard[], market: JPCard[], herd = 0): JPState {
  const s = fresh();
  const used = new Set([...hand, ...market].map(c => c.id));
  s.hands = { a: hand, b: [] };
  s.herds = { a: Array.from({ length: herd }, (_, i) => card('camel', 11 - i)), b: [] };
  for (const c of s.herds.a!) used.add(c.id);
  s.market = market;
  s.deck = buildDeck().filter(c => !used.has(c.id));
  return s;
}

test('deck: 55 cards and the token piles match the box', () => {
  assert.equal(buildDeck().length, 55);
  assert.equal(TOKENS.diamond.length + TOKENS.gold.length + TOKENS.silver.length + TOKENS.cloth.length + TOKENS.spice.length + TOKENS.leather.length, 38);
  assert.equal(BONUS[3].length + BONUS[4].length + BONUS[5].length, 18);
});

test('deal: 3 camels + 2 in the market, 5 cards each with camels moved to the herd', () => {
  const s = fresh();
  assert.equal(s.market.length, 5);
  assert.ok(s.market.filter(c => c.kind === 'camel').length >= 3);
  for (const id of ['a', 'b']) {
    assert.equal(s.hands[id]!.length + s.herds[id]!.length, 5);
    assert.ok(s.hands[id]!.every(c => c.kind !== 'camel'));
  }
  assert.equal(s.deck.length, 55 - 5 - 10);
});

test('take one good: refills the market, respects the hand limit, never a single camel', () => {
  let s = setup([card('leather', 1)], [card('camel', 1), card('gold', 1), card('spice', 1), card('cloth', 1), card('leather', 2)]);
  assert.throws(() => applyJaipurAction(s, 'a', { type: 'take', marketId: 'camel-1' }), /낙타/u);
  s = applyJaipurAction(s, 'a', { type: 'take', marketId: 'gold-1' });
  assert.equal(s.hands.a!.length, 2);
  assert.equal(s.market.length, 5);
  assert.equal(s.currentPlayerId, 'b');
  const full = setup(Array.from({ length: 7 }, (_, i) => card('leather', i + 1)), [card('gold', 1), card('spice', 1), card('cloth', 1), card('camel', 1), card('camel', 2)]);
  assert.throws(() => applyJaipurAction(full, 'a', { type: 'take', marketId: 'gold-1' }), /7장/u);
});

test('take all camels goes to the herd, not the hand', () => {
  const s = applyJaipurAction(setup([], [card('camel', 1), card('camel', 2), card('gold', 1), card('spice', 1), card('cloth', 1)]), 'a', { type: 'camels' });
  assert.equal(s.herds.a!.length, 2);
  assert.equal(s.hands.a!.length, 0);
  assert.equal(s.market.length, 5);
  assert.throws(() => applyJaipurAction(setup([], [card('gold', 1), card('spice', 1), card('cloth', 1), card('silver', 1), card('leather', 1)]), 'a', { type: 'camels' }), RuleError);
});

test('exchange: 2+ goods for as many hand cards or camels, never the same good both ways', () => {
  const market = [card('gold', 1), card('spice', 1), card('cloth', 1), card('silver', 1), card('leather', 1)];
  const base = setup([card('leather', 2), card('diamond', 1)], market, 2);
  assert.throws(() => applyJaipurAction(base, 'a', { type: 'exchange', marketIds: ['gold-1'], handIds: ['diamond-1'], camels: 0 }), /2장/u);
  assert.throws(() => applyJaipurAction(base, 'a', { type: 'exchange', marketIds: ['gold-1', 'leather-1'], handIds: ['leather-2', 'diamond-1'], camels: 0 }), /같은 종류/u);
  assert.throws(() => applyJaipurAction(base, 'a', { type: 'exchange', marketIds: ['gold-1', 'spice-1'], handIds: ['diamond-1'], camels: 0 }), /장수만큼/u);
  assert.throws(() => applyJaipurAction(base, 'a', { type: 'exchange', marketIds: ['gold-1', 'spice-1'], handIds: [], camels: 3 }), RuleError);
  const s = applyJaipurAction(base, 'a', { type: 'exchange', marketIds: ['gold-1', 'spice-1'], handIds: ['diamond-1'], camels: 1 });
  assert.deepEqual(s.hands.a!.map(c => c.id).sort(), ['gold-1', 'leather-2', 'spice-1']);
  assert.equal(s.herds.a!.length, 1);
  assert.deepEqual(s.market.map(c => c.kind), ['diamond', 'camel', 'cloth', 'silver', 'leather']);
  assert.equal(s.deck.length, base.deck.length, 'an exchange does not draw');
});

test('sell: one kind, precious goods need two, tokens from the top, bonus for three or more', () => {
  const market = [card('camel', 1), card('camel', 2), card('camel', 3), card('spice', 1), card('spice', 2)];
  const s0 = setup([card('diamond', 1), card('cloth', 1), card('cloth', 2), card('cloth', 3), card('cloth', 4), card('leather', 1)], market);
  assert.throws(() => applyJaipurAction(s0, 'a', { type: 'sell', cardIds: ['diamond-1'] }), /2장 이상/u);
  assert.throws(() => applyJaipurAction(s0, 'a', { type: 'sell', cardIds: ['cloth-1', 'leather-1'] }), /한 종류/u);
  const s = applyJaipurAction(s0, 'a', { type: 'sell', cardIds: ['cloth-1', 'cloth-2', 'cloth-3', 'cloth-4'] });
  assert.deepEqual(s.earned.a!.goods.map(t => t.value), [5, 3, 3, 2]);
  assert.equal(s.earned.a!.bonus.length, 1);
  assert.equal(s.earned.a!.bonus[0]!.size, 4);
  assert.deepEqual(s.tokens.cloth, [2, 1, 1]);
});

test('selling past an empty pile still pays the bonus', () => {
  const s0 = setup([card('leather', 1), card('leather', 2), card('leather', 3)], [card('camel', 1), card('camel', 2), card('camel', 3), card('spice', 1), card('spice', 2)]);
  s0.tokens.leather = [1];
  const s = applyJaipurAction(s0, 'a', { type: 'sell', cardIds: ['leather-1', 'leather-2', 'leather-3'] });
  assert.deepEqual(s.earned.a!.goods.map(t => t.value), [1]);
  assert.equal(s.earned.a!.bonus.length, 1);
});

test('round end by three empty token piles: camel bonus, seal, the loser starts next', () => {
  const s0 = setup([card('diamond', 1), card('diamond', 2)], [card('camel', 1), card('camel', 2), card('camel', 3), card('spice', 1), card('spice', 2)], 2);
  s0.tokens.silver = [];
  s0.tokens.gold = [];
  s0.tokens.diamond = [7, 7];
  s0.herds.b = [card('camel', 4)];
  s0.earned.b!.goods = [{ good: 'leather', value: 1 }];
  const s = applyJaipurAction(s0, 'a', { type: 'sell', cardIds: ['diamond-1', 'diamond-2'] });
  assert.equal(s.status, 'round-over');
  const r = s.results[0]!;
  assert.deepEqual(r.camelBonus, [5, 0]);
  assert.equal(r.totals[0], 19);
  assert.equal(r.sealTo, 'a');
  assert.equal(s.seals.a, 1);
  const next = startNextJaipurRound(s, () => 0.6);
  assert.equal(next.round, 2);
  assert.equal(next.currentPlayerId, 'b');
  assert.equal(next.seals.a, 1);
  assert.equal(next.earned.a!.goods.length, 0);
});

test('round end when the market cannot be refilled; ties go to more bonus tokens then goods tokens', () => {
  const s0 = setup([], [card('gold', 1), card('spice', 1), card('cloth', 1), card('silver', 1), card('leather', 1)]);
  s0.deck = [];
  s0.earned.a!.goods = [{ good: 'cloth', value: 5 }];
  s0.earned.b!.bonus = [{ size: 3, value: 5 }];
  const s = applyJaipurAction(s0, 'a', { type: 'take', marketId: 'gold-1' });
  assert.equal(s.status, 'round-over');
  assert.equal(s.results[0]!.endReason, 'deck');
  assert.equal(s.results[0]!.sealTo, 'b', 'equal money, b has more bonus tokens');
});

test('two seals win the match', () => {
  const s0 = setup([card('diamond', 1), card('diamond', 2)], [card('camel', 1), card('camel', 2), card('camel', 3), card('spice', 1), card('spice', 2)]);
  s0.seals.a = 1;
  s0.tokens.silver = []; s0.tokens.gold = []; s0.tokens.diamond = [7, 7];
  const s = applyJaipurAction(s0, 'a', { type: 'sell', cardIds: ['diamond-1', 'diamond-2'] });
  assert.equal(s.status, 'finished');
  assert.equal(s.winnerId, 'a');
});

test('view hides the opponent hand, the deck and their bonus values', () => {
  const s0 = setup([card('cloth', 1), card('cloth', 2), card('cloth', 3)], [card('camel', 1), card('camel', 2), card('camel', 3), card('spice', 1), card('spice', 2)]);
  s0.hands.b = [card('diamond', 5)];
  const s = applyJaipurAction(s0, 'a', { type: 'sell', cardIds: ['cloth-1', 'cloth-2', 'cloth-3'] });
  const bView = getJaipurView(s, 'b');
  assert.equal(bView.opponentBonus.length, 1);
  assert.equal(bView.opponentBonus[0]!.value, null);
  assert.equal(getJaipurView(s, 'a').myBonus[0]!.value > 0, true);
  const aText = JSON.stringify(getJaipurView(s, 'a'));
  assert.ok(!aText.includes('diamond-5'));
  assert.ok(!aText.includes(s.deck[0]!.id));
});

test('random play always ends a match', () => {
  let s = createJaipur(['a', 'b'], () => 0.42);
  let seed = 1;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 3000 && s.status !== 'finished'; i++) {
    if (s.status === 'round-over') { s = startNextJaipurRound(s, rnd); continue; }
    const me = s.currentPlayerId;
    const hand = s.hands[me]!;
    const counts = new Map<string, JPCard[]>();
    for (const c of hand) counts.set(c.kind, [...(counts.get(c.kind) ?? []), c]);
    const sellable = [...counts.values()].find(cs => cs.length >= 2 || !['diamond', 'gold', 'silver'].includes(cs[0]!.kind));
    const good = s.market.find(c => c.kind !== 'camel');
    try {
      if (sellable && (hand.length >= 5 || rnd() < 0.5)) s = applyJaipurAction(s, me, { type: 'sell', cardIds: sellable.map(c => c.id) });
      else if (good && hand.length < 7) s = applyJaipurAction(s, me, { type: 'take', marketId: good.id });
      else if (s.market.some(c => c.kind === 'camel')) s = applyJaipurAction(s, me, { type: 'camels' });
      else s = applyJaipurAction(s, me, { type: 'sell', cardIds: [hand[0]!.id, ...hand.filter(c => c.kind === hand[0]!.kind).slice(1).map(c => c.id)] });
    } catch (error) {
      if (!(error instanceof RuleError)) throw error;
      s = applyJaipurAction(s, me, s.market.some(c => c.kind === 'camel') ? { type: 'camels' } : { type: 'take', marketId: good!.id });
    }
  }
  assert.equal(s.status, 'finished');
  assert.equal(s.seals[s.winnerId!], 2);
});
