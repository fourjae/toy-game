import type { TroopType } from '../../shared/types'
import './TroopPortrait.css'

/**
 * Full character art is reserved for cards and roomy UI surfaces. Board pieces
 * keep using ToyIcon so blue/red ownership remains unmistakable at small sizes.
 */
const TROOP_ART: Record<TroopType, string> = {
  duck: '/assets/troops/duck.png',
  skeleton: '/assets/troops/skeleton.png',
  captain: '/assets/troops/captain.png',
  giant: '/assets/troops/giant.png',
  pirate: '/assets/troops/pirate.png',
  robot: '/assets/troops/robot.png',
  unicorn: '/assets/troops/unicorn.png',
  dino: '/assets/troops/dino.png',
  ninja: '/assets/troops/ninja.png',
  sapper: '/assets/troops/sapper.png',
  knight: '/assets/troops/knight.png',
  bomb: '/assets/troops/bomb.png',
}

export function TroopPortrait({ type, className = '' }: { type: TroopType; className?: string }) {
  return <img className={`troop-portrait ${className}`} src={TROOP_ART[type]} alt="" aria-hidden="true" draggable={false} />
}

export default TroopPortrait
