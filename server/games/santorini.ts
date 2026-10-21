import { applySantoriniAction, createSantorini, getSantoriniView, type STAction, type STState, type STView } from '../../shared/santorini.js';
import { actionFail, record, smallInt, type DuelGame } from '../duel.js';

export type STOptions = Record<string, never>;

function cleanAction(value: unknown): STAction {
  const input = record(value);
  if (input.type === 'place') return { type: 'place', cell: smallInt(input.cell, 0, 24) };
  if (input.type === 'move') return { type: 'move', worker: smallInt(input.worker, 0, 1), to: smallInt(input.to, 0, 24) };
  if (input.type === 'build') return { type: 'build', cell: smallInt(input.cell, 0, 24) };
  return actionFail();
}

export const santoriniGame: DuelGame<STState, STAction, STView, STOptions> = {
  namespace: '/santorini',
  defaultTitle: name => `${name}의 섬`,
  defaultOptions: {},
  cleanOptions: () => ({}),
  create: (ids, rng) => createSantorini(ids, rng),
  cleanAction,
  apply: (state, playerId, action) => applySantoriniAction(state, playerId, action),
  view: getSantoriniView,
  status: state => state.status,
};
