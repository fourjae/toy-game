import {
  applyHanamikojiAction, createHanamikoji, getHanamikojiView, startNextHanamikojiRound,
  type HMAction, type HMState, type HMView,
} from '../../shared/hanamikoji.js';
import { actionFail, record, smallInt, stringList, type DuelGame } from '../duel.js';

export type HMOptions = Record<string, never>;

function cleanAction(value: unknown): HMAction {
  const input = record(value);
  switch (input.type) {
    case 'secret': case 'tradeoff': case 'gift':
      return { type: input.type, cardIds: stringList(input.cardIds, 1, 3) };
    case 'competition': {
      const groups = input.groups;
      if (!Array.isArray(groups) || groups.length !== 2) return actionFail();
      return { type: 'competition', groups: [stringList(groups[0], 2, 2), stringList(groups[1], 2, 2)] };
    }
    case 'choose': return { type: 'choose', index: smallInt(input.index, 0, 2) };
    default: return actionFail();
  }
}

export const hanamikojiGame: DuelGame<HMState, HMAction, HMView, HMOptions> = {
  namespace: '/hanamikoji',
  defaultTitle: name => `${name}의 찻집`,
  defaultOptions: {},
  cleanOptions: () => ({}),
  create: (ids, rng) => createHanamikoji(ids, rng),
  cleanAction,
  apply: (state, playerId, action) => applyHanamikojiAction(state, playerId, action),
  view: getHanamikojiView,
  status: state => state.status,
  nextRound: startNextHanamikojiRound,
};
