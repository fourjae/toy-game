import { applyOmokAction, CELLS, createOmok, getOmokView, type OMAction, type OMOptions, type OMState, type OMView } from '../../shared/omok.js';
import { actionFail, record, requestFail, smallInt, type DuelGame } from '../duel.js';

function cleanAction(value: unknown): OMAction {
  const input = record(value);
  if (input.type === 'place') return { type: 'place', cell: smallInt(input.cell, 0, CELLS - 1) };
  return actionFail();
}

function cleanOptions(value: unknown): OMOptions {
  const input = record(value);
  if (typeof input.renju !== 'boolean') return requestFail('금수 설정을 확인해 주세요.');
  return { renju: input.renju };
}

export const omokGame: DuelGame<OMState, OMAction, OMView, OMOptions> = {
  namespace: '/omok',
  defaultTitle: name => `${name}의 사랑방`,
  defaultOptions: { renju: false },
  cleanOptions,
  create: (ids, rng, options) => createOmok(ids, rng, options),
  cleanAction,
  apply: (state, playerId, action) => applyOmokAction(state, playerId, action),
  view: getOmokView,
  status: state => state.status,
};
