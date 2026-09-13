export type TroopType = 'duck' | 'skeleton' | 'captain' | 'giant' | 'pirate' | 'robot' | 'unicorn' | 'dino' | 'ninja' | 'sapper' | 'knight' | 'bomb';

/** Optional rules chosen when a room is created. All off is the printed game. */
export interface GameRules {
  /** An attacker adds one power for each of its own troops on a base adjacent to the target. */
  flank: boolean;
  /** Holding a supply depot at the start of your turn draws one extra troop. */
  depots: boolean;
  /** Ninja, sapper, knight and bomb join each army, two copies each. */
  expansion: boolean;
}

export interface TroopDefinition {
  type: TroopType;
  name: string;
  power: number;
  ability: string;
  /** Only dealt when the expansion rule is on. */
  expansion?: boolean;
}

export interface Troop {
  id: string;
  type: TroopType;
  ownerId: string;
}

export interface MapNode {
  id: string;
  label: string;
  x: number;
  y: number;
  kind: 'base' | 'special' | 'hq';
  ownerIndex?: 0 | 1;
}

export interface MapRegion {
  id: string;
  nodeIds: string[];
  medals: number;
  x: number;
  y: number;
}

export interface GameMap {
  id: string;
  name: string;
  width: number;
  height: number;
  medalTarget: number;
  nodes: MapNode[];
  edges: [string, string][];
  regions: MapRegion[];
  /** Bases that act as supply depots when that rule is on. */
  depots: string[];
}

export type GameAction =
  | { type: 'draw' }
  | { type: 'place'; troopId: string; nodeId: string; useAbility?: boolean }
  | { type: 'choose'; nodeId: string }
  | { type: 'skip' };

export interface PendingEffect {
  /** edge: pick a neighbour to cut or restore the road to it. move-from/move-to: the knight's relocation. */
  type: 'remove' | 'recover' | 'extra-place' | 'edge' | 'move-from' | 'move-to';
  sourceNodeId: string;
  sourceTroopId: string;
  nodeIds: string[];
}

export interface GameLog {
  id: number;
  turn: number;
  playerId: string;
  text: string;
}

export type WinReason = 'headquarters' | 'medals' | 'no-moves' | 'forfeit';

export interface GamePlayer {
  id: string;
  hand: Troop[];
  supply: Troop[];
  medals: number;
}

export interface GameState {
  rules: GameRules;
  players: [GamePlayer, GamePlayer];
  board: Record<string, Troop[]>;
  /** Roads the sapper has cut, as "a|b" keys with the ids in map order. */
  cutEdges: string[];
  claimedRegions: Record<string, string | null>;
  discarded: Troop[];
  currentPlayerId: string;
  firstPlayerId: string;
  turn: number;
  revision: number;
  status: 'playing' | 'finished';
  winnerId: string | null;
  winReason: WinReason | null;
  pending: PendingEffect | null;
  deferredSpecials: { sourceNodeId: string; sourceTroopId: string }[];
  log: GameLog[];
}

export interface GameView {
  mapId: string;
  rules: GameRules;
  cutEdges: string[];
  players: { id: string; index: 0 | 1; handCount: number; supplyCount: number; medals: number }[];
  hand: Troop[];
  board: Record<string, Troop[]>;
  claimedRegions: Record<string, string | null>;
  discarded: Troop[];
  currentPlayerId: string;
  firstPlayerId: string;
  turn: number;
  revision: number;
  status: 'playing' | 'finished';
  winnerId: string | null;
  winReason: WinReason | null;
  pending: PendingEffect | null;
  legalPlacements: Record<string, string[]>;
  canDraw: boolean;
  log: GameLog[];
}
