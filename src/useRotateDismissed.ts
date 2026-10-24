import { useCallback, useState } from 'react';

/**
 * 가로 폰 '세로로 돌려 주세요' 안내를 '이대로 할게요'로 닫았는지. 예전엔 화면 상태에만 있어서
 * 새로고침·재접속·다음 매치마다 다시 떴다. 같은 탭(sessionStorage) 안에서는 게임마다 한 번만 묻는다.
 */
export function useRotateDismissed(game: string): [boolean, () => void] {
  const key = `rotate.dismissed.${game}`;
  const [dismissed, setDismissed] = useState(() => {
    try { return window.sessionStorage.getItem(key) === '1'; } catch { return false; }
  });
  const dismiss = useCallback(() => {
    setDismissed(true);
    try { window.sessionStorage.setItem(key, '1'); } catch { /* 저장이 막힌 브라우저면 이번 화면에서만 닫힘 */ }
  }, [key]);
  return [dismissed, dismiss];
}
