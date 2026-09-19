import assert from 'node:assert/strict';
import test from 'node:test';
import { applyAction, applyTimeout, attackPower, canPlaceTroop, connectedNodes, createGame, getGameView, neighbors } from '../shared/engine';
import { ADJACENCY, CASTLE_MAP, edgeKey } from '../shared/map';
import { BASE_TROOP_TYPES, TROOP_TYPES } from '../shared/troops';
import type { GameRules, GameState, Troop, TroopType } from '../shared/types';

const ALL_RULES: GameRules = { flank: true, depots: true, expansion: true };

let serial = 0;
const troop = (type: TroopType, ownerId = 'alice'): Troop => ({ id: `test-${serial++}`, type, ownerId });

function fixture(rules?: Partial<GameRules>): GameState {
  const game = createGame(['alice', 'bob'], () => 0.2, { flank: false, depots: false, expansion: false, ...rules });
  for (const p of game.players) {
    p.hand = [];
    p.supply = [troop('duck', p.id), troop('dino', p.id)];
  }
  return game;
}

function put(game: GameState, nodeId: string, type: TroopType = 'dino', ownerId = 'alice'): Troop {
  const tile = troop(type, ownerId);
  game.board[nodeId]!.push(tile);
  return tile;
}

function give(game: GameState, types: TroopType[], ownerId = 'alice'): Troop[] {
  const tiles = types.map((type) => troop(type, ownerId));
  game.players.find((p) => p.id === ownerId)!.hand = tiles;
  return tiles;
}

function deploy(game: GameState, tile: Troop, nodeId: string, useAbility = true): GameState {
  return applyAction(game, tile.ownerId, { type: 'place', troopId: tile.id, nodeId, useAbility }, () => 0.2);
}

test('Castle Field graph has symmetric paths and closed scoring regions', () => {
  assert.equal(CASTLE_MAP.nodes.length, 17);
  assert.equal(CASTLE_MAP.edges.length, 26);
  assert.equal(CASTLE_MAP.regions.reduce((sum, region) => sum + region.medals, 0), 14);
  for (const region of CASTLE_MAP.regions) {
    region.nodeIds.forEach((node, i) => assert.ok(ADJACENCY[node]!.includes(region.nodeIds[(i + 1) % region.nodeIds.length]!)));
  }
  assert.ok(!ADJACENCY['bridge-top']!.includes('bridge-center'));
  assert.equal(CASTLE_MAP.medalTarget, 7);
});

test('setup uses all 24 tiles per side and gives first3 / second4', () => {
  const game = createGame(['alice', 'bob'], () => 0.2);
  assert.equal(game.currentPlayerId, 'alice');
  assert.equal(game.players[0].hand.length, 3);
  assert.equal(game.players[1].hand.length, 4);
  assert.equal(game.players[0].supply.length, 21);
  assert.equal(game.players[1].supply.length, 20);
  const all = game.players.flatMap((p) => [...p.hand, ...p.supply]);
  assert.equal(new Set(all.map((tile) => tile.id)).size, 48);
  for (const p of game.players) {
    for (const type of BASE_TROOP_TYPES) assert.equal([...p.hand, ...p.supply].filter((tile) => tile.type === type).length, 3);
    assert.ok([...p.hand, ...p.supply].every((tile) => BASE_TROOP_TYPES.includes(tile.type)), 'the printed game deals no expansion troops');
  }
  assert.equal(createGame(['alice', 'bob'], () => 0.9).currentPlayerId, 'bob');
  assert.throws(() => createGame(['alice', 'alice']));
});

test('a private view contains no opponent hand, reserve, or mutable references', () => {
  const game = createGame(['alice', 'bob'], () => 0.2);
  const view = getGameView(game, 'alice');
  const serialized = JSON.stringify(view);
  for (const hidden of [...game.players[1].hand, ...game.players[0].supply, ...game.players[1].supply]) {
    assert.ok(!serialized.includes(`"${hidden.id}"`));
  }
  assert.equal(view.players[1]!.handCount, 4);
  assert.deepEqual(view.opponentHand, Array.from({ length: 4 }, (_, index) => ({ slot: `slot-${index}`, frozen: false })));
  view.hand.pop();
  assert.equal(game.players[0].hand.length, 3);
  assert.deepEqual(getGameView(game, 'bob').legalPlacements, {});
  assert.throws(() => getGameView(game, 'outsider'));
});

