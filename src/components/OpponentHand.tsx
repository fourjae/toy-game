import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Flag, LockKeyhole } from 'lucide-react';
import type { GameView } from '../../shared/types';
import { TROOPS } from '../../shared/troops';
import Dialog from './Dialog';
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
  const [showDiscard, setShowDiscard] = useState(false);
  useEffect(() => {
    if (!choosing) return;
    rack.current?.scrollIntoView({ block: 'nearest' });
    rack.current?.querySelector<HTMLButtonElement>('.opponent-card:not(:disabled)')?.focus({ preventScroll: true });
  }, [choosing]);

  const lastDiscarded = discarded.at(-1);
  return <>
    <section ref={rack} className={`opponent-hand opponent-hand--${color} ${choosing ? 'is-choosing' : ''}`} aria-label="상대 손패">
      <div className="opponent-hand-label"><strong>상대 손 <span>{cards.length} / 8</span></strong><span role="status">{choosing ? '효과를 적용할 뒷면 한 장을 눌러 주세요' : '상대 카드의 정체는 보이지 않아요'}</span><button type="button" className={`discard-hud ${lastDiscarded ? `has-card ${discardedColor}` : ''}`} aria-label={`공용 버림 더미 ${discarded.length}장, 내용 보기`} aria-haspopup="dialog" title="공용 버림 더미 내용 보기" onClick={() => setShowDiscard(true)}><span className="discard-hud-card">{lastDiscarded ? <ToyIcon type={lastDiscarded.type} color={discardedColor} size={22} /> : <Flag size={14} />}</span><span><small>공용 버림</small><b>{discarded.length}</b></span></button></div>
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
    </section>
    {showDiscard && <Dialog title="공용 버림 더미" onClose={() => setShowDiscard(false)}><p className="muted">{discarded.length ? `버려진 병정 ${discarded.length}개예요. 가장 최근에 버려진 병정부터 보여요.` : '아직 공용 버림 더미에 병정이 없어요.'}</p>{discarded.length > 0 && <div className="stack-list">{[...discarded].reverse().map(troop => <div key={troop.id}><ToyIcon type={troop.type} color="blue" size={44} /><span>{TROOPS[troop.type].name}<small>{TROOPS[troop.type].power ? `힘 ${TROOPS[troop.type].power}` : '조커'}</small></span><strong>{TROOPS[troop.type].power || '★'}</strong></div>)}</div>}</Dialog>}
  </>;
}
