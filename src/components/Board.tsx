import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { Expand, Minus, Move, Plus, RectangleHorizontal, RectangleVertical } from 'lucide-react'
import { CASTLE_MAP, GAME_MAPS, edgeKey, getMap } from '../../shared/map'
import { BASE_TROOP_TYPES, TROOPS } from '../../shared/troops'
import type { GameView, Troop } from '../../shared/types'
import { ToyIcon } from './ToyIcon'
import './Board.css'

export type BoardOrientation = 'landscape' | 'portrait'

export interface BoardProps {
  game?: GameView | null
  legalNodes?: string[]
  onNodeClick?: (nodeId: string) => void
  /** Fires on a click that lands on empty field rather than any base — used to cancel a pending choice. */
  onBackgroundClick?: () => void
  selectedNodeId?: string | null
  preview?: boolean
  previewMapId?: string
  className?: string
  /** Portrait stands the field on end so the two headquarters sit top and bottom. */
  orientation?: BoardOrientation
  /** In portrait, this player's headquarters is drawn at the bottom, nearest the viewer. */
  bottomIndex?: 0 | 1
  onToggleOrientation?: () => void
  /** Roads the sapper may cut or mend right now, as [from, to] pairs. */
  highlightEdges?: [string, string][]
}

interface Camera { x: number; y: number; scale: number }
interface Landing { id: number; nodeId: string; troopId: string; captured: string | null; kind: 'drop' | 'capture' | 'smash' }
let landingSerial = 0
interface Point { x: number; y: number }
interface Gesture {
  camera: Camera
  point: Point
  distance: number
  nodeId: string | null
}

const BLUE = '#426987'
const RED = '#b7634c'
const TERRAIN: Record<string, { field: string; lowland: string; riverBank: string; river: string; rim: string }> = {
  castle: { field: '#e5eace', lowland: '#dce4bf', riverBank: '#ccd5b2', river: '#a8c3ba', rim: '#f3eddb' },
  tropical: { field: '#d7ebbb', lowland: '#bce3bc', riverBank: '#a9dbc4', river: '#68c3c8', rim: '#f6ebcf' },
  cloud: { field: '#e9edfb', lowland: '#f8e9f4', riverBank: '#d9e8fb', river: '#b9d9ed', rim: '#f9f2f7' },
  jungle: { field: '#b8c691', lowland: '#718a59', riverBank: '#d9965b', river: '#e76738', rim: '#ead7bd' },
  cemetery: { field: '#cbd2c7', lowland: '#a8b3a6', riverBank: '#b8b2c5', river: '#8f8fa8', rim: '#e8e3e8' },
  station: { field: '#d7e2e6', lowland: '#b4c6d1', riverBank: '#adc5d5', river: '#8caac2', rim: '#e4ebee' },
  caribbean: { field: '#c1e0d9', lowland: '#a5d4ce', riverBank: '#82c3d4', river: '#3f9cbe', rim: '#f5eacf' },
  battlefield: { field: '#e6d7ad', lowland: '#cbb27c', riverBank: '#d5bf92', river: '#ad9973', rim: '#ead9b7' },
}
const STAR = 'M0-10 2.9-3.4 10-3 4.6 1.8 6.1 9-0 5.4-6.1 9-4.6 1.8-10-3-2.9-3.4Z'
// Scenery is placed in the field's own coordinates and projected like the bases, so it stays upright.
const TREES = [
  { fx: .17, fy: .13, size: .9, tone: 0 }, { fx: .205, fy: .17, size: 1.05, tone: 1 }, { fx: .24, fy: .13, size: .72, tone: 0 },
  { fx: .76, fy: .13, size: .85, tone: 1 }, { fx: .8, fy: .17, size: 1.05, tone: 0 }, { fx: .835, fy: .13, size: .75, tone: 1 },
  { fx: .2, fy: .87, size: 1, tone: 0 }, { fx: .235, fy: .91, size: .75, tone: 1 },
  { fx: .765, fy: .9, size: 1, tone: 1 }, { fx: .8, fy: .86, size: .75, tone: 0 },
]
const GRASS = [[.4, .13], [.58, .12], [.39, .87], [.62, .9], [.09, .7], [.91, .7]]
const ROCKS = [[.1, .19], [.9, .78]]

function Tree({ x, y, size = 1, tone = 0 }: { x: number; y: number; size?: number; tone?: number }) {
  return <g transform={`translate(${x} ${y}) scale(${size})`}>
    <ellipse cx="2" cy="20" rx="16" ry="5" fill="#4e6740" opacity=".11" />
    <path d="M-2 6h5v15h-5z" fill="#8f8061" />
    <path d="M-18 3C-27-10-17-23-8-24-11-39 9-44 16-29 32-23 24-8 20-5 23 10 1 18-6 9-12 14-20 10-18 3Z" fill={tone ? '#869764' : '#98a873'} />
    <path d="M-11-21c-8 7-8 15-4 21M6-34c-4 4-5 8-3 11" stroke="#b5c195" strokeWidth="3" strokeLinecap="round" />
    <path d="M1-13V12m0-12-8-6m8-2 9-7" stroke="#5f7750" strokeWidth="1.5" strokeLinecap="round" opacity=".6" />
  </g>
}