test('wrong-turn and invalid actions leave the original game untouched', () => {
  const game = fixture();
  const snapshot = structuredClone(game);
  assert.throws(() => applyAction(game, 'bob', { type: 'draw' }), /차례/);
  assert.throws(() => applyAction(game, 'alice', { type: 'place', troopId: 'fake', nodeId: 'blue-top' }), /내 손/);
  assert.throws(() => applyAction(game, 'alice', { type: 'skip' }));
  assert.deepEqual(game, snapshot);
});

test('draw takes a whole turn, respects eight tiles and the last reserve tile', () => {
  const game = fixture();
  give(game, Array<TroopType>(7).fill('duck'));
  const result = applyAction(game, 'alice', { type: 'draw' });
  assert.equal(result.players[0].hand.length, 8);
  assert.equal(result.players[0].supply.length, 1);
  assert.equal(result.currentPlayerId, 'bob');
  assert.equal(result.turn, 2);
  assert.equal(result.revision, 1);
  assert.equal(game.players[0].hand.length, 7);
  game.players[0].hand.push(troop('duck'));
  assert.throws(() => applyAction(game, 'alice', { type: 'draw' }), /8개/);
  game.players[0].hand = [];
  game.players[0].supply = [troop('duck')];
  assert.equal(applyAction(game, 'alice', { type: 'draw' }).players[0].hand.length, 1);
});

test('normal deployment follows a continuous chain from HQ', () => {
  const game = fixture();
  const [dino] = give(game, ['dino']);
  assert.ok(canPlaceTroop(game, 'alice', dino!, 'blue-top'));
  assert.ok(!canPlaceTroop(game, 'alice', dino!, 'west-top'));
  put(game, 'blue-top');
  assert.ok(canPlaceTroop(game, 'alice', dino!, 'west-top'));
  put(game, 'west-top');
  assert.ok(connectedNodes(game, 'alice').has('west-top'));
  assert.ok(canPlaceTroop(game, 'alice', dino!, 'bridge-center'));
  put(game, 'blue-top', 'duck', 'bob');
  assert.ok(!connectedNodes(game, 'alice').has('west-top'));
  assert.ok(!canPlaceTroop(game, 'alice', dino!, 'bridge-center'));
  assert.ok(!canPlaceTroop(game, 'alice', dino!, 'west-top'));
});

test('own troops may be covered by weaker troops; enemy ties may not', () => {
  const game = fixture();
  const [weak, strong] = give(game, ['skeleton', 'dino']);
  put(game, 'blue-top', 'dino');
  assert.ok(canPlaceTroop(game, 'alice', weak!, 'blue-top'));
  put(game, 'blue-bottom', 'dino', 'bob');
  assert.ok(!canPlaceTroop(game, 'alice', strong!, 'blue-bottom'));
  const result = deploy(game, weak!, 'blue-top', false);
  assert.equal(result.board['blue-top']!.length, 2);
  assert.equal(result.board['blue-top']!.at(-1)!.id, weak!.id);
});

test('duck covers every enemy rank and can be covered by any rank', () => {
  const game = fixture();
  const [duck, weak] = give(game, ['duck', 'skeleton']);
  put(game, 'blue-top', 'dino', 'bob');
  put(game, 'blue-bottom', 'duck', 'bob');
  assert.ok(canPlaceTroop(game, 'alice', duck!, 'blue-top'));
  assert.ok(canPlaceTroop(game, 'alice', weak!, 'blue-bottom'));
  assert.ok(canPlaceTroop(game, 'alice', duck!, 'blue-bottom'));
});

test('pirate ignores connections at bases but never at either HQ', () => {
  const game = fixture();
  const [pirate] = give(game, ['pirate']);
  assert.ok(canPlaceTroop(game, 'alice', pirate!, 'red-top'));
  assert.ok(canPlaceTroop(game, 'alice', pirate!, 'drum-ne'));
  assert.ok(!canPlaceTroop(game, 'alice', pirate!, 'hq-red'));
  assert.ok(!canPlaceTroop(game, 'alice', pirate!, 'hq-blue'));
  put(game, 'red-top', 'robot', 'bob');
  assert.ok(!canPlaceTroop(game, 'alice', pirate!, 'red-top'));
});

