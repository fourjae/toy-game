import assert from 'node:assert/strict';
import test from 'node:test';
import { applyAction, canPlaceTroop, connectedNodes, createGame, getGameView, neighbors } from '../shared/engine.js';
import { CASTLE_MAP, GAME_MAPS, adjacency, getMap } from '../shared/map.js';
import type { GameMap, GameState, Troop, TroopType } from '../shared/types.js';

const rng = () => 0.2;

/** Blue's road from headquarters up to the base just before the one each test targets. */
function setup(mapId: string, path: string[]): GameState {
  const game = createGame(['alice', 'bob'], rng, undefined, mapId);
  for (const nodeId of path) game.board[nodeId]!.push({ id: `path-${nodeId}`, type: 'duck', ownerId: 'alice' });
  return game;
}

function troop(type: TroopType, id = `test-${type}`): Troop {
  return { id, type, ownerId: 'alice' };
}

test('eight selectable maps have valid roads, unique nodes, scoring regions and headquarters', () => {
  assert.equal(GAME_MAPS.length, 8);
  assert.equal(new Set(GAME_MAPS.map(map => map.id)).size, 8);
  for (const map of GAME_MAPS) {
    const ids = new Set(map.nodes.map(node => node.id));
    assert.equal(ids.size, map.nodes.length, map.name);
    const roadKeys = map.edges.map(([a, b]) => [a, b].sort().join('|'));
    assert.equal(new Set(roadKeys).size, roadKeys.length, `${map.name} lists a road twice`);
    for (const region of map.regions) assert.ok(region.nodeIds.length >= 3 && region.medals >= 1, `${map.name} ${region.id}`);
    assert.ok(map.regions.reduce((sum, region) => sum + region.medals, 0) >= map.medalTarget, `${map.name} cannot reach the medal target`);
    for (const depot of map.depots) assert.ok(ids.has(depot), `${map.name} depot ${depot}`);
    assert.deepEqual(map.nodes.filter(node => node.kind === 'hq').map(node => node.ownerIndex).sort(), map.id === 'caribbean-sea' ? [0, 0, 1] : [0, 1], map.name);
    for (const [a, b] of map.edges) { assert.ok(ids.has(a)); assert.ok(ids.has(b)); }
    const roads = adjacency(map);
    const reachable = new Set(['hq-blue']);
    const queue = ['hq-blue'];
    for (let i = 0; i < queue.length; i++) for (const next of roads[queue[i]!] ?? []) if (!reachable.has(next)) { reachable.add(next); queue.push(next); }
    assert.equal(reachable.size, map.nodes.length, `${map.name} has a disconnected base`);
    for (const region of map.regions) for (const id of region.nodeIds) assert.ok(ids.has(id));
    assert.equal(map.medalTarget, 7);
    const game = createGame(['alice', 'bob'], rng, undefined, map.id);
    assert.equal(getGameView(game, 'alice').mapId, map.id);
    assert.equal(Object.keys(game.board).length, map.nodes.length);
    assert.ok(neighbors(game, 'hq-blue').length > 0);
    assert.equal(getMap(map.id), map);
  }
});

test('every map has its own board rather than a recolored castle field', () => {
  const roads = (map: GameMap) => new Set(map.edges.map(([a, b]) => [a, b].sort().join('|')));
  for (const map of GAME_MAPS) {
    if (map.id === CASTLE_MAP.id) continue;
    const shared = [...roads(map)].filter(key => roads(CASTLE_MAP).has(key));
    assert.ok(shared.length <= 2, `${map.name} reuses ${shared.length} castle roads`);
    assert.ok(map.nodes.filter(node => node.kind !== 'hq').every(node => !CASTLE_MAP.nodes.some(base => base.id === node.id)), `${map.name} reuses castle bases`);
  }
  const shapes = GAME_MAPS.map(map => JSON.stringify(map.nodes.map(node => [node.x, node.y])));
  assert.equal(new Set(shapes).size, GAME_MAPS.length, 'two maps share a layout');
});

test('Caribbean Sea connects blue from either headquarters and both are enemy win targets', () => {
  const game = createGame(['alice', 'bob'], rng, undefined, 'caribbean-sea');
  const connected = connectedNodes(game, 'alice');
  assert.ok(connected.has('hq-blue'));
  assert.ok(connected.has('hq-blue-south'));
  assert.equal(canPlaceTroop(game, 'alice', troop('skeleton'), 'pier-north'), true);
  assert.equal(canPlaceTroop(game, 'alice', troop('skeleton'), 'pier-south'), true);
  assert.equal(canPlaceTroop(game, 'alice', troop('skeleton'), 'hq-blue-south'), false);

  const redPath = ['fort-south', 'isle-se', 'isle-s', 'pier-south'];
  for (const nodeId of redPath) game.board[nodeId]!.push({ id: `red-${nodeId}`, type: 'duck', ownerId: 'bob' });
  game.currentPlayerId = 'bob';
  game.players[1].hand = [{ id: 'red-attacker', type: 'dino', ownerId: 'bob' }];
  const won = applyAction(game, 'bob', { type: 'place', troopId: 'red-attacker', nodeId: 'hq-blue-south', useAbility: false }, rng);
  assert.equal(won.status, 'finished');
  assert.equal(won.winnerId, 'bob');
  assert.equal(won.winReason, 'headquarters');
});

