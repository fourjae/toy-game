import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { LCView } from '../shared/lostCities';

interface Spot { rect: DOMRect; zone: string; clone: HTMLElement }

const FLIGHT_MS = 560;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function snapshot(root: HTMLElement) {
  const spots = new Map<string, Spot>();
  root.querySelectorAll<HTMLElement>('[data-card-id]').forEach(el => {
    const clone = el.cloneNode(true) as HTMLElement;
    clone.style.opacity = '';
    spots.set(el.dataset.cardId!, { rect: el.getBoundingClientRect(), zone: el.dataset.zone ?? '', clone });
  });
  return spots;
}

interface Launch {
  /** The size the node is laid out at; its contents never stretch. */
  natural: DOMRect;
  /** Where the node's centre starts, and how much smaller than natural it starts. */
  center: { x: number; y: number };
  scale: number;
}

const centerOf = (rect: DOMRect) => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });

/** Puts `node` on top of the table, flies it to `to`, then hands over to the real element. */
function fly(root: HTMLElement, node: HTMLElement, launch: Launch, to: DOMRect, target: HTMLElement | null, delay = 0, back = false) {
  const ghost = node;
  ghost.removeAttribute('data-card-id');
  ghost.classList.add('lc-ghost');
  if (back) ghost.classList.add('is-back');
  const { natural, center, scale: startScale } = launch;
  Object.assign(ghost.style, {
    left: `${center.x - natural.width / 2}px`, top: `${center.y - natural.height / 2}px`,
    width: `${natural.width}px`, height: `${natural.height}px`,
  });
  // Card faces size themselves from --hh, which the ghost no longer inherits from its old column.
  ghost.style.setProperty('--hh', `${natural.height}px`);
  root.appendChild(ghost);
  if (target) target.style.opacity = '0';
  const end = centerOf(to);
  const dx = end.x - center.x;
  const dy = end.y - center.y;
  const endScale = to.height / natural.height;
  // A short hop upward gives the card an arc instead of a straight slide.
  const lift = Math.min(60, Math.max(18, Math.hypot(dx, dy) * 0.18));
  const tilt = dx >= 0 ? 5 : -5;
  const animation = ghost.animate([
    { transform: `translate(0,0) scale(${startScale}) rotate(0)`, opacity: 1, offset: 0 },
    { transform: `translate(${dx * 0.5}px,${dy * 0.5 - lift}px) scale(${(startScale + endScale) / 2 + 0.1}) rotate(${tilt}deg)`, opacity: 1, offset: 0.5 },
    { transform: `translate(${dx}px,${dy}px) scale(${endScale}) rotate(0)`, opacity: 1, offset: 1 },
  ], { duration: FLIGHT_MS, delay, easing: 'cubic-bezier(.25,.8,.3,1)', fill: 'both' });
  const land = () => {
    ghost.remove();
    if (!target?.isConnected) return;
    target.style.opacity = '';
    // A little thump as it settles, like a card hitting the table.
    target.animate([{ transform: 'scale(1.14)' }, { transform: 'scale(1)' }], { duration: 160, easing: 'ease-out' });
  };
  animation.addEventListener('finish', land, { once: true });
  animation.addEventListener('cancel', land, { once: true });
}

/** A card that travels at its own size, starting from where it sat. */
const fromSpot = (rect: DOMRect): Launch => ({ natural: rect, center: centerOf(rect), scale: 1 });
/** A card that grows out of a smaller thing, like the deck or the opponent's hand. */
const fromAnchor = (natural: DOMRect, anchor: DOMRect): Launch => ({ natural, center: centerOf(anchor), scale: anchor.height / natural.height });

function backGhost(size: DOMRect) {
  const el = document.createElement('span');
  el.className = 'lc-back';
  el.innerHTML = '<i></i>';
  Object.assign(el.style, { width: `${size.width}px`, height: `${size.height}px` });
  return el;
}

/**
 * FLIP-style card movement for the table. After every update it compares where each card sits now with where
 * it sat before: a card that changed zone flies from its old spot, a card that just appeared flies in from the
 * deck (mine) or from the opponent's hand, and a card that was taken from a discard pile flies to its taker.
 * Returns the ids the opponent just put down, so they can be marked until my next move.
 */
export function useCardFlight(rootRef: RefObject<HTMLElement | null>, view: LCView, meId: string) {
  const before = useRef<Map<string, Spot>>(new Map());
  const lastView = useRef<LCView | null>(null);
  const [recent, setRecent] = useState<string[]>([]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const spots = snapshot(root);
    const previous = before.current;
    const lastSeen = lastView.current;
    before.current = spots;
    lastView.current = view;
    if (lastSeen && lastSeen.revision === view.revision) return;
    const prevView = lastSeen ?? view;
    const animate = !reducedMotion();
    const anchor = (name: string) => root.querySelector<HTMLElement>(`[data-anchor="${name}"]`)?.getBoundingClientRect();
    const deck = anchor('deck');
    const oppHand = anchor('opp-hand');
    const fresh: string[] = [];
    let drawIndex = 0;

    for (const [id, now] of spots) {
      const el = root.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(id)}"]`)!;
      const old = previous.get(id);
      if (old && old.zone === now.zone) {
        // Same zone: only the hand reshuffles when a drawn card slides in among the others.
        const moved = Math.abs(old.rect.left - now.rect.left) > 2 || Math.abs(old.rect.top - now.rect.top) > 2;
        if (animate && moved && now.zone === 'hand') {
          el.animate([{ transform: `translate(${old.rect.left - now.rect.left}px,${old.rect.top - now.rect.top}px)` }, { transform: 'none' }], { duration: 320, easing: 'ease-out' });
        }
        continue;
      }
      const mineNow = now.zone === 'hand' || now.zone.startsWith('mine-');
      if (!old && !mineNow && lastSeen) fresh.push(id);
      if (!animate) continue;
      if (old) {
        fly(root, old.clone, fromSpot(old.rect), now.rect, el);
      } else if (now.zone === 'hand' && deck) {
        // Whole new hands (a fresh round) deal out one by one.
        fly(root, now.clone, fromAnchor(now.rect, deck), now.rect, el, drawIndex++ * 70);
      } else if (!mineNow && oppHand) {
        fly(root, now.clone, fromAnchor(now.rect, oppHand), now.rect, el);
      }
    }

    if (animate) {
      // A card the opponent picked up from a discard pile leaves the table toward their hand.
      const stillThere = new Set(spots.keys());
      const taken = new Set(Object.values(prevView.discards).flat().map(card => card.id));
      for (const site of Object.values(view.discards)) for (const card of site) taken.delete(card.id);
      for (const [id, old] of previous) {
        if (stillThere.has(id) || !taken.has(id) || view.hand.some(card => card.id === id) || !oppHand) continue;
        if (old.zone.startsWith('pile-') && view.currentPlayerId === meId) fly(root, old.clone, fromSpot(old.rect), oppHand, null);
      }
      // The opponent drew from the deck: a card back slides over to their hand.
      if (deck && oppHand && view.deckCount < prevView.deckCount && view.currentPlayerId === meId && view.round === prevView.round) {
        const back = backGhost(deck);
        fly(root, back, fromSpot(deck), oppHand, null, 0, true);
      }
    }

    // The opponent's cards stay marked through their whole turn and until I finish mine.
    const myTurnEnded = prevView.currentPlayerId === meId && view.currentPlayerId !== meId;
    if (view.round !== prevView.round || myTurnEnded) setRecent(fresh);
    else if (fresh.length) setRecent(current => [...current, ...fresh]);
  }, [view, meId, rootRef]);

  return recent;
}