test('skeleton and unicorn replenish after placement with a hard hand limit', () => {
  for (const [type, expected] of [['skeleton', 2], ['unicorn', 1]] as const) {
    const game = fixture();
    const [tile] = give(game, [type]);
    assert.equal(deploy(game, tile!, 'blue-top').players[0].hand.length, expected);
  }
  const game = fixture();
  const [skeleton] = give(game, ['skeleton', ...Array<TroopType>(7).fill('duck')]);
  assert.equal(deploy(game, skeleton!, 'blue-top').players[0].hand.length, 8);
});

test('robot lets its owner choose one hidden enemy tile for the shared discard pile', () => {
  const game = fixture();
  const [robot] = give(game, ['robot']);
  const enemy = give(game, ['dino', 'duck', 'captain'], 'bob');
  const pending = deploy(game, robot!, 'blue-top');
  assert.equal(pending.pending?.type, 'map-freeze-card');
  assert.equal(pending.pending?.cardEffect, 'discard');
  assert.deepEqual(pending.pending?.troopIds, ['slot-0', 'slot-1', 'slot-2']);
  assert.equal(pending.players[1].hand.length, 3);
  const result = applyAction(pending, 'alice', { type: 'choose-card', troopId: 'slot-1' }, () => 0.2);
  assert.equal(result.players[1].hand.length, 2);
  assert.deepEqual(result.discarded.map(tile => tile.id), [enemy[1]!.id]);
  assert.ok(!result.players[1].supply.some(tile => tile.id === enemy[1]!.id));
  assert.match(result.log.at(-1)!.text, /공용 버림 더미/u);
});

test('captain chains placements and all of their effects within one turn', () => {
  const game = fixture();
  const [first, second, last] = give(game, ['captain', 'captain', 'unicorn']);
  let result = deploy(game, first!, 'blue-top');
  assert.equal(result.pending?.type, 'extra-place');
  assert.equal(result.currentPlayerId, 'alice');
  assert.equal(getGameView(result, 'alice').canDraw, false);
  assert.throws(() => applyAction(result, 'alice', { type: 'draw' }), /효과/);
  result = deploy(result, second!, 'west-top');
  assert.equal(result.pending?.type, 'extra-place');
  result = deploy(result, last!, 'bridge-center');
  assert.equal(result.currentPlayerId, 'bob');
  assert.equal(result.turn, 2);
  assert.equal(result.players[0].hand.length, 1);
});

test('captain may skip its extra placement and auto-finishes with an empty hand', () => {
  const game = fixture();
  const [captain] = give(game, ['captain', 'dino']);
  const pending = deploy(game, captain!, 'blue-top');
  assert.equal(applyAction(pending, 'alice', { type: 'skip' }).currentPlayerId, 'bob');
  const empty = fixture();
  const [lone] = give(empty, ['captain']);
  assert.equal(deploy(empty, lone!, 'blue-top').currentPlayerId, 'bob');
});

test('the opponent sees every troop from the previous turn until their own turn ends', () => {
  const game = fixture();
  const [captain, dino] = give(game, ['captain', 'dino']);
  let result = deploy(game, captain!, 'blue-top');
  assert.deepEqual(result.turnPlacements, [captain!.id]);
  result = deploy(result, dino!, 'west-top');
  assert.deepEqual(result.lastTurnPlacements, { playerId: 'alice', troopIds: [captain!.id, dino!.id] });
  assert.deepEqual(result.turnPlacements, []);
  assert.deepEqual(getGameView(result, 'bob').recentOpponentTroopIds, [captain!.id, dino!.id]);
  assert.deepEqual(getGameView(result, 'alice').recentOpponentTroopIds, []);

  result = applyAction(result, 'bob', { type: 'draw' }, () => 0.2);
  assert.deepEqual(result.lastTurnPlacements, { playerId: 'bob', troopIds: [] });
  assert.deepEqual(getGameView(result, 'alice').recentOpponentTroopIds, []);
});

