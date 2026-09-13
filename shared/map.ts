import type { GameMap } from './types';

// Castle Field topology, transcribed from the publisher's setup and region diagrams.
// Coordinates and visual treatment are original; the three bridge bases are not
// connected directly to each other. The two central four-base regions score 2.
export const CASTLE_MAP: GameMap = {
  id: 'castle-field',
  name: '성채 평원',
  width: 1100,
  height: 640,
  medalTarget: 7,
  nodes: [
    { id: 'hq-blue', label: '파랑 본부', x: 110, y: 320, kind: 'hq', ownerIndex: 0 },
    { id: 'blue-top', label: '서쪽 위 관문', x: 110, y: 110, kind: 'base' },
    { id: 'blue-bottom', label: '서쪽 아래 관문', x: 110, y: 530, kind: 'base' },
    { id: 'west-top', label: '서쪽 위 거점', x: 300, y: 220, kind: 'base' },
    { id: 'west-bottom', label: '서쪽 아래 거점', x: 300, y: 420, kind: 'base' },
    { id: 'drum-nw', label: '북서쪽 북', x: 330, y: 90, kind: 'special' },
    { id: 'drum-sw', label: '남서쪽 북', x: 330, y: 550, kind: 'special' },
    { id: 'bridge-top', label: '위쪽 다리', x: 550, y: 110, kind: 'base' },
    { id: 'bridge-center', label: '가운데 다리', x: 550, y: 320, kind: 'base' },
    { id: 'bridge-bottom', label: '아래쪽 다리', x: 550, y: 530, kind: 'base' },
    { id: 'drum-ne', label: '북동쪽 북', x: 770, y: 90, kind: 'special' },
    { id: 'drum-se', label: '남동쪽 북', x: 770, y: 550, kind: 'special' },
    { id: 'east-top', label: '동쪽 위 거점', x: 800, y: 220, kind: 'base' },
    { id: 'east-bottom', label: '동쪽 아래 거점', x: 800, y: 420, kind: 'base' },
    { id: 'red-top', label: '동쪽 위 관문', x: 990, y: 110, kind: 'base' },
    { id: 'red-bottom', label: '동쪽 아래 관문', x: 990, y: 530, kind: 'base' },
    { id: 'hq-red', label: '빨강 본부', x: 990, y: 320, kind: 'hq', ownerIndex: 1 },
  ],
  edges: [
    ['hq-blue', 'blue-top'], ['hq-blue', 'blue-bottom'],
    ['blue-top', 'west-top'], ['blue-bottom', 'west-bottom'],
    ['west-top', 'west-bottom'],
    ['west-top', 'drum-nw'], ['drum-nw', 'bridge-top'],
    ['west-bottom', 'drum-sw'], ['drum-sw', 'bridge-bottom'],
    ['west-top', 'bridge-top'], ['west-top', 'bridge-center'],
    ['west-bottom', 'bridge-center'], ['west-bottom', 'bridge-bottom'],
    ['hq-red', 'red-top'], ['hq-red', 'red-bottom'],
    ['red-top', 'east-top'], ['red-bottom', 'east-bottom'],
    ['east-top', 'east-bottom'],
    ['east-top', 'drum-ne'], ['drum-ne', 'bridge-top'],
    ['east-bottom', 'drum-se'], ['drum-se', 'bridge-bottom'],
    ['east-top', 'bridge-top'], ['east-top', 'bridge-center'],
    ['east-bottom', 'bridge-center'], ['east-bottom', 'bridge-bottom'],
  ],
  regions: [
    { id: 'northwest', nodeIds: ['west-top', 'drum-nw', 'bridge-top'], medals: 1, x: 398, y: 137 },
    { id: 'southwest', nodeIds: ['west-bottom', 'drum-sw', 'bridge-bottom'], medals: 1, x: 398, y: 503 },
    { id: 'west', nodeIds: ['west-top', 'west-bottom', 'bridge-center'], medals: 3, x: 390, y: 320 },
    { id: 'north', nodeIds: ['bridge-top', 'east-top', 'bridge-center', 'west-top'], medals: 2, x: 550, y: 215 },
    { id: 'south', nodeIds: ['bridge-bottom', 'west-bottom', 'bridge-center', 'east-bottom'], medals: 2, x: 550, y: 425 },
    { id: 'northeast', nodeIds: ['east-top', 'drum-ne', 'bridge-top'], medals: 1, x: 702, y: 137 },
    { id: 'southeast', nodeIds: ['east-bottom', 'drum-se', 'bridge-bottom'], medals: 1, x: 702, y: 503 },
    { id: 'east', nodeIds: ['east-top', 'east-bottom', 'bridge-center'], medals: 3, x: 710, y: 320 },
  ],
  // The centre bridge is already the fight for medals; the depots pull play toward the wings.
  depots: ['bridge-top', 'bridge-bottom'],
};

export const edgeKey = (a: string, b: string): string => {
  const [x, y] = CASTLE_MAP.edges.find(([p, q]) => (p === a && q === b) || (p === b && q === a)) ?? [a, b];
  return `${x}|${y}`;
};

export const NODE_BY_ID = Object.fromEntries(CASTLE_MAP.nodes.map((node) => [node.id, node]));
export const ADJACENCY: Record<string, string[]> = Object.fromEntries(
  CASTLE_MAP.nodes.map((node) => [node.id, CASTLE_MAP.edges.flatMap(([a, b]) => a === node.id ? [b] : b === node.id ? [a] : [])]),
);
