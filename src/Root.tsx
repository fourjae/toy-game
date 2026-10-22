import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import Hub from './Hub';

// 게임 화면은 들어갈 때만 받는다. 첫 화면(허브)은 가볍게 뜨고, three.js 같은 큰 묶음은 산토리니에서만 받는다.
const App = lazy(() => import('./App'));
const LostCities = lazy(() => import('./LostCities'));
const Hanamikoji = lazy(() => import('./hanamikoji/Hanamikoji'));
const Santorini = lazy(() => import('./santorini/Santorini'));
const Squadro = lazy(() => import('./squadro/Squadro'));
const Jaipur = lazy(() => import('./jaipur/Jaipur'));

export type GameId = 'toy-battle' | 'lost-cities' | 'hanamikoji' | 'santorini' | 'squadro' | 'jaipur';
const PATHS: Record<GameId, string> = { 'toy-battle': '/toy-battle', 'lost-cities': '/lost-cities', hanamikoji: '/hanamikoji', santorini: '/santorini', squadro: '/squadro', jaipur: '/jaipur' };
const LOADING: Record<GameId, string> = {
  'toy-battle': '성채 평원으로 가는 중…', 'lost-cities': '탐험 준비 중…', hanamikoji: '꽃길 골목으로 가는 중…',
  santorini: '섬으로 가는 중…', squadro: '호수로 가는 중…', jaipur: '분홍 도시로 가는 중…',
};

function routeFromLocation(): GameId | null {
  const path = window.location.pathname.replace(/\/+$/u, '');
  const found = (Object.keys(PATHS) as GameId[]).find(id => PATHS[id] === path);
  if (found) return found;
  // Invite links from before the game picker existed pointed at the root with ?room=.
  if (new URLSearchParams(window.location.search).has('room')) return 'toy-battle';
  return null;
}

function Screen({ game, onHome }: { game: GameId; onHome: () => void }) {
  switch (game) {
    case 'toy-battle': return <App onHome={onHome} />;
    case 'lost-cities': return <LostCities onHome={onHome} />;
    case 'hanamikoji': return <Hanamikoji onHome={onHome} />;
    case 'santorini': return <Santorini onHome={onHome} />;
    case 'squadro': return <Squadro onHome={onHome} />;
    case 'jaipur': return <Jaipur onHome={onHome} />;
  }
}

/** A handful of tiny routes; the server answers every GET with index.html, so plain paths survive a refresh. */
export default function Root() {
  const [game, setGame] = useState<GameId | null>(routeFromLocation);
  useEffect(() => {
    const onPop = () => setGame(routeFromLocation());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const open = useCallback((next: GameId | null) => {
    // Leaving a game drops its ?room= so the invite does not fire again.
    window.history.pushState({}, '', next ? PATHS[next] : '/');
    setGame(next);
  }, []);
  const home = useCallback(() => open(null), [open]);
  if (!game) return <Hub onOpen={open} />;
  return (
    <Suspense fallback={<div className="hub-loading">{LOADING[game]}</div>}>
      <Screen game={game} onHome={home} />
    </Suspense>
  );
}