test('giant removes only an adjacent visible enemy, exposing the tile below', () => {
  const game = fixture();
  const [giant] = give(game, ['giant']);
  const buried = put(game, 'west-top', 'duck');
  const visible = put(game, 'west-top', 'dino', 'bob');
  put(game, 'east-top', 'dino', 'bob');
  let result = deploy(game, giant!, 'blue-top');
  assert.deepEqual(result.pending?.nodeIds, ['west-top']);
  assert.throws(() => applyAction(result, 'alice', { type: 'choose', nodeId: 'east-top' }));
  result = applyAction(result, 'alice', { type: 'choose', nodeId: 'west-top' });
  assert.deepEqual(result.board['west-top'], [buried]);
  assert.deepEqual(result.discarded, [visible]);
  assert.equal(result.currentPlayerId, 'bob');
});

test('drum recovery allows another visible friendly tile anywhere', () => {
  const game = fixture();
  const [pirate] = give(game, ['pirate']);
  const friend = put(game, 'red-top');
  put(game, 'blue-top', 'duck');
  put(game, 'blue-top', 'dino', 'bob');
  let result = deploy(game, pirate!, 'drum-nw');
  assert.equal(result.pending?.type, 'recover');
  assert.deepEqual(result.pending?.nodeIds, ['red-top']);
  result = applyAction(result, 'alice', { type: 'choose', nodeId: 'red-top' });
  assert.deepEqual(result.players[0].hand, [friend]);
  assert.equal(result.board['red-top']!.length, 0);
});

test('all troop effects precede drum recovery during a captain chain', () => {
  const game = fixture();
  put(game, 'blue-top');
  put(game, 'west-top');
  put(game, 'drum-ne', 'dino', 'bob');
  const [captain, giant] = give(game, ['captain', 'giant']);
  let result = deploy(game, captain!, 'drum-nw');
  assert.equal(result.pending?.type, 'extra-place');
  assert.equal(result.deferredSpecials.length, 1);
  result = deploy(result, giant!, 'bridge-top');
  assert.equal(result.pending?.type, 'remove');
  result = applyAction(result, 'alice', { type: 'choose', nodeId: 'drum-ne' });
  assert.equal(result.pending?.type, 'recover');
  assert.equal(result.pending?.sourceTroopId, captain!.id);
  assert.ok(result.pending?.nodeIds.includes('bridge-top'));
  assert.ok(!result.pending?.nodeIds.includes('drum-nw'));
  result = applyAction(result, 'alice', { type: 'skip' });
  assert.equal(result.turn, 2);
});

test('optional troop effects can be declined to retain space for drum recovery', () => {
  const game = fixture();
  put(game, 'blue-top');
  put(game, 'west-top');
  const [skeleton] = give(game, ['skeleton', ...Array<TroopType>(7).fill('duck')]);
  const automatic = deploy(game, skeleton!, 'drum-nw');
  assert.equal(automatic.players[0].hand.length, 8);
  assert.equal(automatic.pending, null);
  const declined = deploy(game, skeleton!, 'drum-nw', false);
  assert.equal(declined.players[0].hand.length, 7);
  assert.equal(declined.pending?.type, 'recover');
});

test('controlling a whole region earns medals immediately before an ability', () => {
  const game = fixture();
  put(game, 'blue-top');
  put(game, 'west-top');
  put(game, 'west-bottom');
  game.players[0].medals = 4;
  const [robot] = give(game, ['robot']);
  const enemy = give(game, ['dino'], 'bob');
  const result = deploy(game, robot!, 'bridge-center');
  assert.equal(result.claimedRegions.west, 'alice');
  assert.equal(result.players[0].medals, 7);
  assert.equal(result.winnerId, 'alice');
  assert.equal(result.winReason, 'medals');
  assert.deepEqual(result.players[1].hand, enemy);
  assert.throws(() => applyAction(result, 'alice', { type: 'draw' }), /끝난/);
});

