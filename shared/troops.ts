import type { TroopDefinition, TroopType } from './types';

export const TROOPS: Record<TroopType, TroopDefinition> = {
  duck: { type: 'duck', name: '꽉스', power: 0, ability: '어떤 적도 덮어요. 누구에게나 덮일 수 있어요.' },
  skeleton: { type: 'skeleton', name: '해골이', power: 1, ability: '내 병정 2개를 보충해요.' },
  captain: { type: 'captain', name: '캡틴', power: 2, ability: '이번 차례에 병정 하나를 더 놓아요.' },
  giant: { type: 'giant', name: '거인병', power: 3, ability: '길로 맞닿은 적 병정 하나를 제거해요.' },
  pirate: { type: 'pirate', name: '코코 선장', power: 4, ability: '본부와 이어지지 않은 거점에도 놓을 수 있어요.' },
  robot: { type: 'robot', name: 'XB-42', power: 5, ability: '상대의 뒷면 손패 하나를 골라 상대 병정 더미로 되돌려요.' },
  unicorn: { type: 'unicorn', name: '레인보우', power: 6, ability: '내 병정 1개를 보충해요.' },
  dino: { type: 'dino', name: '렉시', power: 7, ability: '가장 강한 병정. 꽉스는 조심하세요.' },
  ninja: { type: 'ninja', name: '그림자', power: 2, ability: '본부와 이어지지 않아도 상대 본부 옆 거점에 놓을 수 있어요.', expansion: true },
  sapper: { type: 'sapper', name: '공병', power: 2, ability: '맞닿은 길 하나를 끊거나, 끊긴 길을 다시 이어요. 본부에 붙은 길은 못 끊어요.', expansion: true },
  knight: { type: 'knight', name: '기사', power: 5, ability: '판 위의 내 병정 하나를 옆 거점으로 옮겨요. 빈 거점이나 내 거점으로만 갈 수 있어요.', expansion: true },
  bomb: { type: 'bomb', name: '폭탄', power: 1, ability: '상대가 덮으면 그 병정이 터져 버려지고 폭탄은 남아요. 꽉스만 폭탄을 해체해요.', expansion: true },
};

export const TROOP_TYPES = Object.keys(TROOPS) as TroopType[];
export const BASE_TROOP_TYPES = TROOP_TYPES.filter((type) => !TROOPS[type].expansion);
export const EXPANSION_TROOP_TYPES = TROOP_TYPES.filter((type) => TROOPS[type].expansion);

/** Attaches 로/으로: no final consonant or ㄹ takes 로, anything else 으로. */
export function withDirectionParticle(word: string): string {
  const last = word.trimEnd().at(-1) ?? '';
  const code = last.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) {
    const final = (code - 0xac00) % 28;
    return `${word}${final === 0 || final === 8 ? '로' : '으로'}`;
  }
  return `${word}로`;
}

/** Attaches 과/와 the same way, for "A와 B 사이". */
export function withAndParticle(word: string): string {
  const last = word.trimEnd().at(-1) ?? '';
  const code = last.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return `${word}${(code - 0xac00) % 28 === 0 ? '와' : '과'}`;
  return `${word}과`;
}

/** Attaches 을/를 by the final syllable, so a log line reads "렉시를" and "캡틴을" rather than one particle for both. */
export function withObjectParticle(word: string): string {
  const last = word.trimEnd().at(-1) ?? '';
  const code = last.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return `${word}${(code - 0xac00) % 28 === 0 ? '를' : '을'}`;
  if (/[0-9]/u.test(last)) return `${word}${'2459'.includes(last) ? '를' : '을'}`;
  return `${word}을`;
}
