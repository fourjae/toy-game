import { ArrowRight, Clock3, Lock, Users } from 'lucide-react';
import ToyIcon from './components/ToyIcon';
import type { GameId } from './Root';

const EMPTY_SLOTS = 7;

function LostCitiesArt() {
  return <svg viewBox="0 0 120 80" aria-hidden="true" className="hub-art-lc">
    <path d="M0 80V52l22-24 16 16 20-30 22 34 14-12 26 26v18z" fill="#7d2315" />
    <path d="M0 80V62l18-14 14 12 24-26 26 30 12-8 26 24v0z" fill="#a33320" />
    <path d="M58 14l8 12h-16z" fill="#fff4e0" opacity=".85" />
    <circle cx="96" cy="18" r="9" fill="#f7b24a" />
    <path d="M24 20c6-2 10 2 9 8-6 2-10-2-9-8zM80 36c5-3 10 0 10 6-6 3-10 0-10-6z" fill="#e8742d" />
  </svg>;
}

export default function Hub({ onOpen }: { onOpen: (game: GameId) => void }) {
  return <div className="hub">
    <header className="hub-header page-width">
      <div className="brand"><span className="brand-mark"><i /><i /><i /></span><span>작은 놀이터<span className="brand-caption">TWO PLAYER GAMES</span></span></div>
      <p>둘이서 즐기는 게임 모음</p>
    </header>
    <main className="hub-main page-width">
      <div className="hub-heading">
        <span className="eyebrow"><span className="tiny-line" /> 오늘의 게임</span>
        <h1>어떤 판을 <span className="serif-word">펼칠까요?</span></h1>
      </div>
      <div className="hub-grid">
        <button type="button" className="hub-card hub-card--toy" onClick={() => onOpen('toy-battle')}>
          <span className="hub-card-art"><ToyIcon type="captain" size={64} color="blue" /><ToyIcon type="duck" size={64} color="red" /></span>
          <span className="hub-card-body">
            <strong>토이 배틀</strong>
            <small>병정을 놓고 길을 이어 성을 차지해요</small>
            <span className="hub-card-meta"><span><Users size={13} /> 2인</span><span><Clock3 size={13} /> 약 15분</span></span>
          </span>
          <ArrowRight className="hub-card-go" size={18} />
        </button>
        <button type="button" className="hub-card hub-card--lost" onClick={() => onOpen('lost-cities')}>
          <span className="hub-card-art"><LostCitiesArt /></span>
          <span className="hub-card-body">
            <strong>로스트 시티</strong>
            <small>다섯 유적지를 탐험하는 카드 게임</small>
            <span className="hub-card-meta"><span><Users size={13} /> 2인</span><span><Clock3 size={13} /> 약 20분</span></span>
          </span>
          <ArrowRight className="hub-card-go" size={18} />
        </button>
        {Array.from({ length: EMPTY_SLOTS }, (_, index) => <div key={index} className="hub-card hub-card--empty" aria-hidden="true">
          <Lock size={18} /><span>준비 중</span>
        </div>)}
      </div>
    </main>
  </div>;
}
