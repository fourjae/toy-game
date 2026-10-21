import { applyJaipurAction, createJaipur, getJaipurView, startNextJaipurRound, type JPAction, type JPState, type JPView } from '../../shared/jaipur.js';
import { actionFail, record, smallInt, stringList, type DuelGame } from '../duel.js';

export type JPOptions = Record<string, never>;

function cleanAction(value: unknown): JPAction {
  const input = record(value);
  switch (input.type) {
    case 'take': if (typeof input.marketId === 'string' && input.marketId.length <= 64) return { type: 'take', marketId: input.marketId }; return actionFail();
    case 'camels': return { type: 'camels' };
    case 'exchange': return { type: 'exchange', marketIds: stringList(input.marketIds, 2, 5), handIds: stringList(input.handIds, 0, 5), camels: smallInt(input.camels, 0, 5) };
    case 'sell': return { type: 'sell', cardIds: stringList(input.cardIds, 1, 7) };
    default: return actionFail();
  }
}

export const jaipurGame: DuelGame<JPState, JPAction, JPView, JPOptions> = {
  namespace: '/jaipur',
  defaultTitle: name => `${name}의 가게`,
  defaultOptions: {},
  cleanOptions: () => ({}),
  create: (ids, rng) => createJaipur(ids, rng),
  cleanAction,
  apply: (state, playerId, action) => applyJaipurAction(state, playerId, action),
  view: getJaipurView,
  status: state => state.status,
  nextRound: startNextJaipurRound,
};