test('claimed medals stay claimed even when the region is recaptured', () => {
  const game = fixture();
  game.claimedRegions.west = 'bob';
  game.players[1].medals = 3;
  put(game, 'blue-top');
  put(game, 'west-top');
  put(game, 'west-bottom');
  const [dino] = give(game, ['dino']);
  const result = deploy(game, dino!, 'bridge-center');
  assert.equal(result.claimedRegions.west, 'bob');
  assert.equal(result.players[0].medals, 0);
  assert.equal(result.players[1].medals, 3);
});

test('removing a covering tile can award medals to the revealed owner', () => {
  const game = fixture();
  put(game, 'west-top');
  put(game, 'bridge-center');
  put(game, 'west-bottom', 'duck');
  put(game, 'west-bottom', 'dino', 'bob');
  const [giant] = give(game, ['giant']);
  let result = deploy(game, giant!, 'blue-bottom');
  result = applyAction(result, 'alice', { type: 'choose', nodeId: 'west-bottom' });
  assert.equal(result.players[0].medals, 3);
  assert.equal(result.claimedRegions.west, 'alice');
});

test('recovering a tile can reveal an enemy region and end the game immediately', () => {
  const game = fixture();
  game.players[1].medals = 4;
  put(game, 'west-top', 'dino', 'bob');
  put(game, 'bridge-center', 'dino', 'bob');
  put(game, 'west-bottom', 'duck', 'bob');
  put(game, 'west-bottom');
  const [pirate] = give(game, ['pirate']);
  let result = deploy(game, pirate!, 'drum-nw');
  result = applyAction(result, 'alice', { type: 'choose', nodeId: 'west-bottom' });
  assert.equal(result.winnerId, 'bob');
  assert.equal(result.players[1].medals, 7);
  assert.equal(result.pending, null);
});

test('connected capture of the opposing HQ wins before the troop ability', () => {
  const game = fixture();
  for (const node of ['blue-top', 'west-top', 'bridge-center', 'east-top', 'red-top']) put(game, node);
  const [skeleton] = give(game, ['skeleton']);
  const result = deploy(game, skeleton!, 'hq-red');
  assert.equal(result.winnerId, 'alice');
  assert.equal(result.winReason, 'headquarters');
  assert.equal(result.players[0].hand.length, 0);
  assert.equal(result.players[0].supply.length, 2);
});

test('when the next player has no action, medals decide and that player loses ties', () => {
  const game = fixture();
  game.players[1].supply = [];
  let result = applyAction(game, 'alice', { type: 'draw' });
  assert.equal(result.winnerId, 'alice');
  assert.equal(result.winReason, 'no-moves');
  game.players[1].medals = 2;
  result = applyAction(game, 'alice', { type: 'draw' });
  assert.equal(result.winnerId, 'bob');
});

test('an empty reserve does not end a turn while legal placements remain', () => {
  const game = fixture();
  game.players[1].supply = [];
  give(game, ['pirate'], 'bob');
  const result = applyAction(game, 'alice', { type: 'draw' });
  assert.equal(result.status, 'playing');
  assert.equal(result.currentPlayerId, 'bob');
  assert.ok(Object.values(getGameView(result, 'bob').legalPlacements).some((nodes) => nodes.length > 0));
});

