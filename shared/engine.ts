import { CASTLE_MAP, GAME_MAPS, adjacency, edgeKey, getMap, nodeIndex } from './map';
import { BASE_TROOP_TYPES, EXPANSION_TROOP_TYPES, TROOPS, TROOP_TYPES, withAndParticle, withDirectionParticle, withObjectParticle } from './troops';
import type { GameAction, GamePlayer, GameRules, GameState, GameView, Troop, TroopType, WinReason } from './types';

export { CASTLE_MAP } from './map';
export { TROOPS, TROOP_TYPES } from './troops';

export const DEFAULT_RULES: GameRules = { flank: false, depots: false, expansion: false };
export type * from './types';

type Random = () => number;
const mapOf = (game: Pick<GameState, 'mapId'>) => getMap(game.mapId);
const nodesOf = (game: Pick<GameState, 'mapId'>) => nodeIndex(mapOf(game));
const roadsOf = (game: Pick<GameState, 'mapId'>) => adjacency(mapOf(game));
const matchesNodePower = (game: Pick<GameState, 'mapId'>, troop: Troop, nodeId: string) => {
  const required = nodesOf(game)[nodeId]?.requiredPower;
  return required === undefined || troop.type === 'duck' || TROOPS[troop.type].power === required;
};
const HAND_LIMIT = 8;
/** Thinking time per decision. The server enforces it; the client only displays it. */
export const TURN_SECONDS = 50;

function secureRandom(): number {
  return globalThis.crypto.getRandomValues(new Uint32Array(1))[0]! / 0x100000000;
}

function randomIndex(length: number, rng: Random): number {
  const value = rng();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('난수는 0 이상 1 미만이어야 합니다.');
  return Math.floor(value * length);
}

function shuffled<T>(values: T[], rng: Random): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1, rng);
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

function player(game: GameState, id: string): GamePlayer {
  const found = game.players.find((candidate) => candidate.id === id);
  if (!found) throw new Error('이 게임의 참가자가 아닙니다.');
  return found;
}

function opponent(game: GameState, id: string): GamePlayer {
  return game.players.find((candidate) => candidate.id !== id)!;
}

function addLog(game: GameState, playerId: string, text: string): void {
  game.log.push({ id: (game.log.at(-1)?.id ?? 0) + 1, turn: game.turn, playerId, text });
  if (game.log.length > 80) game.log.splice(0, game.log.length - 80);
}

function addEvent(game: GameState, playerId: string, event: Omit<GameState['events'][number], 'id' | 'turn' | 'playerId'>): void {
  game.events.push({ id: (game.events.at(-1)?.id ?? 0) + 1, turn: game.turn, playerId, ...event });
  if (game.events.length > 40) game.events.splice(0, game.events.length - 40);
}

export function topTroop(game: Pick<GameState, 'board'>, nodeId: string): Troop | undefined {
  return game.board[nodeId]?.at(-1);
}

export function troopPower(troop: Troop): number {
  return TROOPS[troop.type].power;
}

export function createGame(playerIds: [string, string], rng: Random = secureRandom, rules: GameRules = DEFAULT_RULES, mapId = CASTLE_MAP.id): GameState {
  if (playerIds.length !== 2 || !playerIds[0] || !playerIds[1] || playerIds[0] === playerIds[1]) {
    throw new Error('서로 다른 두 명이 있어야 게임을 시작할 수 있습니다.');
  }
  if (!GAME_MAPS.some(map => map.id === mapId)) throw new Error('선택한 맵을 찾을 수 없습니다.');
  const selectedMap = getMap(mapId);
  const firstIndex = randomIndex(2, rng);
  const players = playerIds.map((id, index): GamePlayer => {
    const roster = [...BASE_TROOP_TYPES.map((type) => [type, 3] as const), ...(rules.expansion ? EXPANSION_TROOP_TYPES.map((type) => [type, 2] as const) : [])];
    const troops = roster.flatMap(([type, copies]) => Array.from({ length: copies }, (_, copy) => ({
      id: `${index}-${type}-${copy}`, type, ownerId: id,
    })));
    // Four unseen tiles never enter the state or a player's view.
    const supply = shuffled(troops, rng).slice(4);
    const hand = supply.splice(0, index === firstIndex ? 3 : 4);
    return { id, hand, supply, medals: 0 };
  }) as [GamePlayer, GamePlayer];
  const game: GameState = {
    mapId,
    rules: { ...DEFAULT_RULES, ...rules },
    players,
    board: Object.fromEntries(selectedMap.nodes.map((node) => [node.id, []])),
    cutEdges: [],
    claimedRegions: Object.fromEntries(selectedMap.regions.map((region) => [region.id, null])),
    discarded: [],
    currentPlayerId: playerIds[firstIndex]!,
    firstPlayerId: playerIds[firstIndex]!,
    turn: 1,
    revision: 0,
    status: 'playing',
    winnerId: null,
    winReason: null,
    pending: null,
    deferredSpecials: [],
    frozenTroops: [],
    events: [],
    log: [],
  };
  addLog(game, game.currentPlayerId, '선공으로 시작합니다.');
  return game;
}

