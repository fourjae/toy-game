import { useEffect, useRef } from 'react';
import { Flag, LockKeyhole } from 'lucide-react';
import type { GameView } from '../../shared/types';
import './OpponentHand.css';

interface Props {
  cards: GameView['opponentHand'];
  color: 'blue' | 'red';
  choosing: boolean;
  selectableSlots: string[];
  busy: boolean;
  onChoose: (slot: string) => void;
}

export default function OpponentHand({ cards, color, choosing, selectableSlots, busy, onChoose }: Props) {
  const rack = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!choosing) return;
    rack.current?.scrollIntoView({ block: 'nearest' });
    rack.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
  }, [choosing]);

  return <section ref={rack} className={`opponent-hand opponent-hand--${color} ${choosing ? 'is-choosing' : ''}`} aria-label="상대 손패">
    <div className="opponent-hand-label"><strong>상대 손 <span>{cards.length} / 8</span></strong><span role="status">{choosing ? '효과를 적용할 뒷면 한 장을 눌러 주세요' : '상대 카드의 정체는 보이지 않아요'}</span></div>
    <div className="opponent-hand-rack">
      {cards.map((card, index) => {
        const face = <><Flag size={22} aria-hidden="true" /><span className="opponent-card-number">{index + 1}</span>{card.frozen && <span className="opponent-card-lock"><LockKeyhole size={13} aria-hidden="true" />봉쇄</span>}</>;
        const label = `상대 ${index + 1}번째 손패${card.frozen ? ', 봉쇄됨' : ', 뒷면'}`;
        return choosing ? <button key={card.slot} type="button" className={`opponent-card ${card.frozen ? 'is-frozen' : ''}`} aria-label={`${label}, 선택하기`} disabled={busy || !selectableSlots.includes(card.slot)} onClick={() => onChoose(card.slot)}>{face}</button>
          : <div key={card.slot} className={`opponent-card ${card.frozen ? 'is-frozen' : ''}`} role="img" aria-label={label}>{face}</div>;
      })}
      {!cards.length && <span className="opponent-hand-empty">상대 손이 비었어요</span>}
    </div>
  </section>;
}