test('many deterministic full games preserve tile counts, hidden state and turn progress', () => {
  for (let seed = 1; seed <= 32; seed++) {
    let value = seed;
    const rng = () => ((value = (Math.imul(value, 1664525) + 1013904223) >>> 0) / 0x100000000);
    const expansion = seed > 16;
    let game = createGame(['alice', 'bob'], rng, expansion ? ALL_RULES : undefined);
    // 8 printed types x3 plus 4 expansion types x2, for both players.
    const total = expansion ? 64 : 48;
    let moves = 0;
    while (game.status === 'playing' && moves++ < 400) {
      const view = getGameView(game, game.currentPlayerId);
      if (view.pending && view.pending.type !== 'extra-place') {
        const skip = rng() <= 0.1;
        if (!skip && view.pending.troopIds?.length) {
          const troopId = view.pending.troopIds[Math.floor(rng() * view.pending.troopIds.length)]!;
          game = applyAction(game, game.currentPlayerId, { type: 'choose-card', troopId }, rng);
        } else {
          const nodeId = view.pending.nodeIds[Math.floor(rng() * view.pending.nodeIds.length)]!;
          game = applyAction(game, game.currentPlayerId, skip ? { type: 'skip' } : { type: 'choose', nodeId }, rng);
        }
      } else {
        const legal = Object.entries(view.legalPlacements).flatMap(([troopId, nodes]) => nodes.map((nodeId) => ({ troopId, nodeId })));
        if (view.canDraw && (!legal.length || rng() < 0.32)) {
          game = applyAction(game, game.currentPlayerId, { type: 'draw' }, rng);
        } else if (legal.length) {
          game = applyAction(game, game.currentPlayerId, { type: 'place', ...legal[Math.floor(rng() * legal.length)]! }, rng);
        } else {
          assert.ok(view.pending);
          game = applyAction(game, game.currentPlayerId, { type: 'skip' }, rng);
        }
      }
      const allTiles = [
        ...game.players.flatMap((p) => [...p.hand, ...p.supply]),
        ...Object.values(game.board).flat(), ...game.discarded,
      ];
      assert.equal(allTiles.length, total);
      assert.equal(new Set(allTiles.map((tile) => tile.id)).size, total);
      assert.ok(game.players.every((p) => p.hand.length <= 8));
      assert.ok(game.players.reduce((sum, p) => sum + p.medals, 0) <= 14);
    }
    assert.equal(game.status, 'finished', `seed ${seed} exceeded the move limit`);
    assert.ok(game.winnerId);
  }
});

test('a timed-out turn skips pending effects, draws when possible, or places the weakest troop', () => {
  let game = fixture();
  give(game, ['dino']);
  let result = applyTimeout(game, 'alice', () => 0.2);
  assert.equal(result.currentPlayerId, 'bob');
  assert.equal(result.players[0].hand.length, 3);
  assert.ok(result.log.some((entry) => entry.text.includes('시간이 다 되어')));
  assert.ok(result.revision > game.revision);
  assert.equal(game.players[0].hand.length, 1, 'the original state is untouched');

  game = fixture();
  const [captain] = give(game, ['captain', 'dino']);
  const pending = deploy(game, captain!, 'blue-top');
  assert.equal(pending.pending?.type, 'extra-place');
  result = applyTimeout(pending, 'alice', () => 0.2);
  assert.equal(result.pending, null);
  assert.equal(result.currentPlayerId, 'bob');

  game = fixture();
  give(game, ['duck', 'skeleton', 'dino', 'dino', 'dino', 'dino', 'dino', 'dino']);
  result = applyTimeout(game, 'alice', () => 0.2);
  assert.equal(result.currentPlayerId, 'bob');
  const placed = Object.values(result.board).flat();
  assert.equal(placed.length, 1);
  assert.equal(placed[0]!.type, 'skeleton', 'the joker is kept; the cheapest numbered troop goes down');
  assert.equal(result.players[0].hand.length, 7, 'the forced placement never uses the ability');

  assert.equal(applyTimeout(game, 'bob'), game, 'nothing happens when it is not that player\'s clock');
});

test('expansion rooms deal two copies of each new troop and expose the rules in the view', () => {
  const game = createGame(['alice', 'bob'], () => 0.2, ALL_RULES);
  const tiles = [...game.players[0].hand, ...game.players[0].supply];
  assert.equal(tiles.length, 32);
  for (const type of ['ninja', 'sapper', 'knight', 'bomb'] as const) assert.equal(tiles.filter((t) => t.type === type).length, 2);
  assert.deepEqual(getGameView(game, 'alice').rules, ALL_RULES);
  assert.deepEqual(getGameView(fixture(), 'alice').rules, { flank: false, depots: false, expansion: false });
});