function Castle({ color, x, y }: { color: string; x: number; y: number }) {
  const blue = color === BLUE
  return <g transform={`translate(${x} ${y})`}>
    <ellipse cx="0" cy="26" rx="49" ry="10" fill="#536746" opacity=".16" />
    <path d="M-36-24h13v8h12v-8h22v8h12v-8h13v46h-72v-46Z" fill="#f8edcc" stroke="#b4a782" strokeWidth="2" />
    <path d="M-18-39h10v8H8v-8h10v60h-36v-60Z" fill="#f8edcc" stroke="#b4a782" strokeWidth="2" />
    <path d="M-42-26-31-46-20-26h-22Zm62 0L31-46l11 20H20ZM-23-42 0-63l23 21h-46Z" fill={color} stroke={blue ? '#365775' : '#95513e'} strokeWidth="2" strokeLinejoin="round" />
    <path d="M0-63v-22" stroke="#7f795c" strokeWidth="2" />
    <path d="M1-85h22l-5 7 5 7H1v-14Z" fill={color} />
    <path d="M-9 22V7a9 9 0 0 1 18 0v15H-9Z" fill={color} />
    <path d="M-3-23v12H3v-12H-3Zm-31 10v9h6v-9h-6Zm62 0v9h6v-9h-6Z" fill="#867f64" />
    <path d="M-36 8h14M23 8h13M-15-2h9m13-4h9" stroke="#d3c39d" strokeWidth="2" />
    <path d="M-44 22h88v6h-88z" fill="#c5b78e" />
  </g>
}

function Grass({ x, y }: Point) {
  return <path d={`m${x - 5} ${y} -2 -5m7 5 1 -8m3 8 4 -4`} stroke="#849663" strokeWidth="1.8" strokeLinecap="round" opacity=".58" />
}

