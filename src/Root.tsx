import { useCallback, useEffect, useState } from 'react';
import App from './App';
import Hub from './Hub';
import LostCities from './LostCities';
import Hanamikoji from './hanamikoji/Hanamikoji';
import { lazy, Suspense } from 'react';
// three.js is big; only the 3D game pulls it in.
const Santorini = lazy(() => import('./santorini/Santorini'));

export type GameId = 'toy-battle' | 'lost-cities' | 'hanamikoji' | 'santorini';
const PATHS: Record<GameId, string> = { 'toy-battle': '/toy-battle', 'lost-cities': '/lost-cities', hanamikoji: '/hanamikoji', santorini: '/santorini' };

function routeFromLocation(): GameId | null {
  const path = window.location.pathname.replace(/\/+$/u, '');
  const found = (Object.keys(PATHS) as GameId[]).find(id => PATHS[id] === path);
  if (found) return found;
  // Invite links from before the game picker existed pointed at the root with ?room=.
  if (new URLSearchParams(window.location.search).has('room')) return 'toy-battle';
  return null;
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
  if (game === 'toy-battle') return <App onHome={() => open(null)} />;
  if (game === 'lost-cities') return <LostCities onHome={() => open(null)} />;
  if (game === 'hanamikoji') return <Hanamikoji onHome={() => open(null)} />;
  if (game === 'santorini') return <Suspense fallback={<div className="hub-loading">섬으로 가는 중…</div>}><Santorini onHome={() => open(null)} /></Suspense>;
  return <Hub onOpen={open} />;
}
