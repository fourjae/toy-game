import { ArrowRight, Clock3, Lock, Users } from 'lucide-react';
import ToyIcon from './components/ToyIcon';
import type { GameId } from './Root';

const EMPTY_SLOTS = 6;

function LostCitiesArt() {
  return <svg viewBox="0 0 120 80" aria-hidden="true" className="hub-art-lc">
    <path d="M0 80V52l22-24 16 16 20-30 22 34 14-12 26 26v18z" fill="#7d2315" />
    <path d="M0 80V62l18-14 14 12 24-26 26 30 12-8 26 24v0z" fill="#a33320" />
    <path d="M58 14l8 12h-16z" fill="#fff4e0" opacity=".85" />
    <circle cx="96" cy="18" r="9" fill="#f7b24a" />
    <path d="M24 20c6-2 10 2 9 8-6 2-10-2-9-8zM80 36c5-3 10 0 10 6-6 3-10 0-10-6z" fill="#e8742d" />
  </svg>;
}

function HanamikojiArt() {
  return <svg viewBox="0 0 120 80" aria-hidden="true">
    <circle cx="94" cy="20" r="11" fill="#fbe3b5" />
    <path d="M0 80V50l18-10 18 10v30zM40 80V44l22-12 22 12v36zM86 80V52l17-9 17 9v28z" fill="#3a2843" />
    {[14, 52, 70, 100].map((x, i) => <g key={x}><path d={`M${x} ${20 + (i % 2) * 6}v6`} stroke="#2a1d1a" strokeWidth="1" /><ellipse cx={x} cy={33 + (i % 2) * 6} rx="6" ry="8" fill="#f0603c" /><ellipse cx={x} cy={33 + (i % 2) * 6} rx="3" ry="5" fill="#ffd58a" opacity=".7" /></g>)}
    <path d="M30 22c3-1 5 1 4 4-3 1-5-1-4-4zM80 12c3-1 5 1 4 4-3 1-5-1-4-4z" fill="#f6b7c8" />
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
        <button type="button" className="hub-card hub-card--hanamikoji" onClick={() => onOpen('hanamikoji')}>
          <span className="hub-card-art"><HanamikojiArt /></span>
          <span className="hub-card-body">
            <strong>하나미코지</strong>
            <small>네 가지 행동으로 일곱 게이샤의 호감을 얻어요</small>
            <span className="hub-card-meta"><span><Users size={13} /> 2인</span><span><Clock3 size={13} /> 약 15분</span></span>
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
