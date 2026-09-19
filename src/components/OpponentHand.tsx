import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { Flag, LockKeyhole } from 'lucide-react';
import type { GameView } from '../../shared/types';
import { ToyIcon } from './ToyIcon';
import './OpponentHand.css';

interface Props {
  cards: GameView['opponentHand'];
  color: 'blue' | 'red';
  choosing: boolean;
  selectableSlots: string[];
  busy: boolean;
  onChoose: (slot: string) => void;
  discarded: GameView['discarded'];
  discardedColor: 'blue' | 'red';
}

export default function OpponentHand({ cards, color, choosing, selectableSlots, busy, onChoose, discarded, discardedColor }: Props) {
  const rack = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!choosing) return;
    rack.current?.scrollIntoView({ block: 'nearest' });
    rack.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
  }, [choosing]);

  const lastDiscarded = discarded.at(-1);
  return <section ref={rack} className={`opponent-hand opponent-hand--${color} ${choosing ? 'is-choosing' : ''}`} aria-label="상대 손패">
    <div className="opponent-hand-label"><strong>상대 손 <span>{cards.length} / 8</span></strong><span role="status">{choosing ? '효과를 적용할 뒷면 한 장을 눌러 주세요' : '상대 카드의 정체는 보이지 않아요'}</span><span className={`discard-hud ${lastDiscarded ? `has-card ${discardedColor}` : ''}`} aria-label={`공용 버림 더미 ${discarded.length}장`} title="양쪽 플레이어가 함께 쓰는 공용 버림 더미"><span className="discard-hud-card">{lastDiscarded ? <ToyIcon type={lastDiscarded.type} color={discardedColor} size={22} /> : <Flag size={14} />}</span><span><small>공용 버림</small><b>{discarded.length}</b></span></span></div>
    <div className="opponent-hand-rack">
      {cards.map((card, index) => {
        const face = <><Flag size={22} aria-hidden="true" /><span className="opponent-card-number">{index + 1}</span>{card.frozen && <span className="opponent-card-lock"><LockKeyhole size={13} aria-hidden="true" />봉쇄</span>}</>;
        const label = `상대 ${index + 1}번째 손패${card.frozen ? ', 봉쇄됨' : ', 뒷면'}`;
        const offset = index - (cards.length - 1) / 2;
        const fan = { '--fan-angle': `${offset * 2.1}deg`, '--fan-drop': `${7 + Math.abs(offset) * 1.4}px` } as CSSProperties;
        return choosing ? <button key={card.slot} type="button" className={`opponent-card ${card.frozen ? 'is-frozen' : ''}`} style={fan} aria-label={`${label}, 선택하기`} disabled={busy || !selectableSlots.includes(card.slot)} onClick={() => onChoose(card.slot)}>{face}</button>
          : <div key={card.slot} className={`opponent-card ${card.frozen ? 'is-frozen' : ''}`} style={fan} role="img" aria-label={label}>{face}</div>;
      })}
      {!cards.length && <span className="opponent-hand-empty">상대 손이 비었어요</span>}
    </div>
  </section>;
}