test('Battlefield freezes a blind opponent hand slot for exactly their next turn', () => {
  const game = setup('battlefield', ['line-w-top']);
  game.players[0].hand = [troop('dino')];
  const placed = applyAction(game, 'alice', { type: 'place', troopId: 'test-dino', nodeId: 'trench-nw', useAbility: false }, rng);
  assert.equal(placed.pending?.type, 'map-freeze-card');
  assert.deepEqual(placed.pending?.troopIds, game.players[1].hand.map((_, index) => `slot-${index}`));
  const selected = applyAction(placed, 'alice', { type: 'choose-card', troopId: 'slot-1' }, rng);
  const frozen = selected.players[1].hand[1]!;
  assert.ok(getGameView(selected, 'bob').frozenTroopIds.includes(frozen.id));
  assert.equal(getGameView(selected, 'alice').frozenTroopIds.length, 0);
  assert.equal(canPlaceTroop(selected, 'bob', frozen, 'line-e-top'), false);
  const afterBob = applyAction(selected, 'bob', { type: 'draw' }, rng);
  assert.equal(afterBob.frozenTroops.length, 0);
});

test('Tropical Pool checks printed strength on marked island bases', () => {
  const game = setup('tropical-pool', ['deck-west-top']);
  assert.equal(canPlaceTroop(game, 'alice', troop('giant'), 'island-1'), false);
  assert.equal(canPlaceTroop(game, 'alice', troop('skeleton'), 'island-1'), true);
  assert.equal(canPlaceTroop(game, 'alice', troop('duck'), 'island-1'), true);
  assert.equal(canPlaceTroop(game, 'alice', troop('giant'), 'poolside-nw'), true, 'the pool edge takes anyone');
});

test('City of Clouds draws one troop when a cloud base is occupied', () => {
  const game = setup('city-of-clouds', []);
  game.players[0].hand = [troop('dino')];
  const reserve = game.players[0].supply.length;
  const next = applyAction(game, 'alice', { type: 'place', troopId: 'test-dino', nodeId: 'cloud-nw', useAbility: false }, rng);
  assert.equal(next.players[0].supply.length, reserve - 1);
  assert.equal(next.players[0].hand.length, 1);
});

test('Cursed Cemetery returns a chosen own discarded troop to hand', () => {
  const game = setup('cursed-cemetery', ['path-s1']);
  game.players[0].hand = [troop('dino')];
  game.discarded.push(troop('giant', 'discarded-giant'));
  const placed = applyAction(game, 'alice', { type: 'place', troopId: 'test-dino', nodeId: 'grave-west', useAbility: false }, rng);
  assert.equal(placed.pending?.type, 'map-recover-discard');
  const recovered = applyAction(placed, 'alice', { type: 'choose-card', troopId: 'discarded-giant' }, rng);
  assert.ok(recovered.players[0].hand.some(card => card.id === 'discarded-giant'));
  assert.ok(!recovered.discarded.some(card => card.id === 'discarded-giant'));
});

test('Volcanic Jungle can push an adjacent enemy to another neighboring base', () => {
  const game = setup('volcanic-jungle', ['trail-w1', 'trail-w4']);
  game.players[0].hand = [troop('dino')];
  game.board['crater']!.push({ id: 'enemy', type: 'unicorn', ownerId: 'bob' });
  const placed = applyAction(game, 'alice', { type: 'place', troopId: 'test-dino', nodeId: 'lava-nw', useAbility: false }, rng);
  assert.equal(placed.pending?.type, 'map-jungle-from');
  const selected = applyAction(placed, 'alice', { type: 'choose', nodeId: 'crater' }, rng);
  assert.equal(selected.pending?.type, 'map-jungle-to');
  const moved = applyAction(selected, 'alice', { type: 'choose', nodeId: 'canopy-n' }, rng);
  assert.equal(moved.board['crater']!.length, 0);
  assert.equal(moved.board['canopy-n']!.at(-1)?.id, 'enemy');
});

test('Station Metal-X suppresses a troop ability on a metal base', () => {
  const game = setup('station-metal-x', ['dock-nw']);
  game.players[0].hand = [troop('skeleton')];
  const reserve = game.players[0].supply.length;
  const next = applyAction(game, 'alice', { type: 'place', troopId: 'test-skeleton', nodeId: 'metal-west' }, rng);
  assert.equal(next.players[0].supply.length, reserve);
  const open = setup('station-metal-x', ['dock-nw']);
  open.players[0].hand = [troop('skeleton')];
  assert.equal(applyAction(open, 'alice', { type: 'place', troopId: 'test-skeleton', nodeId: 'ring-n1' }, rng).players[0].supply.length, reserve - 2, 'ordinary corridors keep the ability');
});
