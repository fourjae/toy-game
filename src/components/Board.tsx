import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Expand, Minus, Move, Plus, RectangleHorizontal, RectangleVertical } from 'lucide-react'
import { CASTLE_MAP, edgeKey } from '../../shared/map'
import { TROOPS } from '../../shared/troops'
import type { GameView, Troop } from '../../shared/types'
import { ToyIcon } from './ToyIcon'
import './Board.css'

export type BoardOrientation = 'landscape' | 'portrait'

export interface BoardProps {
  game?: GameView | null
  legalNodes?: string[]
  onNodeClick?: (nodeId: string) => void
  selectedNodeId?: string | null
  preview?: boolean
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
interface Point { x: number; y: number }
interface Gesture {
  camera: Camera
  point: Point
  distance: number
  nodeId: string | null
}

const BLUE = '#426987'
const RED = '#b7634c'
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

export function Board({ game, legalNodes = [], onNodeClick, selectedNodeId, preview = false, className = '', orientation = 'landscape', bottomIndex = 0, onToggleOrientation, highlightEdges = [] }: BoardProps) {
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
  const map = CASTLE_MAP
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
  const cutSet = useMemo(() => new Set(game?.cutEdges ?? []), [game?.cutEdges])
  const highlightSet = useMemo(() => new Set(highlightEdges.map(([a, b]) => edgeKey(a, b))), [highlightEdges])
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
        // On a phone the field fills the width and opens on the player's own headquarters; the rest is a swipe away.
        const scale = Math.max(fit, Math.min(.8, width / w))
        applyCamera({ x: (width - w * scale) / 2, y: height - h * scale - 32, scale })
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
    if (!cancelled && !movedRef.current && pointersRef.current.size === 1 && nodeId) onNodeClick?.(nodeId)
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
    const types: Troop['type'][] = ['captain', 'duck', 'unicorn', 'dino', 'robot']
    return Object.fromEntries(chosen.map((node, index) => [node.id, [{ id: `preview-${index}`, type: types[index], ownerId: index < 3 ? 'preview-blue' : 'preview-red' }]])) as Record<string, Troop[]>
  }, [map])

  const placements = game?.board ?? (preview ? previewBoard : {})
  const playerColor = (playerId: string | null | undefined) => playerId === 'preview-red' || game?.players.find(player => player.id === playerId)?.index === 1 ? RED : BLUE
  const riverPath = `M${map.width / 2} 28C${map.width / 2 - 29} 97 ${map.width / 2 + 24} 145 ${map.width / 2} 220S${map.width / 2 - 19} 337 ${map.width / 2} 410s25 122 0 ${map.height - 447}`

  return (
    <div className={`board-shell ${preview ? 'board-shell--preview' : ''} ${portrait ? 'board-shell--portrait' : ''} ${className}`}>
      <div
        ref={viewportRef}
        className={`board-viewport ${dragging ? 'is-dragging' : ''}`}
        aria-label={preview ? '성채 평원 게임판 미리보기' : '성채 평원 게임판. 드래그로 이동하고 확대 버튼으로 자세히 볼 수 있습니다.'}
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
          aria-label="성채 평원의 거점과 연결 길"
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
          <rect x="9" y="5" width={w - 18} height={h - 22} rx="35" fill="#f3eddb" stroke="#d8d0b3" strokeWidth="2" />
          <rect x="24" y="20" width={w - 48} height={h - 52} rx="26" fill="#e5eace" stroke="#c8cba8" strokeWidth="1.5" />
          <path d={`M25 ${h * .52}Q${w * .22} ${h * .75} ${w * .4} ${h * .56}T${w - 25} ${h * .5}V${h - 58}Q${w * .65} ${h - 5} ${w * .35} ${h - 55}T25 ${h - 54}Z`} fill="#dce4bf" opacity=".65" />
          <path d={`M45 62Q${w * .25} 15 ${w * .48} 56T${w - 45} 57`} stroke="#cbd8ad" strokeWidth="25" strokeLinecap="round" opacity=".5" />
          <rect x="26" y="22" width={w - 52} height={h - 56} rx="26" fill={`url(#${boardId}-grass)`} />
          <rect x="11" y="7" width={w - 22} height={h - 26} rx="35" fill={`url(#${boardId}-paper)`} pointerEvents="none" />
          <g aria-hidden="true" transform={fieldTransform}>
            <path d={riverPath} stroke="#ccd5b2" strokeWidth="59" fill="none" />
            <path d={riverPath} stroke="#a8c3ba" strokeWidth="40" fill="none" />
            {[55, 163, 274, 376, 481, 582].map((y, index) => <path key={y} d={`m${map.width / 2 - 9 + (index % 2) * 6} ${y}q6 3 13 0`} stroke="#d7e4d6" strokeWidth="2" strokeLinecap="round" fill="none" opacity=".7" />)}
            <path d={`M${map.width * .37} ${map.height * .93}q${map.width * .12} 7 ${map.width * .25} 0`} stroke="#b9bd99" strokeWidth="1.5" fill="none" />
          </g>
          {map.regions.map(region => {
            const owner = game?.claimedRegions[region.id]
            return <polygon key={region.id} points={region.nodeIds.map(id => `${positions[id].x},${positions[id].y}`).join(' ')} fill={owner ? playerColor(owner) : '#d7dcbc'} fillOpacity=".13" stroke="none" />
          })}
          <g className="board-landscaping" aria-hidden="true">
            {TREES.map((tree, index) => { const point = project(map.width * tree.fx, map.height * tree.fy); return <Tree key={index} x={point.x} y={point.y} size={tree.size} tone={tree.tone} /> })}
            {GRASS.map(([fx, fy], index) => <Grass key={index} {...project(map.width * fx, map.height * fy)} />)}
            {ROCKS.map(([fx, fy], index) => { const point = project(map.width * fx, map.height * fy); return <g key={index} transform={`translate(${point.x} ${point.y})`}><path d="M-11 0h23l-5-9H-5l-6 9Z" fill="#b9ba9f" /><path d="m-5-9 3 9m8-9-1 9" stroke="#d8d7bc" strokeWidth="2" /></g> })}
            <text x={w / 2} y={h - 19} textAnchor="middle" fill="#939075" fontSize="9" letterSpacing="4" fontFamily="Georgia, serif">CASTLE FIELD · 01</text>
          </g>
          <g className="board-routes" aria-hidden="true">
            {map.edges.map(([from, to]) => {
              const a = positions[from]
              const b = positions[to]
              const key = edgeKey(from, to)
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
          <g className="board-medals">
            {map.regions.map(region => {
              const owner = game?.claimedRegions[region.id]
              const point = project(region.x, region.y)
              return <g key={region.id} transform={`translate(${point.x} ${point.y})`} aria-label={`${region.medals}개 훈장${owner ? ', 점령됨' : ''}`}>
                <circle r="20" fill={owner ? playerColor(owner) : '#eee4bc'} stroke={owner ? playerColor(owner) : '#c8b77b'} strokeWidth="1.4" strokeDasharray={owner ? undefined : '3 3'} />
                <path d={STAR} transform="translate(0 -1)" fill={owner ? '#f7eccb' : '#c49c43'} stroke={owner ? '#f7eccb' : '#b48b36'} strokeWidth="1" strokeLinejoin="round" />
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
              const colorName = troopColor === RED ? 'red' : 'blue'
              const { x, y } = positions[node.id]
              return <g
                key={node.id}
                data-node-id={node.id}
                data-legal={isLegal ? 'true' : 'false'}
                className={`board-base ${isLegal ? 'is-legal' : ''} ${selected ? 'is-selected' : ''} ${troop ? 'is-occupied' : ''}`}
                role={preview ? undefined : 'button'}
                tabIndex={interactive ? 0 : undefined}
                aria-disabled={preview ? undefined : !interactive}
                aria-label={`${node.label}${troop ? `, ${troopColor === BLUE ? '파랑' : '빨강'} ${TROOPS[troop.type].name}, 힘 ${TROOPS[troop.type].power}` : ', 비어 있음'}${isLegal ? ', 여기에 놓기' : ''}`}
                onKeyDown={event => { if (interactive && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onNodeClick?.(node.id) } }}
              >
                <title>{node.label}{node.kind === 'special' ? ' · 병정 회수 거점' : ''}{troop ? ` · ${TROOPS[troop.type].name} (${TROOPS[troop.type].power})` : ''}</title>
                {node.kind === 'hq' && <Castle x={x} y={y - 6} color={hqColor} />}
                {node.id.startsWith('bridge-') && <g transform={`translate(${x} ${y}) rotate(${portrait ? 90 : 0})`} aria-hidden="true">
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
                  {!troop && (node.kind === 'special' ? <g transform={`translate(${x} ${y})`} fill="none" stroke="#aa8e45" strokeWidth="2" strokeLinecap="round"><path d="M7-6a10 10 0 1 0 2 11M7-12v7H0" /><path d="M-4 1h8M0-3v8" /></g> : <circle cx={x} cy={y} r="3" fill="#c9c0a0" />)}
                </>}
                {(isLegal || selected) && <circle className="board-legal-ring" cx={x} cy={y} r={node.kind === 'hq' ? 45 : 36} fill={isLegal ? '#a1ae56' : 'none'} fillOpacity=".14" stroke={isLegal ? '#6e823a' : '#d0a64c'} strokeWidth="3" strokeDasharray={isLegal ? '5 5' : undefined} />}
                {troop && <g transform={`translate(${x} ${y})`} filter={`url(#${boardId}-tile-shadow)`}>
                  {stack.length > 1 && <rect x="-28" y="-30" width="58" height="67" rx="10" fill="#d8cfb7" stroke="#a9a185" strokeWidth="1.5" />}
                  <rect x="-29" y="-37" width="58" height="67" rx="10" fill={troopColor!} stroke={colorName === 'blue' ? '#2e4e69' : '#944b38'} strokeWidth="1.5" />
                  <rect x="-25" y="-33" width="50" height="59" rx="7" fill={colorName === 'blue' ? '#dce6e4' : '#f2dfca'} />
                  <svg x="-26" y="-29" width="52" height="52" viewBox="0 0 56 56"><ToyIcon type={troop.type} color={colorName} size={56} /></svg>
                  <circle cx="-21" cy="-29" r="11" fill={troopColor!} stroke="#f7edce" strokeWidth="1.5" />
                  <text x="-21" y="-25" textAnchor="middle" fill="#fff7df" fontSize="12" fontWeight="800">{TROOPS[troop.type].power === 0 ? '★' : TROOPS[troop.type].power}</text>
                  {stack.length > 1 && <g><circle cx="23" cy="25" r="9" fill="#f8f1df" stroke={troopColor!} strokeWidth="1.5" /><text x="23" y="29" textAnchor="middle" fill={troopColor!} fontSize="10" fontWeight="800">{stack.length}</text></g>}
                </g>}
                {node.kind === 'hq' && <g><rect x={x - 30} y={y + 31} width="60" height="20" rx="7" fill={hqColor} /><text x={x} y={y + 45} textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff5db">{node.ownerIndex === 0 ? '파랑 본부' : '빨강 본부'}</text></g>}
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
