import { ArrowRight, Clock3, Lock, Users } from 'lucide-react';
import ToyIcon from './components/ToyIcon';
import type { GameId } from './Root';

const EMPTY_SLOTS = 3;

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

function SantoriniArt() {
  return <svg viewBox="0 0 120 80" aria-hidden="true">
    <circle cx="22" cy="18" r="9" fill="#ffd77a" />
    <rect y="56" width="120" height="24" fill="#2f8fc9" />
    <path d="M16 60c10-16 78-16 88 0z" fill="#f4f0e7" />
    <rect x="40" y="36" width="16" height="16" fill="#fff" /><rect x="58" y="26" width="18" height="26" fill="#fff" /><rect x="78" y="38" width="14" height="14" fill="#fff" />
    <path d="M58 26a9 9 0 0 1 18 0z" fill="#2b5cad" /><path d="M78 38a7 7 0 0 1 14 0z" fill="#2b5cad" />
    <rect x="45" y="28" width="6" height="8" rx="3" fill="#e2703a" /><circle cx="48" cy="26" r="3" fill="#e2703a" />
    <path d="M10 68q6-3 12 0t12 0M70 72q6-3 12 0t12 0" stroke="#fff9" strokeWidth="1.4" fill="none" />
  </svg>;
}

function SquadroArt() {
  return <svg viewBox="0 0 120 80" aria-hidden="true">
    <rect x="18" y="6" width="84" height="68" rx="8" fill="#b58552" />
    <rect x="30" y="16" width="60" height="48" rx="3" fill="#2f8e92" />
    {[0, 1, 2, 3].map(i => <line key={i} x1={42 + i * 12} x2={42 + i * 12} y1="16" y2="64" stroke="#ffffff33" />)}
    {[0, 1, 2].map(i => <line key={i} y1={28 + i * 12} y2={28 + i * 12} x1="30" x2="90" stroke="#ffffff33" />)}
    <path d="M48 30c4 4 5 9 5 15 0 3-2 5-5 5s-5-2-5-5c0-6 1-11 5-15z" fill="#f2b632" stroke="#a8740c" />
    <g transform="translate(74 40) rotate(90)"><path d="M0 -10c4 4 5 9 5 15 0 3-2 5-5 5s-5-2-5-5c0-6 1-11 5-15z" fill="#e0533d" stroke="#9e2f1f" /></g>
  </svg>;
}

function JaipurArt() {
  return <svg viewBox="0 0 120 80" aria-hidden="true">
    <circle cx="60" cy="30" r="14" fill="#ffe0a0" />
    <path d="M0 80V44l15-8 15 8 15-12 15 12 15-14 15 14 15-12 15 12v36z" fill="#e47f86" />
    {Array.from({ length: 4 }, (_, r) => Array.from({ length: 10 }, (_, c) => <path key={`${r}${c}`} d={`M${5 + c * 12} ${58 + r * 6}v-3a2.5 2.5 0 0 1 5 0v3z`} fill="#fbe1d4" opacity=".85" />))}
    <g transform="translate(26 18) rotate(-12)"><rect width="16" height="22" rx="3" fill="#d23f4a" stroke="#fff6e8" strokeWidth="1.5" /><path d="M4 9l2-3h4l2 3-4 6z" fill="#fff" /></g>
    <g transform="translate(78 14) rotate(12)"><rect width="16" height="22" rx="3" fill="#e7ac2a" stroke="#fff6e8" strokeWidth="1.5" /><path d="M3 15l2-4h6l2 4z" fill="#fff" /></g>
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
        <button type="button" className="hub-card hub-card--santorini" onClick={() => onOpen('santorini')}>
          <span className="hub-card-art"><SantoriniArt /></span>
          <span className="hub-card-body">
            <strong>산토리니</strong>
            <small>움직이고 지어서 3층에 먼저 올라서는 3D 수싸움</small>
            <span className="hub-card-meta"><span><Users size={13} /> 2인</span><span><Clock3 size={13} /> 약 15분</span></span>
          </span>
          <ArrowRight className="hub-card-go" size={18} />
        </button>
        <button type="button" className="hub-card hub-card--squadro" onClick={() => onOpen('squadro')}>
          <span className="hub-card-art"><SquadroArt /></span>
          <span className="hub-card-body">
            <strong>스쿼드로</strong>
            <small>엇갈리는 물길에서 배 네 척을 먼저 왕복시켜요</small>
            <span className="hub-card-meta"><span><Users size={13} /> 2인</span><span><Clock3 size={13} /> 약 10분</span></span>
          </span>
          <ArrowRight className="hub-card-go" size={18} />
        </button>
        <button type="button" className="hub-card hub-card--jaipur" onClick={() => onOpen('jaipur')}>
          <span className="hub-card-art"><JaipurArt /></span>
          <span className="hub-card-body">
            <strong>자이푸르</strong>
            <small>분홍 도시 시장에서 사고팔아 인장 두 개를 모아요</small>
            <span className="hub-card-meta"><span><Users size={13} /> 2인</span><span><Clock3 size={13} /> 약 25분</span></span>
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
