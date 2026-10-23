import { Component, lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from 'react';
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

/**
 * 게임 화면 묶음을 못 받으면(새로 배포돼 옛 파일 이름이 사라졌거나 연결이 끊김) Suspense만으로는 흰 화면이 된다.
 * 그때 다시 불러오기와 첫 화면으로 가는 길을 보여 준다.
 */
class LoadGuard extends Component<{ children: ReactNode; onHome: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <div className="hub-loading hub-load-failed" role="alert">
      <p>게임 화면을 불러오지 못했어요.<br />연결을 확인하고 다시 시도해 주세요.</p>
      <div>
        <button type="button" className="hub-load-retry" onClick={() => window.location.reload()}>다시 불러오기</button>
        <button type="button" className="hub-load-home" onClick={this.props.onHome}>첫 화면으로</button>
      </div>
    </div>;
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
    <LoadGuard key={game} onHome={home}>
      <Suspense fallback={<div className="hub-loading">{LOADING[game]}</div>}>
        <Screen game={game} onHome={home} />
      </Suspense>
    </LoadGuard>
  );
}