/** Live adjacency: the printed roads minus whatever the sapper has cut. */
export function neighbors(game: Pick<GameState, 'cutEdges' | 'mapId'>, nodeId: string): string[] {
  const cut = game.cutEdges;
  const roads = roadsOf(game)[nodeId] ?? [];
  return cut.length ? roads.filter((other) => !cut.includes(edgeKey(nodeId, other, mapOf(game)))) : roads;
}

/** Bases connected by an uninterrupted chain of this player's visible troops. */
export function connectedNodes(game: GameState, playerId: string): Set<string> {
  const index = game.players.findIndex((candidate) => candidate.id === playerId);
  if (index === -1) return new Set();
  const headquarters = mapOf(game).nodes.filter((node) => node.kind === 'hq' && node.ownerIndex === index);
  const connected = new Set(headquarters.map(node => node.id));
  const queue = headquarters.map(node => node.id);
  for (let i = 0; i < queue.length; i++) {
    for (const neighbor of neighbors(game, queue[i]!)) {
      if (!connected.has(neighbor) && topTroop(game, neighbor)?.ownerId === playerId) {
        connected.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  return connected;
}

export function canPlaceTroop(game: GameState, playerId: string, troop: Troop, nodeId: string): boolean {
  const node = nodesOf(game)[nodeId];
  if (!node || troop.ownerId !== playerId) return false;
  if (game.frozenTroops.some(frozen => frozen.troopId === troop.id && frozen.ownerId === playerId)) return false;
  if (!matchesNodePower(game, troop, nodeId)) return false;
  const ownIndex = game.players.findIndex((candidate) => candidate.id === playerId);
  if (ownIndex < 0 || (node.kind === 'hq' && node.ownerIndex === ownIndex)) return false;
  const occupant = topTroop(game, nodeId);
  if (occupant && occupant.ownerId !== playerId && troop.type !== 'duck' && occupant.type !== 'duck'
      && attackPower(game, playerId, troop, nodeId) <= troopPower(occupant)) return false;
  if (troop.type === 'pirate' && node.kind !== 'hq') return true;
  if (troop.type === 'ninja' && node.kind !== 'hq' && neighbors(game, nodeId).some((other) => nodesOf(game)[other]!.kind === 'hq' && nodesOf(game)[other]!.ownerIndex !== ownIndex)) return true;
  const connected = connectedNodes(game, playerId);
  return neighbors(game, nodeId).some((neighbor) => connected.has(neighbor));
}

/** With the flank rule, friends on the bases around the target lend the attacker their weight. */
export function attackPower(game: GameState, playerId: string, troop: Troop, nodeId: string): number {
  const base = troopPower(troop);
  if (!game.rules.flank) return base;
  return base + neighbors(game, nodeId).filter((other) => nodesOf(game)[other]!.kind !== 'hq' && topTroop(game, other)?.ownerId === playerId).length;
}

function holdsDepot(game: GameState, playerId: string): boolean {
  return game.rules.depots && mapOf(game).depots.some((nodeId) => topTroop(game, nodeId)?.ownerId === playerId);
}

/** Where the knight may send a troop standing on `from`: next door, and not onto an enemy or a headquarters. */
function knightDestinations(game: GameState, playerId: string, from: string): string[] {
  const mover = topTroop(game, from);
  return neighbors(game, from).filter((to) => {
    const occupant = topTroop(game, to);
    return mover && matchesNodePower(game, mover, to) && nodesOf(game)[to]!.kind !== 'hq' && (!occupant || occupant.ownerId === playerId);
  });
}

function placements(game: GameState, playerId: string): Record<string, string[]> {
  return Object.fromEntries(player(game, playerId).hand.map((troop) => [
    troop.id, mapOf(game).nodes.filter((node) => canPlaceTroop(game, playerId, troop, node.id)).map((node) => node.id),
  ]));
}

function canDraw(game: GameState, playerId: string): boolean {
  const current = player(game, playerId);
  return current.hand.length < HAND_LIMIT && current.supply.length > 0;
}

function drawTroops(game: GameState, playerId: string, count: number): void {
  const current = player(game, playerId);
  const drawn = current.supply.splice(0, Math.min(count, HAND_LIMIT - current.hand.length));
  current.hand.push(...drawn);
  if (drawn.length) addLog(game, playerId, `병정 ${drawn.length}개를 보충했습니다.`);
}

function finish(game: GameState, winnerId: string, reason: WinReason): void {
  game.status = 'finished';
  game.winnerId = winnerId;
  game.winReason = reason;
  game.pending = null;
  game.deferredSpecials = [];
  addLog(game, winnerId, reason === 'headquarters' ? '상대 본부를 점령했습니다!'
    : reason === 'medals' ? '훈장 7개를 모아 승리했습니다!'
      : '더 진행할 수 없어 훈장 수로 승부를 결정했습니다.');
}

/** Region ownership is awarded immediately, including after a buried tile reappears. */
function awardMedals(game: GameState): void {
  for (const region of mapOf(game).regions) {
    if (game.claimedRegions[region.id]) continue;
    const ownerId = topTroop(game, region.nodeIds[0]!)?.ownerId;
    if (!ownerId || !region.nodeIds.every((nodeId) => topTroop(game, nodeId)?.ownerId === ownerId)) continue;
    game.claimedRegions[region.id] = ownerId;
    player(game, ownerId).medals += region.medals;
    addLog(game, ownerId, `영토를 확보해 훈장 ${region.medals}개를 얻었습니다.`);
    if (player(game, ownerId).medals >= mapOf(game).medalTarget) {
      finish(game, ownerId, 'medals');
      return;
    }
  }
}

function nextTurn(game: GameState, rng: Random): void {
  if (game.status === 'finished') return;
  const endingPlayerId = game.currentPlayerId;
  game.frozenTroops = game.frozenTroops.filter(frozen => frozen.ownerId !== endingPlayerId);
  game.currentPlayerId = opponent(game, endingPlayerId).id;
  game.turn += 1;
  if (holdsDepot(game, game.currentPlayerId) && canDraw(game, game.currentPlayerId)) {
    const current = player(game, game.currentPlayerId);
    current.hand.push(current.supply.shift()!);
    addLog(game, game.currentPlayerId, '보급소에서 병정 1개를 받았습니다.');
  }
  if (!canDraw(game, game.currentPlayerId) && !Object.values(placements(game, game.currentPlayerId)).some((nodes) => nodes.length > 0)) {
    const current = player(game, game.currentPlayerId);
    const other = opponent(game, game.currentPlayerId);
    finish(game, current.medals > other.medals ? current.id : other.id, 'no-moves');
  }
}

function recoverableNodes(game: GameState, sourceTroopId: string): string[] {
  if (player(game, game.currentPlayerId).hand.length >= HAND_LIMIT) return [];
  return mapOf(game).nodes.filter((node) => {
    const troop = topTroop(game, node.id);
    return node.kind !== 'hq' && troop?.ownerId === game.currentPlayerId && troop.id !== sourceTroopId;
  }).map((node) => node.id);
}

function chooseMapCard(game: GameState, playerId: string, troopId: string, rng: Random): void {
  const pending = game.pending;
  if (pending?.type === 'map-freeze-card') {
    if (!pending.troopIds?.includes(troopId)) throw new Error('표시된 뒷면 손패 중에서 골라 주세요.');
    const index = Number(troopId.slice('slot-'.length));
    const victim = opponent(game, playerId);
    const target = victim.hand[index];
    if (!target) throw new Error('그 손패는 더는 선택할 수 없습니다.');
    game.frozenTroops.push({ troopId: target.id, ownerId: victim.id });
    addLog(game, playerId, '참호에서 상대 손패 한 장을 다음 차례까지 묶었습니다.');
    game.pending = null;
    settle(game, rng);
    return;
  }
  if (pending?.type !== 'map-recover-discard' || !pending.troopIds?.includes(troopId)) throw new Error('묘지에서 데려올 병정을 골라 주세요.');
  const index = game.discarded.findIndex(troop => troop.id === troopId && troop.ownerId === playerId);
  if (index < 0 || player(game, playerId).hand.length >= HAND_LIMIT) throw new Error('그 병정은 손으로 데려올 수 없습니다.');
  const troop = game.discarded.splice(index, 1)[0]!;
  player(game, playerId).hand.push(troop);
  addEvent(game, playerId, { type: 'return-to-hand', troop });
  addLog(game, playerId, `묘지에서 ${withObjectParticle(TROOPS[troop.type].name)} 데려왔습니다.`);
  game.pending = null;
  settle(game, rng);
}

function settle(game: GameState, rng: Random): void {
  if (game.status === 'finished' || game.pending) return;
  // Captain chains finish every troop effect before any of the drum effects.
  while (game.deferredSpecials.length) {
    const source = game.deferredSpecials.shift()!;
    if (game.mapId === 'castle-field') {
      const nodeIds = recoverableNodes(game, source.sourceTroopId);
      if (nodeIds.length) { game.pending = { type: 'recover', ...source, nodeIds }; return; }
    } else if (game.mapId === 'city-of-clouds') {
      drawTroops(game, game.currentPlayerId, 1);
    } else if (game.mapId === 'cursed-cemetery') {
      const current = player(game, game.currentPlayerId);
      const troopIds = current.hand.length >= HAND_LIMIT ? [] : game.discarded.filter(troop => troop.ownerId === current.id).map(troop => troop.id);
      if (troopIds.length) { game.pending = { type: 'map-recover-discard', ...source, nodeIds: [], troopIds }; return; }
    } else if (game.mapId === 'volcanic-jungle') {
      const nodeIds = neighbors(game, source.sourceNodeId).filter(nodeId => topTroop(game, nodeId)?.ownerId === opponent(game, game.currentPlayerId).id);
      if (nodeIds.length) { game.pending = { type: 'map-jungle-from', ...source, nodeIds }; return; }
    } else if (game.mapId === 'battlefield') {
      const victim = opponent(game, game.currentPlayerId);
      const troopIds = victim.hand.map((_, index) => `slot-${index}`);
      if (troopIds.length) { game.pending = { type: 'map-freeze-card', ...source, nodeIds: [], troopIds }; return; }
    }
  }
  nextTurn(game, rng);
}

function placeTroop(game: GameState, playerId: string, action: Extract<GameAction, { type: 'place' }>, rng: Random): void {
  const current = player(game, playerId);
  const handIndex = current.hand.findIndex((troop) => troop.id === action.troopId);
  const troop = current.hand[handIndex];
  if (!troop) throw new Error('내 손에 있는 병정을 선택해 주세요.');
  if (!canPlaceTroop(game, playerId, troop, action.nodeId)) throw new Error('그곳에는 이 병정을 놓을 수 없습니다.');
  current.hand.splice(handIndex, 1);
  const node = nodesOf(game)[action.nodeId]!;
  const occupant = topTroop(game, action.nodeId);
  if (occupant?.type === 'bomb' && occupant.ownerId !== playerId) {
    if (troop.type === 'duck') {
      // The joker walks in, snips the fuse, and takes the base.
      game.board[action.nodeId]!.pop();
      game.discarded.push(occupant);
      addLog(game, playerId, `${node.label}의 폭탄을 꽉스가 해체했습니다.`);
    } else {
      // Anything else sets it off: the attacker is gone before its ability could matter.
      game.discarded.push(troop);
      addLog(game, playerId, `${node.label}의 폭탄이 터져 ${withObjectParticle(TROOPS[troop.type].name)} 잃었습니다.`);
      settle(game, rng);
      return;
    }
  }
  game.board[action.nodeId]!.push(troop);
  addLog(game, playerId, `${node.label}에 ${withObjectParticle(TROOPS[troop.type].name)} 놓았습니다.`);
  if (node.kind === 'hq') {
    finish(game, playerId, 'headquarters');
    return;
  }
  awardMedals(game);
  if (game.status === 'finished') return;
  const source = { sourceNodeId: node.id, sourceTroopId: troop.id };
  if (node.kind === 'special' && !['tropical-pool', 'station-metal-x'].includes(game.mapId)) game.deferredSpecials.push(source);
  if (action.useAbility !== false && !(game.mapId === 'station-metal-x' && node.kind === 'special')) {
    switch (troop.type) {
      case 'skeleton': drawTroops(game, playerId, 2); break;
      case 'unicorn': drawTroops(game, playerId, 1); break;
      case 'robot': {
        const enemy = opponent(game, playerId);
        if (enemy.hand.length) {
          const removed = enemy.hand.splice(randomIndex(enemy.hand.length, rng), 1)[0]!;
          enemy.supply.splice(randomIndex(enemy.supply.length + 1, rng), 0, removed);
          addEvent(game, enemy.id, { type: 'return-to-supply', troop: removed });
          addLog(game, playerId, `상대 손의 ${withObjectParticle(TROOPS[removed.type].name)} 병정 더미로 돌려보냈습니다.`);
        }
        break;
      }
      case 'giant': {
        const nodeIds = neighbors(game, node.id).filter((nodeId) => {
          const target = topTroop(game, nodeId);
          return target && target.ownerId !== playerId;
        });
        if (nodeIds.length) game.pending = { type: 'remove', ...source, nodeIds };
        break;
      }
      case 'sapper': {
        // A cut road can always be mended; an intact one may be cut unless it touches a headquarters.
        const nodeIds = roadsOf(game)[node.id]!.filter((other) =>
          game.cutEdges.includes(edgeKey(node.id, other, mapOf(game))) || (node.kind !== 'hq' && nodesOf(game)[other]!.kind !== 'hq'));
        if (nodeIds.length) game.pending = { type: 'edge', ...source, nodeIds };
        break;
      }
      case 'knight': {
        const nodeIds = mapOf(game).nodes.filter((candidate) => {
          const top = topTroop(game, candidate.id);
          return candidate.kind !== 'hq' && top?.ownerId === playerId && top.id !== troop.id && knightDestinations(game, playerId, candidate.id).length > 0;
        }).map((candidate) => candidate.id);
        if (nodeIds.length) game.pending = { type: 'move-from', ...source, nodeIds };
        break;
      }
      case 'captain': {
        const nodeIds = [...new Set(Object.values(placements(game, playerId)).flat())];
        if (nodeIds.length) game.pending = { type: 'extra-place', ...source, nodeIds };
        break;
      }
    }
  }
  settle(game, rng);
}

function chooseEffect(game: GameState, playerId: string, nodeId: string, rng: Random): void {
  const pending = game.pending;
  if (!pending || pending.type === 'extra-place') throw new Error('지금은 거점을 선택하는 단계가 아닙니다.');
  if (!pending.nodeIds.includes(nodeId)) throw new Error('표시된 거점 중에서 선택해 주세요.');
  if (pending.type === 'map-jungle-from') {
    const target = topTroop(game, nodeId);
    if (!target || target.ownerId === playerId) throw new Error('인접한 적 병정을 골라 주세요.');
    const nodeIds = neighbors(game, pending.sourceNodeId).filter(to => to !== nodeId && nodesOf(game)[to]!.kind !== 'hq');
    if (!nodeIds.length) { game.pending = null; settle(game, rng); return; }
    game.pending = { ...pending, type: 'map-jungle-to', originNodeId: nodeId, sourceTroopId: target.id, nodeIds };
    return;
  }
  if (pending.type === 'map-jungle-to') {
    const from = pending.originNodeId!;
    const target = topTroop(game, from);
    if (!target || target.id !== pending.sourceTroopId) throw new Error('옮길 적 병정이 더는 없습니다.');
    game.board[from]!.pop();
    game.board[nodeId]!.push(target);
    addLog(game, playerId, `용암이 상대 병정을 ${withDirectionParticle(nodesOf(game)[nodeId]!.label)} 밀어냈습니다.`);
    game.pending = null;
    awardMedals(game);
    settle(game, rng);
    return;
  }
  if (pending.type === 'edge') {
    const key = edgeKey(pending.sourceNodeId, nodeId, mapOf(game));
    const wasCut = game.cutEdges.includes(key);
    game.cutEdges = wasCut ? game.cutEdges.filter((other) => other !== key) : [...game.cutEdges, key];
    addLog(game, playerId, `${withAndParticle(nodesOf(game)[pending.sourceNodeId]!.label)} ${nodesOf(game)[nodeId]!.label} 사이 길을 ${wasCut ? '다시 이었습니다' : '끊었습니다'}.`);
    game.pending = null;
    settle(game, rng);
    return;
  }
  if (pending.type === 'move-from') {
    const mover = topTroop(game, nodeId);
    if (mover?.ownerId !== playerId) throw new Error('내 병정을 골라 주세요.');
    const nodeIds = knightDestinations(game, playerId, nodeId);
    if (!nodeIds.length) throw new Error('이 병정은 옮길 곳이 없습니다.');
    game.pending = { type: 'move-to', sourceNodeId: nodeId, sourceTroopId: mover.id, nodeIds };
    return;
  }
  if (pending.type === 'move-to') {
    if (!knightDestinations(game, playerId, pending.sourceNodeId).includes(nodeId)) throw new Error('그곳으로는 옮길 수 없습니다.');
    const mover = game.board[pending.sourceNodeId]!.pop()!;
    game.board[nodeId]!.push(mover);
    addLog(game, playerId, `${withObjectParticle(TROOPS[mover.type].name)} ${withDirectionParticle(nodesOf(game)[nodeId]!.label)} 옮겼습니다.`);
    game.pending = null;
    awardMedals(game);
    settle(game, rng);
    return;
  }
  const target = topTroop(game, nodeId);
  if (!target) throw new Error('선택한 거점에 병정이 없습니다.');
  if (pending.type === 'remove') {
    if (target.ownerId === playerId) throw new Error('상대 병정만 제거할 수 있습니다.');
    game.board[nodeId]!.pop();
    game.discarded.push(target);
    addLog(game, playerId, `${nodesOf(game)[nodeId]!.label}의 ${withObjectParticle(TROOPS[target.type].name)} 제거했습니다.`);
  } else {
    if (!recoverableNodes(game, pending.sourceTroopId).includes(nodeId)) throw new Error('이 병정은 데려올 수 없습니다.');
    game.board[nodeId]!.pop();
    player(game, playerId).hand.push(target);
    addEvent(game, playerId, { type: 'return-to-hand', troop: target, nodeId });
    addLog(game, playerId, `${withObjectParticle(TROOPS[target.type].name)} 손으로 데려왔습니다.`);
  }
  game.pending = null;
  awardMedals(game);
  settle(game, rng);
}

/** The original state remains unchanged on both success and validation failure. */
export function applyAction(original: GameState, playerId: string, action: GameAction, rng: Random = secureRandom): GameState {
  player(original, playerId);
  if (original.status !== 'playing') throw new Error('이미 끝난 게임입니다.');
  if (original.currentPlayerId !== playerId) throw new Error('상대의 차례입니다.');
  if (!action || typeof action !== 'object') throw new Error('올바른 행동을 선택해 주세요.');
  const game = structuredClone(original);
  if (game.pending) {
    if (action.type === 'skip') {
      game.pending = null;
      settle(game, rng);
    } else if (game.pending.type === 'extra-place' && action.type === 'place') {
      game.pending = null;
      placeTroop(game, playerId, action, rng);
    } else if (action.type === 'choose') {
      chooseEffect(game, playerId, action.nodeId, rng);
    } else if (action.type === 'choose-card') {
      chooseMapCard(game, playerId, action.troopId, rng);
    } else {
      throw new Error('먼저 병정의 효과를 마치거나 건너뛰어 주세요.');
    }
  } else if (action.type === 'draw') {
    if (!canDraw(game, playerId)) throw new Error('보충할 병정이 없거나 손에 병정이 8개 있습니다.');
    drawTroops(game, playerId, 2);
    nextTurn(game, rng);
  } else if (action.type === 'place') {
    placeTroop(game, playerId, action, rng);
  } else {
    throw new Error('병정을 보충하거나 거점에 놓아 주세요.');
  }
  game.revision += 1;
  return game;
}

/** The joker (꽉스) is worth keeping, so a forced placement prefers the cheapest numbered troop. */
function forcedPlacementCost(type: TroopType): number {
  return type === 'duck' ? 8 : TROOPS[type].power;
}

/**
 * When the clock runs out: pending effects are skipped, then the player draws if they can;
 * with a full hand or an empty reserve, the weakest troop goes to a random legal base
 * without its ability. Returns the original state when it is not this player's turn.
 */
export function applyTimeout(original: GameState, playerId: string, rng: Random = secureRandom): GameState {
  if (original.status !== 'playing' || original.currentPlayerId !== playerId) return original;
  let game = structuredClone(original);
  addLog(game, playerId, '생각할 시간이 다 되어 자동으로 진행했습니다.');
  let applied = 0;
  for (let step = 0; step < 8 && game.status === 'playing' && game.currentPlayerId === playerId; step++) {
    let action: GameAction;
    if (game.pending) {
      action = { type: 'skip' };
    } else if (canDraw(game, playerId)) {
      action = { type: 'draw' };
    } else {
      const options = placements(game, playerId);
      const troop = [...player(game, playerId).hand]
        .filter((candidate) => options[candidate.id]?.length)
        .sort((a, b) => forcedPlacementCost(a.type) - forcedPlacementCost(b.type))[0];
      if (!troop) break;
      const nodes = options[troop.id]!;
      action = { type: 'place', troopId: troop.id, nodeId: nodes[randomIndex(nodes.length, rng)]!, useAbility: false };
    }
    game = applyAction(game, playerId, action, rng);
    applied += 1;
  }
  return applied ? game : original;
}

export function getGameView(game: GameState, playerId: string): GameView {
  const current = player(game, playerId);
  const myTurn = game.status === 'playing' && game.currentPlayerId === playerId;
  const mayPlace = myTurn && (!game.pending || game.pending.type === 'extra-place');
  // Explicit projection prevents reserves, excluded tiles, or opponent hands from
  // accidentally becoming public when the internal state changes in the future.
  return structuredClone({
    mapId: game.mapId,
    rules: game.rules,
    cutEdges: game.cutEdges,
    players: game.players.map((candidate, index) => ({
      id: candidate.id, index: index as 0 | 1, handCount: candidate.hand.length,
      supplyCount: candidate.supply.length, medals: candidate.medals,
    })),
    hand: current.hand,
    board: game.board,
    claimedRegions: game.claimedRegions,
    discarded: game.discarded,
    currentPlayerId: game.currentPlayerId,
    firstPlayerId: game.firstPlayerId,
    turn: game.turn,
    revision: game.revision,
    status: game.status,
    winnerId: game.winnerId,
    winReason: game.winReason,
    pending: game.pending,
    legalPlacements: mayPlace ? placements(game, playerId) : {},
    canDraw: myTurn && !game.pending && canDraw(game, playerId),
    frozenTroopIds: game.frozenTroops.filter(frozen => frozen.ownerId === playerId).map(frozen => frozen.troopId),
    events: game.events,
    log: game.log,
  });
}

export const act = applyAction;
export const viewGame = getGameView;
