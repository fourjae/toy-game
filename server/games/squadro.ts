import { applySquadroAction, createSquadro, getSquadroView, type SQAction, type SQState, type SQView } from '../../shared/squadro.js';
import { actionFail, record, smallInt, type DuelGame } from '../duel.js';

export type SQOptions = Record<string, never>;

function cleanAction(value: unknown): SQAction {
  const input = record(value);
  if (input.type === 'move') return { type: 'move', lane: smallInt(input.lane, 0, 4) };
  return actionFail();
}

export const squadroGame: DuelGame<SQState, SQAction, SQView, SQOptions> = {
  namespace: '/squadro',
  defaultTitle: name => `${name}의 호수`,
  defaultOptions: {},
  cleanOptions: () => ({}),
  create: (ids, rng) => createSquadro(ids, rng),
  cleanAction,
  apply: (state, playerId, action) => applySquadroAction(state, playerId, action),
  view: getSquadroView,
  status: state => state.status,
};
