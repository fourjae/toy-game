import { useCallback, useEffect, useState } from 'react';
import App from './App';
import Hub from './Hub';
import LostCities from './LostCities';

export type GameId = 'toy-battle' | 'lost-cities';
const PATHS: Record<GameId, string> = { 'toy-battle': '/toy-battle', 'lost-cities': '/lost-cities' };

function routeFromLocation(): GameId | null {
  const path = window.location.pathname.replace(/\/+$/u, '');
  if (path === PATHS['lost-cities']) return 'lost-cities';
  if (path === PATHS['toy-battle']) return 'toy-battle';
  // Invite links from before the game picker existed pointed at the root with ?room=.
  if (new URLSearchParams(window.location.search).has('room')) return 'toy-battle';
  return null;
}

/** Three tiny routes; the server answers every GET with index.html, so plain paths survive a refresh. */
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
  return <Hub onOpen={open} />;
}