test('flank: friends next to the target add to the attack, ducks stay jokers, defenders get nothing', () => {
  const game = fixture({ flank: true });
  const [weak, duck] = give(game, ['skeleton', 'duck']);
  put(game, 'blue-top');
  put(game, 'west-bottom');
  put(game, 'west-top', 'giant', 'bob');
  // blue-top and west-bottom both touch west-top, so the 1-power skeleton attacks at 3 and matches, not beats, the giant.
  assert.equal(attackPower(game, 'alice', weak!, 'west-top'), 3);
  assert.ok(!canPlaceTroop(game, 'alice', weak!, 'west-top'));
  put(game, 'bridge-center');
  assert.equal(attackPower(game, 'alice', weak!, 'west-top'), 4);
  assert.ok(canPlaceTroop(game, 'alice', weak!, 'west-top'));
  assert.ok(canPlaceTroop(game, 'alice', duck!, 'west-top'));
  const plain = fixture();
  const [alone] = give(plain, ['skeleton']);
  put(plain, 'blue-top');
  put(plain, 'west-bottom');
  put(plain, 'bridge-center');
  put(plain, 'west-top', 'giant', 'bob');
  assert.ok(!canPlaceTroop(plain, 'alice', alone!, 'west-top'), 'the printed game ignores neighbours');
});

test('depots: holding a wing bridge draws one extra troop at the start of your turn, within the hand limit', () => {
  const game = fixture({ depots: true });
  give(game, ['duck']);
  put(game, 'bridge-top', 'dino', 'bob');
  game.players[1].hand = [troop('duck', 'bob')];
  game.players[1].supply = [troop('dino', 'bob'), troop('dino', 'bob'), troop('dino', 'bob')];
  const result = applyAction(game, 'alice', { type: 'draw' });
  assert.equal(result.players[1].hand.length, 2);
  assert.ok(result.log.some((entry) => entry.text.includes('보급소')));
  const full = fixture({ depots: true });
  give(full, ['duck']);
  put(full, 'bridge-bottom', 'dino', 'bob');
  give(full, Array<TroopType>(8).fill('duck'), 'bob');
  assert.equal(applyAction(full, 'alice', { type: 'draw' }).players[1].hand.length, 8);
  const centre = fixture({ depots: true });
  give(centre, ['duck']);
  put(centre, 'bridge-center', 'dino', 'bob');
  assert.equal(applyAction(centre, 'alice', { type: 'draw' }).players[1].hand.length, 0, 'the centre bridge is not a depot');
});

test('ninja slips in next to the enemy headquarters without a connection, but never onto it', () => {
  const game = fixture({ expansion: true });
  const [ninja] = give(game, ['ninja']);
  assert.ok(canPlaceTroop(game, 'alice', ninja!, 'red-top'));
  assert.ok(canPlaceTroop(game, 'alice', ninja!, 'blue-top'), 'ordinary placement still works');
  assert.ok(!canPlaceTroop(game, 'alice', ninja!, 'east-top'));
  assert.ok(!canPlaceTroop(game, 'alice', ninja!, 'hq-red'));
  put(game, 'red-top', 'giant', 'bob');
  assert.ok(!canPlaceTroop(game, 'alice', ninja!, 'red-top'), 'power still has to beat the occupant');
});

test('sapper cuts a road, which blocks connections, and a second sapper mends it', () => {
  const game = fixture({ expansion: true });
  put(game, 'blue-top');
  const [sapper, dino] = give(game, ['sapper', 'dino']);
  let result = deploy(game, sapper!, 'west-top');
  assert.equal(result.pending?.type, 'edge');
  assert.ok(result.pending?.nodeIds.includes('bridge-center'));
  assert.ok(!result.pending?.nodeIds.includes('hq-blue'), 'roads into a headquarters are safe');
  result = applyAction(result, 'alice', { type: 'choose', nodeId: 'bridge-center' });
  assert.deepEqual(result.cutEdges, [edgeKey('west-top', 'bridge-center')]);
  assert.ok(!neighbors(result, 'west-top').includes('bridge-center'));
  assert.equal(result.currentPlayerId, 'bob');
  result.currentPlayerId = 'alice';
  assert.ok(!canPlaceTroop(result, 'alice', dino!, 'bridge-center'), 'the cut road no longer carries a connection');
  assert.ok(canPlaceTroop(result, 'alice', dino!, 'drum-nw'));
  const [second] = give(result, ['sapper']);
  let cutMore = deploy(result, second!, 'blue-top');
  assert.equal(cutMore.pending?.type, 'edge');
  assert.ok(cutMore.pending?.nodeIds.includes('west-top'));
  cutMore = applyAction(cutMore, 'alice', { type: 'choose', nodeId: 'west-top' });
  assert.deepEqual(cutMore.cutEdges, [edgeKey('west-top', 'bridge-center'), edgeKey('blue-top', 'west-top')], 'an intact road can be cut too');
  const broken = fixture({ expansion: true });
  put(broken, 'blue-top');
  broken.cutEdges = [edgeKey('west-top', 'bridge-center')];
  const [third] = give(broken, ['sapper']);
  let repaired = deploy(broken, third!, 'west-top');
  assert.ok(repaired.pending?.nodeIds.includes('bridge-center'));
  repaired = applyAction(repaired, 'alice', { type: 'choose', nodeId: 'bridge-center' });
  assert.deepEqual(repaired.cutEdges, [], 'choosing a cut road mends it');
});