export function Board({ game, legalNodes = [], onNodeClick, onBackgroundClick, selectedNodeId, preview = false, previewMapId, className = '', orientation = 'landscape', bottomIndex = 0, onToggleOrientation, highlightEdges = [] }: BoardProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const cameraRef = useRef<Camera>({ x: 0, y: 0, scale: 1 })
  const sizeRef = useRef({ width: 0, height: 0 })
  const fitScaleRef = useRef(1)
  const pointersRef = useRef(new Map<number, Point>())
  const gestureRef = useRef<Gesture | null>(null)
  const movedRef = useRef(false)
  const userMovedRef = useRef(false)
  const [camera, setCamera] = useState<Camera>(cameraRef.current)
  const [dragging, setDragging] = useState(false)
  const [ready, setReady] = useState(false)
  const boardId = useId().replaceAll(':', '')
  const map = getMap(game?.mapId ?? previewMapId ?? CASTLE_MAP.id)
  const terrain = TERRAIN[map.theme] ?? TERRAIN.castle
  const portrait = orientation === 'portrait'
  // The drawn size: portrait swaps the field's width and height.
  const w = portrait ? map.height : map.width
  const h = portrait ? map.width : map.height
  const project = useCallback((x: number, y: number): Point => {
    if (!portrait) return { x, y }
    return bottomIndex === 1 ? { x: map.height - y, y: x } : { x: y, y: map.width - x }
  }, [bottomIndex, map, portrait])
  // Strokes drawn in field coordinates, such as the river, ride this transform instead.
  const fieldTransform = !portrait ? undefined : bottomIndex === 1 ? `matrix(0 1 -1 0 ${map.height} 0)` : `matrix(0 -1 1 0 0 ${map.width})`
  const positions = useMemo(() => Object.fromEntries(map.nodes.map(node => [node.id, project(node.x, node.y)])), [map, project])
  const legalSet = useMemo(() => new Set(legalNodes), [legalNodes])
  const recentOpponentSet = useMemo(() => new Set(game?.recentOpponentTroopIds ?? []), [game?.recentOpponentTroopIds])
  const cutSet = useMemo(() => new Set(game?.cutEdges ?? []), [game?.cutEdges])
  const highlightSet = useMemo(() => new Set(highlightEdges.map(([a, b]) => edgeKey(a, b, map))), [highlightEdges, map])
  const depotSet = useMemo(() => new Set(game?.rules.depots ? map.depots : []), [game?.rules.depots, map.depots])

  const applyCamera = useCallback((next: Camera) => {
    const { width, height } = sizeRef.current
    const scale = Math.max(fitScaleRef.current * .7, Math.min(2, next.scale))
    const mapWidth = w * scale
    const mapHeight = h * scale
    const bounded = {
      scale,
      x: mapWidth < width ? (width - mapWidth) / 2 : Math.max(width - mapWidth - 32, Math.min(32, next.x)),
      y: mapHeight < height ? (height - mapHeight) / 2 : Math.max(height - mapHeight - 32, Math.min(32, next.y)),
    }
    cameraRef.current = bounded
    setCamera(bounded)
  }, [h, w])

  // A new orientation always starts from a fresh fit, even after the player panned the old one.
  useEffect(() => { userMovedRef.current = false }, [orientation, bottomIndex])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const measure = (width: number, height: number) => {
      if (!width || !height) return
      sizeRef.current = { width, height }
      const fit = Math.min(width / w, height / h)
      fitScaleRef.current = fit
      // Once the player has panned or zoomed, a resize (a phone's address bar, a rotation)
      // only keeps the field in bounds instead of snapping the view back.
      if (userMovedRef.current) { applyCamera(cameraRef.current); return }
      // A phone is judged by the window, not by the board: a narrow desktop layout still wants the whole field.
      const phone = !preview && window.innerWidth < 640
      if (!phone) {
        applyCamera({ x: (width - w * fit) / 2, y: (height - h * fit) / 2, scale: fit })
      } else if (portrait) {
        // Phones open on the complete upright field. Players can zoom in afterwards,
        // but no headquarters or scoring edge starts off-screen.
        applyCamera({ x: (width - w * fit) / 2, y: (height - h * fit) / 2, scale: fit })
      } else {
        // Sideways on a phone, the bases keep a useful tap size and the field pans left and right.
        const scale = Math.max(fit, Math.min(.8, height / h))
        applyCamera({ x: (width - w * scale) / 2, y: (height - h * scale) / 2, scale })
      }
      setReady(true)
    }
    // Measure right away so a board mounted in a background tab is drawn the moment the tab is shown.
    const rect = viewport.getBoundingClientRect()
    measure(rect.width, rect.height)
    const observer = new ResizeObserver(([entry]) => measure(entry.contentRect.width, entry.contentRect.height))
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [applyCamera, h, portrait, preview, w])

  const zoomAt = useCallback((factor: number, point?: Point) => {
    const previous = cameraRef.current
    const center = point ?? { x: sizeRef.current.width / 2, y: sizeRef.current.height / 2 }
    const scale = Math.max(fitScaleRef.current * .7, Math.min(2, previous.scale * factor))
    userMovedRef.current = true
    applyCamera({ scale, x: center.x - (center.x - previous.x) / previous.scale * scale, y: center.y - (center.y - previous.y) / previous.scale * scale })
  }, [applyCamera])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || preview) return
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      const bounds = viewport.getBoundingClientRect()
      zoomAt(Math.exp(-event.deltaY * .008), { x: event.clientX - bounds.left, y: event.clientY - bounds.top })
    }
    viewport.addEventListener('wheel', onWheel, { passive: false })
    return () => viewport.removeEventListener('wheel', onWheel)
  }, [preview, zoomAt])

  const localPoint = (event: ReactPointerEvent): Point => {
    const bounds = viewportRef.current!.getBoundingClientRect()
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
  }

  const beginGesture = (nodeId: string | null = null) => {
    const points = [...pointersRef.current.values()]
    if (!points.length) { gestureRef.current = null; return }
    const point = points.length === 1 ? points[0] : { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 }
    const distance = points.length === 1 ? 0 : Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y)
    gestureRef.current = { camera: cameraRef.current, point, distance, nodeId }
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (preview || (event.pointerType === 'mouse' && event.button !== 0)) return
    event.preventDefault()
    const nodeId = (event.target as Element).closest('[data-node-id]')?.getAttribute('data-node-id') ?? null
    pointersRef.current.set(event.pointerId, localPoint(event))
    event.currentTarget.setPointerCapture(event.pointerId)
    if (pointersRef.current.size === 1) movedRef.current = false
    else movedRef.current = true
    beginGesture(nodeId)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId) || !gestureRef.current) return
    pointersRef.current.set(event.pointerId, localPoint(event))
    const points = [...pointersRef.current.values()]
    const gesture = gestureRef.current
    if (points.length === 1) {
      const dx = points[0].x - gesture.point.x
      const dy = points[0].y - gesture.point.y
      if (Math.hypot(dx, dy) > 5) { movedRef.current = true; userMovedRef.current = true; setDragging(true) }
      if (movedRef.current) applyCamera({ ...gesture.camera, x: gesture.camera.x + dx, y: gesture.camera.y + dy })
    } else if (gesture.distance > 0) {
      movedRef.current = true
      userMovedRef.current = true
      setDragging(true)
      const center = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 }
      const distance = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y)
      const scale = Math.max(fitScaleRef.current * .7, Math.min(2, gesture.camera.scale * distance / gesture.distance))
      applyCamera({ scale, x: center.x - (gesture.point.x - gesture.camera.x) / gesture.camera.scale * scale, y: center.y - (gesture.point.y - gesture.camera.y) / gesture.camera.scale * scale })
    }
  }

  const finishPointer = (event: ReactPointerEvent<HTMLDivElement>, cancelled = false) => {
    if (!pointersRef.current.has(event.pointerId)) return
    const nodeId = gestureRef.current?.nodeId
    if (!cancelled && !movedRef.current && pointersRef.current.size === 1) {
      if (nodeId) onNodeClick?.(nodeId)
      else onBackgroundClick?.()
    }
    pointersRef.current.delete(event.pointerId)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (pointersRef.current.size) beginGesture()
    else { gestureRef.current = null; setDragging(false) }
  }

  const fitToView = () => {
    const scale = fitScaleRef.current
    userMovedRef.current = false
    applyCamera({ scale, x: (sizeRef.current.width - w * scale) / 2, y: (sizeRef.current.height - h * scale) / 2 })
  }

  const previewBoard = useMemo(() => {
    const bases = map.nodes.filter(node => node.kind !== 'hq')
    const chosen = [bases[0], bases[2], bases[4], bases[bases.length - 3], bases[bases.length - 1]].filter(Boolean)
    // The third preview slot lands on Tropical Pool's power-1 island. Keep its
    // fallback legal as well, so an intermediate/stale map object can never
    // paint a power-6 troop on a power-1-only base.
    const types: Troop['type'][] = ['captain', 'duck', 'skeleton', 'dino', 'robot']
    return Object.fromEntries(chosen.map((node, index) => {
      // Preview pieces obey power-locked terrain too; this keeps the sample board from teaching an illegal move.
      const requiredType = node.requiredPower === undefined
        ? undefined
        : BASE_TROOP_TYPES.find(type => TROOPS[type].power === node.requiredPower)
      const type = requiredType ?? (node.requiredPower === undefined ? types[index]! : 'duck')
      return [node.id, [{ id: `preview-${index}`, type, ownerId: index < 3 ? 'preview-blue' : 'preview-red' }]]
    })) as Record<string, Troop[]>
  }, [map])

  const placements = game?.board ?? (preview ? previewBoard : {})

  // A troop that just landed drops onto its base; landing on an enemy adds an impact, and a power-7 landing a dust ring.
  const previousBoardRef = useRef<Record<string, Troop[]> | null>(null)
  const [landings, setLandings] = useState<Landing[]>([])
  useEffect(() => {
    const before = previousBoardRef.current
    previousBoardRef.current = placements
    if (!before || preview) return
    const fresh: Landing[] = []
    for (const node of map.nodes) {
      const stack = placements[node.id] ?? []
      const top = stack[stack.length - 1]
      const previous = before[node.id] ?? []
      const previousTop = previous[previous.length - 1]
      if (!top || top.id === previousTop?.id || stack.length <= previous.length) continue
      const captured = previousTop && previousTop.ownerId !== top.ownerId ? previousTop.ownerId : null
      fresh.push({ id: ++landingSerial, nodeId: node.id, troopId: top.id, captured, kind: !captured ? 'drop' : TROOPS[top.type].power >= 7 ? 'smash' : 'capture' })
    }
    if (!fresh.length) return
    setLandings(current => [...current, ...fresh])
    const timer = setTimeout(() => setLandings(current => current.filter(landing => !fresh.includes(landing))), 1100)
    return () => clearTimeout(timer)
  }, [map, placements, preview])
  const landingByNode = useMemo(() => Object.fromEntries(landings.map(landing => [landing.nodeId, landing])), [landings])
  const playerColor = (playerId: string | null | undefined) => playerId === 'preview-red' || game?.players.find(player => player.id === playerId)?.index === 1 ? RED : BLUE
  const regionOwners = Object.fromEntries(map.regions.map(region => {
    const firstStack = placements[region.nodeIds[0]!] ?? []
    const candidate = firstStack[firstStack.length - 1]?.ownerId
    const owner = candidate && region.nodeIds.every(nodeId => placements[nodeId]?.at(-1)?.ownerId === candidate) ? candidate : undefined
    return [region.id, owner]
  })) as Record<string, string | undefined>
  const riverPath = `M${map.width / 2} 28C${map.width / 2 - 29} 97 ${map.width / 2 + 24} 145 ${map.width / 2} 220S${map.width / 2 - 19} 337 ${map.width / 2} 410s25 122 0 ${map.height - 447}`

  return (
    <div className={`board-shell board-theme--${map.theme} ${preview ? 'board-shell--preview' : ''} ${portrait ? 'board-shell--portrait' : ''} ${className}`}>
      <div
        ref={viewportRef}
        className={`board-viewport ${dragging ? 'is-dragging' : ''}`}
        aria-label={preview ? `${map.name} 게임판 미리보기` : `${map.name} 게임판. 드래그로 이동하고 확대 버튼으로 자세히 볼 수 있습니다.`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={event => finishPointer(event)}
        onPointerCancel={event => finishPointer(event, true)}
        onLostPointerCapture={event => finishPointer(event, true)}
      >
        <svg
          className="game-board"
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`, opacity: ready ? 1 : 0 }}
          aria-label={`${map.name}의 거점과 연결 길`}
        >
          <defs>
            <pattern id={`${boardId}-grass`} width="83" height="71" patternUnits="userSpaceOnUse">
              <path d="m15 19 1-4m-1 4-3-2m45 34 2-5m-2 5-3-2" stroke="#a4b286" strokeWidth="1.3" strokeLinecap="round" opacity=".42" />
              <circle cx="34" cy="49" r="1" fill="#b6be98" />
            </pattern>
            <pattern id={`${boardId}-paper`} width="9" height="9" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r=".6" fill="#877f59" opacity=".12" />
            </pattern>
            <filter id={`${boardId}-tile-shadow`} x="-30%" y="-20%" width="170%" height="170%">
              <feDropShadow dx="0" dy="4" stdDeviation="2" floodColor="#4c503d" floodOpacity=".2" />
            </filter>
          </defs>
          <rect x="9" y="9" width={w - 18} height={h - 18} rx="35" fill="#e3dcc0" />
          <rect x="9" y="5" width={w - 18} height={h - 22} rx="35" fill={terrain.rim} stroke="#d8d0b3" strokeWidth="2" />
          <rect x="24" y="20" width={w - 48} height={h - 52} rx="26" fill={terrain.field} stroke="#c8cba8" strokeWidth="1.5" />
          <path d={`M25 ${h * .52}Q${w * .22} ${h * .75} ${w * .4} ${h * .56}T${w - 25} ${h * .5}V${h - 58}Q${w * .65} ${h - 5} ${w * .35} ${h - 55}T25 ${h - 54}Z`} fill={terrain.lowland} opacity=".5" />
          <path d={`M45 62Q${w * .25} 15 ${w * .48} 56T${w - 45} 57`} stroke="#cbd8ad" strokeWidth="25" strokeLinecap="round" opacity=".5" />
          <rect x="26" y="22" width={w - 52} height={h - 56} rx="26" fill={`url(#${boardId}-grass)`} />
          <rect x="11" y="7" width={w - 22} height={h - 26} rx="35" fill={`url(#${boardId}-paper)`} pointerEvents="none" />
          <g aria-hidden="true" transform={fieldTransform}>
            <path d={riverPath} stroke={terrain.riverBank} strokeWidth="59" fill="none" />
            <path d={riverPath} stroke={terrain.river} strokeWidth="40" fill="none" />
            {[55, 163, 274, 376, 481, 582].map((y, index) => <path key={y} d={`m${map.width / 2 - 9 + (index % 2) * 6} ${y}q6 3 13 0`} stroke="#d7e4d6" strokeWidth="2" strokeLinecap="round" fill="none" opacity=".7" />)}
            <path d={`M${map.width * .37} ${map.height * .93}q${map.width * .12} 7 ${map.width * .25} 0`} stroke="#b9bd99" strokeWidth="1.5" fill="none" />
          </g>
          <g className="board-terrain-motifs" aria-hidden="true" transform={fieldTransform}>
            {map.theme === 'tropical' && [[140, 100], [960, 100], [140, 540], [960, 540]].map(([x, y], i) => <g key={i}><ellipse cx={x} cy={y} rx="54" ry="29" fill="#e7d49b" opacity=".65" /><ellipse cx={x} cy={y} rx="39" ry="19" fill="#85c894" opacity=".75" /></g>)}
            {map.theme === 'cloud' && [[120, 80], [980, 80], [120, 560], [980, 560]].map(([x, y], i) => <g key={i} fill="#ffffff" opacity=".58"><ellipse cx={x} cy={y} rx="74" ry="23" /><circle cx={x - 20} cy={y - 14} r="24" /><circle cx={x + 22} cy={y - 10} r="19" /></g>)}
            {map.theme === 'jungle' && [[150, 90], [950, 90], [150, 550], [950, 550]].map(([x, y], i) => <g key={i}><circle cx={x} cy={y} r="39" fill="#e5743e" opacity=".45" /><path d={`M${x - 20} ${y + 11}q20 -28 40 0`} fill="none" stroke="#ffce69" strokeWidth="6" opacity=".7" /></g>)}
            {map.theme === 'cemetery' && [[150, 110], [950, 110], [150, 530], [950, 530]].map(([x, y], i) => <g key={i} fill="#787f81" opacity=".5"><path d={`M${x - 13} ${y + 20}v-24a13 13 0 0 1 26 0v24Z`} /><path d={`M${x - 20} ${y + 20}h40v4h-40Z`} /></g>)}
            {map.theme === 'station' && [[140, 100], [960, 100], [140, 540], [960, 540]].map(([x, y], i) => <g key={i} fill="none" stroke="#7696ae" opacity=".55"><circle cx={x} cy={y} r="38" strokeWidth="5" /><circle cx={x} cy={y} r="26" strokeWidth="2" /><path d={`M${x - 54} ${y}h108M${x} ${y - 54}v108`} strokeWidth="2" /></g>)}
            {map.theme === 'caribbean' && [[400, 320], [720, 320], [960, 110], [960, 530]].map(([x, y], i) => <g key={i}><ellipse cx={x} cy={y} rx="50" ry="20" fill="#f6e6ae" opacity=".8" /><path d={`M${x - 30} ${y + 6}q30 -25 60 0`} fill="none" stroke="#5db5c8" strokeWidth="6" opacity=".55" /></g>)}
            {map.theme === 'battlefield' && [[130, 100], [970, 100], [130, 540], [970, 540]].map(([x, y], i) => <g key={i} fill="none" stroke="#957b56" opacity=".65"><path d={`M${x - 48} ${y - 10}h96M${x - 42} ${y}h84M${x - 35} ${y + 10}h70`} strokeWidth="7" strokeLinecap="round" /><path d={`M${x - 55} ${y - 26}l20 14m70 0 20-14`} strokeWidth="3" /></g>)}
          </g>
          <g className="board-landscaping" aria-hidden="true">
            {['castle', 'tropical', 'jungle', 'caribbean'].includes(map.theme) && TREES.map((tree, index) => { const point = project(map.width * tree.fx, map.height * tree.fy); return <Tree key={index} x={point.x} y={point.y} size={tree.size} tone={tree.tone} /> })}
            {['castle', 'tropical', 'jungle', 'caribbean'].includes(map.theme) && GRASS.map(([fx, fy], index) => <Grass key={index} {...project(map.width * fx, map.height * fy)} />)}
            {ROCKS.map(([fx, fy], index) => { const point = project(map.width * fx, map.height * fy); return <g key={index} transform={`translate(${point.x} ${point.y})`}><path d="M-11 0h23l-5-9H-5l-6 9Z" fill="#b9ba9f" /><path d="m-5-9 3 9m8-9-1 9" stroke="#d8d7bc" strokeWidth="2" /></g> })}
            <text x={w / 2} y={h - 19} textAnchor="middle" fill="#939075" fontSize="9" letterSpacing="4" fontFamily="Georgia, serif">{map.name.toUpperCase()} · {String(GAME_MAPS.findIndex(item => item.id === map.id) + 1).padStart(2, '0')}</text>
          </g>
          <g className="board-routes" aria-hidden="true">
            {map.edges.map(([from, to]) => {
              const a = positions[from]
              const b = positions[to]
              const key = edgeKey(from, to, map)
              const cut = cutSet.has(key)
              const highlighted = highlightSet.has(key)
              // A cut road keeps its two stubs and loses the middle, with rubble where it broke.
              const p1 = { x: a.x + (b.x - a.x) * .4, y: a.y + (b.y - a.y) * .4 }
              const p2 = { x: a.x + (b.x - a.x) * .6, y: a.y + (b.y - a.y) * .6 }
              const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
              const segments = cut ? [[a, p1], [p2, b]] : [[a, b]]
              return <g key={key} className={cut ? 'road-cut' : undefined}>
                {segments.map(([s, e], index) => <g key={index}>
                  <line x1={s.x} y1={s.y} x2={e.x} y2={e.y} stroke="#c2bd91" strokeWidth="11" strokeLinecap="round" />
                  <line x1={s.x} y1={s.y} x2={e.x} y2={e.y} stroke="#f5edcf" strokeWidth="7" strokeLinecap="round" />
                  <line x1={s.x} y1={s.y} x2={e.x} y2={e.y} stroke="#dbcca0" strokeWidth="1" strokeDasharray="2 7" />
                </g>)}
                {cut && <g transform={`translate(${mid.x} ${mid.y})`}>
                  <path d="M-9-4 -3 3M-6 5l7-8M3-5l6 8" stroke="#8d6b4a" strokeWidth="2.5" strokeLinecap="round" />
                  <circle cx="-11" cy="6" r="2.2" fill="#a68e6a" /><circle cx="10" cy="-6" r="1.8" fill="#a68e6a" />
                </g>}
                {highlighted && <line className="road-choice" x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={cut ? '#6e823a' : '#c25b3c'} strokeWidth="5" strokeDasharray="8 6" strokeLinecap="round" />}
              </g>
            })}
          </g>
          <g className="board-region-outlines" aria-hidden="true" pointerEvents="none">
            {map.regions.map(region => {
              const claimedOwner = game?.claimedRegions[region.id]
              const currentOwner = regionOwners[region.id]
              const active = Boolean(claimedOwner && currentOwner === claimedOwner)
              const outlineOwner = currentOwner ?? claimedOwner
              return <polygon
                key={region.id}
                className={`board-region ${active ? 'is-active' : claimedOwner ? 'is-claimed' : ''}`}
                points={region.nodeIds.map(id => `${positions[id].x},${positions[id].y}`).join(' ')}
                fill="none"
                stroke={outlineOwner ? playerColor(outlineOwner) : '#6b5a35'}
                strokeOpacity={active ? '.9' : claimedOwner ? '.75' : '.65'}
                strokeWidth={active ? '3.5' : '2.5'}
                strokeLinejoin="round"
                strokeDasharray={active ? undefined : claimedOwner ? '9 5' : '6 6'}
              />
            })}
          </g>
          <g className="board-medals">
            {map.regions.map(region => {
              const owner = game?.claimedRegions[region.id]
              const active = Boolean(owner && regionOwners[region.id] === owner)
              const point = project(region.x, region.y)
              const state = !owner ? '아직 획득하지 않음' : active ? '획득 완료, 현재도 점령 중' : '획득 완료, 현재는 점령 해제됐지만 훈장은 유지됨'
              return <g key={region.id} transform={`translate(${point.x} ${point.y})`} aria-label={`${region.medals}개 훈장, ${state}`}>
                <title>{`${region.medals}개 훈장 · ${state}`}</title>
                <circle r="20" fill={active ? playerColor(owner) : '#eee4bc'} stroke={owner ? playerColor(owner) : '#c8b77b'} strokeWidth={owner && !active ? '3' : '1.4'} strokeDasharray={!owner ? '3 3' : active ? undefined : '7 4'} />
                <path d={STAR} transform="translate(0 -1)" fill={active ? '#f7eccb' : owner ? playerColor(owner) : '#c49c43'} stroke={active ? '#f7eccb' : owner ? playerColor(owner) : '#b48b36'} strokeWidth="1" strokeLinejoin="round" />
                {owner && !active && <g transform="translate(-14 -14)"><circle r="7" fill={playerColor(owner)} stroke="#f8f1df" strokeWidth="1.5" /><path d="m-3 0 2 2 4-5" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></g>}
                {region.medals > 1 && <g><circle cx="15" cy="14" r="9" fill="#faf5e4" stroke="#c8b77b" /><text x="15" y="18" textAnchor="middle" fontSize="11" fontWeight="800" fill="#8c7541">{region.medals}</text></g>}
              </g>
            })}
          </g>
          <g className="board-bases">
            {map.nodes.map(node => {
              const stack = placements[node.id] ?? []
              const troop = stack[stack.length - 1]
              const isLegal = !preview && legalSet.has(node.id)
              const interactive = !preview && (isLegal || Boolean(troop))
              const selected = node.id === selectedNodeId
              const hqColor = node.ownerIndex === 1 ? RED : BLUE
              const troopColor = troop ? playerColor(troop.ownerId) : null
              const power = troop ? TROOPS[troop.type].power : 0
              const recentOpponent = Boolean(troop && recentOpponentSet.has(troop.id))
              const colorName = troopColor === RED ? 'red' : 'blue'
              const { x, y } = positions[node.id]
              return <g
                key={node.id}
                data-node-id={node.id}
                data-troop-power={troop ? power : undefined}
                data-troop-type={troop?.type}
                data-recent-opponent={recentOpponent ? 'true' : undefined}
                data-legal={isLegal ? 'true' : 'false'}
                className={`board-base ${isLegal ? 'is-legal' : ''} ${selected ? 'is-selected' : ''} ${troop ? 'is-occupied' : ''}`}
                role={preview ? undefined : 'button'}
                tabIndex={interactive ? 0 : undefined}
                aria-disabled={preview ? undefined : !interactive}
                aria-label={`${node.label}${troop ? `, ${troopColor === BLUE ? '파랑' : '빨강'} ${TROOPS[troop.type].name}, 힘 ${power}${recentOpponent ? ', 상대가 직전 차례에 놓음' : ''}` : ', 비어 있음'}${isLegal ? ', 여기에 놓기' : ''}`}
                onKeyDown={event => { if (interactive && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onNodeClick?.(node.id) } }}
              >
                <title>{node.label}{node.kind === 'special' ? ` · ${map.specialDescription}` : ''}{troop ? ` · ${TROOPS[troop.type].name} (${power})` : ''}</title>
                {node.kind === 'hq' && <Castle x={x} y={y - 6} color={hqColor} />}
                {node.kind !== 'hq' && Math.abs(node.x - map.width / 2) < 40 && <g transform={`translate(${x} ${y}) rotate(${portrait ? 90 : 0})`} aria-hidden="true">
                  <rect x="-45" y="-23" width="90" height="46" rx="3" fill="#d3c29b" stroke="#ab9872" strokeWidth="1.5" />
                  {[-33, -22, -11, 0, 11, 22, 33].map(px => <path key={px} d={`M${px} -22v44`} stroke="#b6a47f" strokeWidth="1.2" />)}
                  <path d="M-47-25h94M-47 25h94" stroke="#958462" strokeWidth="5" strokeLinecap="round" />
                  <path d="M-47-26h94M-47 24h94" stroke="#eadbbb" strokeWidth="2" strokeLinecap="round" />
                </g>}
                {depotSet.has(node.id) && <g transform={`translate(${x + 30} ${y - 34})`} aria-hidden="true">
                  <rect x="-13" y="-10" width="26" height="20" rx="3" fill="#c99c5a" stroke="#7e5f2f" strokeWidth="1.5" />
                  <path d="M-13-3h26M-13 3h26M-4-10v20M4-10v20" stroke="#7e5f2f" strokeWidth="1" opacity=".7" />
                  <rect x="-16" y="10" width="32" height="10" rx="3" fill="#7e5f2f" /><text x="0" y="17.5" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="#f7eccb">보급소</text>
                </g>}
                {node.kind !== 'hq' && <>
                  <circle cx={x} cy={y + 3} r="27" fill="#a3aa84" opacity=".4" />
                  <circle cx={x} cy={y} r="27" fill={node.kind === 'special' ? '#eee0b0' : '#f8f2dd'} stroke={node.kind === 'special' ? '#b69c57' : '#b7b491'} strokeWidth="2" />
                  <circle cx={x} cy={y} r="21" stroke={node.kind === 'special' ? '#ccb56e' : '#ded5b6'} strokeWidth="1" fill="none" />
                  {!troop && (node.kind === 'special' ? <g transform={`translate(${x} ${y})`} fill="none" stroke="#aa8e45" strokeWidth="2" strokeLinecap="round">
                    {map.theme === 'tropical' ? <text y="7" textAnchor="middle" fill="#997849" stroke="none" fontSize="22" fontWeight="900">{node.requiredPower}</text>
                      : map.theme === 'cloud' ? <g fill="#fbf7dc" stroke="#aa8e45"><ellipse cy="5" rx="12" ry="6" /><circle cx="-5" cy="0" r="6" /><circle cx="4" cy="-3" r="7" /></g>
                      : map.theme === 'jungle' ? <path d="M0-14C-5-5-11-2-9 5a10 10 0 0 0 19 0C11-2 5-4 4-10 3-4 0-2-2 2 0-5 1-7 0-14Z" fill="#e37b3f" />
                      : map.theme === 'cemetery' ? <path d="M-9 10V-4a9 9 0 0 1 18 0v14ZM-13 10h26M0-7v11m-5-5h10" />
                      : map.theme === 'station' ? <g><path d="M-9-9 9 9m0-18-18 18" strokeWidth="4" /><circle r="15" strokeWidth="1.5" /></g>
                      : map.theme === 'battlefield' ? <g><path d="M-9 10V2h18v8M-6 2V-5h12v7M-3-5v-6h6v6" /><circle cx="0" cy="-12" r="3" fill="#aa8e45" /></g>
                      : <g><path d="M7-6a10 10 0 1 0 2 11M7-12v7H0" /><path d="M-4 1h8M0-3v8" /></g>}
                  </g> : <circle cx={x} cy={y} r="3" fill="#c9c0a0" />)}
                </>}
                {(isLegal || selected) && <circle className="board-legal-ring" cx={x} cy={y} r={node.kind === 'hq' ? 46 : 37} fill={isLegal ? '#a7b96d' : 'none'} fillOpacity=".12" stroke={isLegal ? '#718747' : '#d0a64c'} strokeWidth="3" strokeDasharray={isLegal ? '7 6' : undefined} />}
                {landingByNode[node.id]?.kind === 'smash' && <Dust key={`dust-${landingByNode[node.id]!.id}`} x={x} y={y} />}
                {troop && <g key={troop.id} transform={`translate(${x} ${y})`} filter={`url(#${boardId}-tile-shadow)`}><g className={landingByNode[node.id]?.troopId === troop.id ? `board-troop board-troop--${landingByNode[node.id]!.kind}` : 'board-troop'}>
                  {recentOpponent && <circle className="board-recent-opponent-ring" cx="0" cy="-3" r="42" />}
                  {stack.length > 1 && <rect x="-28" y="-30" width="58" height="67" rx="10" fill="#d8cfb7" stroke="#a9a185" strokeWidth="1.5" />}
                  <rect x="-29" y="-37" width="58" height="67" rx="10" fill={troopColor!} stroke={colorName === 'blue' ? '#2e4e69' : '#944b38'} strokeWidth="1.5" />
                  <rect x="-25" y="-33" width="50" height="59" rx="7" fill={colorName === 'blue' ? '#dce6e4' : '#f2dfca'} />
                  <svg x="-26" y="-29" width="52" height="52" viewBox="0 0 56 56"><ToyIcon type={troop.type} color={colorName} size={56} /></svg>
                  <circle cx="-21" cy="-29" r="11" fill={troopColor!} stroke="#f7edce" strokeWidth="1.5" />
                  <text x="-21" y="-25" textAnchor="middle" fill="#fff7df" fontSize="12" fontWeight="800">{power === 0 ? '★' : power}</text>
                  {stack.length > 1 && <g><circle cx="23" cy="25" r="9" fill="#f8f1df" stroke={troopColor!} strokeWidth="1.5" /><text x="23" y="29" textAnchor="middle" fill={troopColor!} fontSize="10" fontWeight="800">{stack.length}</text></g>}
                </g></g>}
                {landingByNode[node.id] && landingByNode[node.id]!.kind !== 'drop' && <Impact key={landingByNode[node.id]!.id} x={x} y={y} color={playerColor(landingByNode[node.id]!.captured)} />}
                {node.kind === 'hq' && <g><rect x={x - 5 - node.label.length * 5.5} y={y + 31} width={10 + node.label.length * 11} height="20" rx="7" fill={hqColor} /><text x={x} y={y + 45} textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff5db">{node.label}</text></g>}
                <circle cx={x} cy={y} r={node.kind === 'hq' ? 45 : 34} fill="transparent" />
              </g>
            })}
          </g>
        </svg>
      </div>
      {!preview && <>
        <div className="board-pan-hint"><Move size={13} strokeWidth={1.7} /><span>드래그해서 둘러보기</span></div>
        <div className="board-controls" role="group" aria-label="게임판 확대와 이동">
          <button type="button" onClick={() => zoomAt(1 / 1.22)} aria-label="게임판 축소" title="축소"><Minus size={17} /></button>
          <span className="board-zoom-value" aria-live="polite">{Math.round(camera.scale * 100)}<span>%</span></span>
          <button type="button" onClick={() => zoomAt(1.22)} aria-label="게임판 확대" title="확대"><Plus size={17} /></button>
          <span className="board-control-divider" />
          <button type="button" onClick={fitToView} aria-label="게임판 전체 보기" title="전체 보기"><Expand size={16} /></button>
          {onToggleOrientation && <button type="button" onClick={onToggleOrientation} aria-label={portrait ? '가로로 보기' : '세로로 보기'} title={portrait ? '가로로 보기' : '세로로 보기'}>{portrait ? <RectangleHorizontal size={16} /> : <RectangleVertical size={16} />}</button>}
        </div>
      </>}
    </div>
  )
}

export default Board

/** The hit on a captured troop: a flash over the tile and short strikes in the loser's colour poking out past its edges. */
function Impact({ x, y, color }: { x: number; y: number; color: string }) {
  return <g className="board-impact" transform={`translate(${x} ${y})`} pointerEvents="none" aria-hidden="true">
    <circle className="board-flash" r="24" fill="#fff6d8" />
    <g className="board-strikes" stroke={color} strokeWidth="3.5" strokeLinecap="round" fill="none">
      {[0, 72, 144, 216, 288].map(deg => <g key={deg} transform={`rotate(${deg + 18})`}><path d="M0-30v-12" /></g>)}
    </g>
  </g>
}

/** A power-7 landing kicks up dust from under the tile: a ring and a few puffs, all kept inside the base's own circle. */
function Dust({ x, y }: { x: number; y: number }) {
  const puffs = Array.from({ length: 8 }, (_, index) => {
    const angle = (index / 8) * Math.PI * 2 + (index % 2 ? .25 : -.15)
    return { sx: Math.cos(angle) * 27, sy: Math.sin(angle) * 27 + 5, dx: Math.cos(angle) * 41, dy: Math.sin(angle) * 41 + 3, r: 3 + (index % 3) }
  })
  return <g className="board-dust-cloud" transform={`translate(${x} ${y})`} pointerEvents="none" aria-hidden="true">
    <circle className="board-dust-ring" r="30" fill="none" stroke="#b39a6c" strokeWidth="7" />
    {puffs.map((puff, index) => <circle key={index} className="board-dust" cx={puff.sx} cy={puff.sy} r={puff.r} fill="#c8b48a" stroke="#a48a5e" strokeWidth="1" style={{ '--dx': `${puff.dx - puff.sx}px`, '--dy': `${puff.dy - puff.sy}px` } as CSSProperties} />)}
  </g>
}
