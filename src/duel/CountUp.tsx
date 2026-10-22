import { useEffect, useState } from 'react';

const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** 결과창 숫자를 0부터 차오르게 보여 준다. 움직임 줄이기를 켠 사람에게는 바로 최종값. */
export default function CountUp({ value, delayMs = 0, durationMs = 700 }: { value: number; delayMs?: number; durationMs?: number }) {
  const [shown, setShown] = useState(() => (reduceMotion() ? value : 0));
  useEffect(() => {
    if (reduceMotion() || value === 0) { setShown(value); return; }
    let frame = 0;
    const start = performance.now() + delayMs;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / durationMs));
      setShown(Math.round(value * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    setShown(0);
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, delayMs, durationMs]);
  return <span className="duel-count" aria-label={String(value)}>{shown}</span>;
}