test('knight moves one friendly troop next door onto an empty or friendly base and can close a region', () => {
  const game = fixture({ expansion: true });
  put(game, 'blue-top');
  put(game, 'west-top');
  put(game, 'west-bottom');
  put(game, 'east-bottom', 'dino', 'bob');
  const mover = put(game, 'east-top', 'unicorn');
  const [knight] = give(game, ['knight']);
  let result = deploy(game, knight!, 'blue-bottom');
  assert.equal(result.pending?.type, 'move-from');
  assert.ok(result.pending?.nodeIds.includes('east-top'));
  assert.ok(!result.pending?.nodeIds.includes('blue-bottom'), 'the knight itself stays put');
  result = applyAction(result, 'alice', { type: 'choose', nodeId: 'east-top' });
  assert.equal(result.pending?.type, 'move-to');
  assert.equal(result.pending?.sourceNodeId, 'east-top');
  assert.ok(result.pending?.nodeIds.includes('bridge-center'));
  assert.ok(!result.pending?.nodeIds.includes('east-bottom'), 'enemies cannot be moved onto');
  assert.ok(!result.pending?.nodeIds.includes('hq-red'), 'nor a headquarters');
  result = applyAction(result, 'alice', { type: 'choose', nodeId: 'bridge-center' });
  assert.equal(result.board['east-top']!.length, 0);
  assert.equal(result.board['bridge-center']!.at(-1)!.id, mover.id);
  assert.equal(result.claimedRegions.west, 'alice', 'the move completed the west region');
  assert.equal(result.players[0].medals, 3);
  assert.equal(result.currentPlayerId, 'bob');
});

test('bomb destroys whatever steps on it, is defused only by a duck, and may be covered by its owner', () => {
  const game = fixture({ expansion: true });
  put(game, 'blue-top', 'bomb', 'alice');
  put(game, 'red-top', 'dino', 'bob');
  put(game, 'east-top', 'dino', 'bob');
  put(game, 'bridge-top', 'dino', 'bob');
  put(game, 'west-top', 'dino', 'bob');
  game.currentPlayerId = 'bob';
  const [captain, dino, duck] = give(game, ['captain', 'dino', 'duck'], 'bob');
  assert.ok(canPlaceTroop(game, 'bob', dino!, 'blue-top'));
  let result = deploy(game, dino!, 'blue-top');
  assert.equal(result.board['blue-top']!.at(-1)!.type, 'bomb', 'the bomb is still there');
  assert.deepEqual(result.discarded.map((t) => t.id), [dino!.id]);
  assert.equal(result.currentPlayerId, 'alice', 'the failed attack still used the turn');
  const boom = { ...result, currentPlayerId: 'bob' };
  const exploded = deploy(boom, captain!, 'blue-top');
  assert.equal(exploded.pending, null, 'the captain never gets its extra placement');
  assert.equal(exploded.currentPlayerId, 'alice');
  const defused = deploy(boom, duck!, 'blue-top');
  assert.equal(defused.board['blue-top']!.at(-1)!.type, 'duck');
  assert.equal(defused.discarded.filter((t) => t.type === 'bomb').length, 1);
  const own = fixture({ expansion: true });
  put(own, 'blue-top', 'bomb', 'alice');
  const [mine] = give(own, ['skeleton']);
  assert.equal(deploy(own, mine!, 'blue-top').board['blue-top']!.length, 2, 'own troops sit on top safely');
});
