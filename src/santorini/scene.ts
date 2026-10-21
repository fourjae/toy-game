import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CELLS, SIZE } from '../../shared/santorini';

/**
 * The 3D island, drawn straight with three.js: a low-poly sea, a white island, a 5x5 grass board,
 * stacked white blocks with blue domes, and two pawns per player. React owns the overlay UI and
 * calls `sync` whenever the game view changes.
 */

export type Highlight = 'place' | 'move' | 'build' | 'worker';
export interface SceneState {
  levels: number[];
  domes: boolean[];
  /** [seat0 workers, seat1 workers] */
  workers: Array<[number | null, number | null]>;
  highlights: Map<number, Highlight>;
  selectedCell: number | null;
  lastBuild: number | null;
}

export const SEAT_COLORS = ['#e2703a', '#2f4a9e'] as const;
const LEVEL_TOP = [0, 0.36, 0.68, 0.98];
const HIGHLIGHT_COLORS: Record<Highlight, number> = { place: 0xffffff, move: 0xffd35a, build: 0x7fd7ff, worker: 0xffd35a };

const cellX = (cell: number) => (cell % SIZE) - (SIZE - 1) / 2;
const cellZ = (cell: number) => Math.floor(cell / SIZE) - (SIZE - 1) / 2;

export class IslandScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  private controls: OrbitControls;
  private sea!: THREE.Mesh;
  private seaBase!: Float32Array;
  private tiles: THREE.Mesh[] = [];
  private buildings: THREE.Group[] = [];
  private rings: THREE.Mesh[] = [];
  private pawns: THREE.Group[][] = [];
  private pawnTargets: THREE.Vector3[][] = [];
  private pawnHop: number[][] = [[0, 0], [0, 0]];
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private down: { x: number; y: number; t: number } | null = null;
  private frame = 0;
  private clock = new THREE.Clock();
  private state: SceneState | null = null;
  private resizeObserver: ResizeObserver;
  private builtCounts: number[] = Array(CELLS).fill(0);
  private popCell: number | null = null;
  private popStart = 0;
  private seat = 0;
  private lowPower = false;
  private dirty = 3;
  private sized = false;
  private reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  constructor(private host: HTMLElement, private onPick: (cell: number) => void, seat: number) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    // Software GL (no GPU, some VMs and test browsers) gets a lighter scene drawn only when something moves.
    const gl = this.renderer.getContext();
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
    this.lowPower = /swiftshader|llvmpipe|software/iu.test(gpu);
    this.renderer.setPixelRatio(this.lowPower ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = !this.lowPower;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x000000, 0);
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    this.scene.fog = new THREE.Fog(0xbfe3f2, 24, 70);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 24;
    this.controls.minPolarAngle = 0.15;
    this.controls.maxPolarAngle = 1.25;
    this.controls.target.set(0, 0.3, 0);
    this.controls.addEventListener('change', () => { this.dirty = Math.max(this.dirty, 2); });
    this.resetCamera(seat);

    this.buildWorld();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();

    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointerup', this.onUp);
    this.loop();
  }

  /** Looks at the board from the viewer's own side. */
  resetCamera(seat: number, top = false) {
    const z = seat === 0 ? 1 : -1;
    const { clientWidth: w, clientHeight: h } = this.host;
    const aspect = h ? w / h : 1;
    if (aspect < 0.8) {
      // Tall phone screen: fit the board centre to about 74% of the width (the near edge then fills ~85%) and look down more steeply,
      // so the board fills the tall slot instead of leaving an empty sky above it.
      const halfFov = THREE.MathUtils.degToRad(this.camera.fov / 2);
      const d = THREE.MathUtils.clamp((SIZE / 2 / 0.74) / (Math.tan(halfFov) * aspect), 7, 18);
      if (top) this.camera.position.set(0, d, 0.5 * z);
      else this.camera.position.set(0, d * 0.84, d * 0.54 * z);
    } else {
      const d = 13;
      if (top) this.camera.position.set(0, d * 1.05, 0.5 * z);
      else this.camera.position.set(0, d * 0.6, d * 0.8 * z);
    }
    this.seat = seat;
    this.controls.target.set(0, 0.3, 0);
    this.controls.update();
  }

  private buildWorld() {
    const scene = this.scene;
    scene.add(new THREE.HemisphereLight(0xdff4ff, 0x6c8a5c, 1.1));
    const sun = new THREE.DirectionalLight(0xfff2d8, 2.1);
    sun.position.set(-6, 12, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
    sun.shadow.bias = -0.0015;
    scene.add(sun);

    // Sea: a wide low-poly plane whose vertices bob in the render loop.
    const seaGeo = new THREE.PlaneGeometry(120, 120, 60, 60);
    seaGeo.rotateX(-Math.PI / 2);
    this.seaBase = Float32Array.from(seaGeo.attributes.position!.array as Float32Array);
    this.sea = new THREE.Mesh(seaGeo, new THREE.MeshStandardMaterial({ color: 0x2f8fc9, roughness: 0.35, metalness: 0.1, flatShading: true }));
    this.sea.position.y = -1.15;
    this.sea.receiveShadow = true;
    scene.add(this.sea);

    // The island: white cliffs, a sandy rim, and a grass top that carries the board.
    const cliff = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 6.4, 1.6, 10, 2), new THREE.MeshStandardMaterial({ color: 0xf2eee6, roughness: 0.9, flatShading: true }));
    cliff.position.y = -0.85;
    cliff.receiveShadow = true;
    scene.add(cliff);
    const sand = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 7, 0.3, 10), new THREE.MeshStandardMaterial({ color: 0xeed9a6, roughness: 1, flatShading: true }));
    sand.position.y = -1.2;
    scene.add(sand);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(5.1, 5.2, 0.12, 10), new THREE.MeshStandardMaterial({ color: 0x8fbf6a, roughness: 1, flatShading: true }));
    top.position.y = -0.06;
    top.receiveShadow = true;
    scene.add(top);

    // Little whitewashed houses with blue domes on the rim, and a few rocks in the water.
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
    const blue = new THREE.MeshStandardMaterial({ color: 0x2b5cad, roughness: 0.5 });
    const rock = new THREE.MeshStandardMaterial({ color: 0xc9c3b6, flatShading: true });
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.3;
      const house = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.28, 0.42), white);
      body.position.y = 0.14;
      body.castShadow = true;
      house.add(body);
      if (i % 2 === 0) {
        const dome = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), blue);
        dome.position.y = 0.28;
        house.add(dome);
      }
      house.position.set(Math.cos(a) * 4.6, 0, Math.sin(a) * 4.6);
      house.rotation.y = -a;
      scene.add(house);
      const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.35 + (i % 3) * 0.15), rock);
      stone.position.set(Math.cos(a + 0.4) * 8.2, -1.1, Math.sin(a + 0.4) * 8.2);
      scene.add(stone);
    }

    // Board tiles.
    const tileGeo = new THREE.BoxGeometry(0.94, 0.1, 0.94);
    for (let cell = 0; cell < CELLS; cell++) {
      const dark = (cellX(cell) + cellZ(cell)) % 2 === 0;
      const tile = new THREE.Mesh(tileGeo, new THREE.MeshStandardMaterial({ color: dark ? 0x7fb35c : 0x93c56c, roughness: 1 }));
      tile.position.set(cellX(cell), 0.05, cellZ(cell));
      tile.receiveShadow = true;
      tile.userData.cell = cell;
      scene.add(tile);
      this.tiles.push(tile);
      const group = new THREE.Group();
      group.position.set(cellX(cell), 0.1, cellZ(cell));
      scene.add(group);
      this.buildings.push(group);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.42, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      ring.userData.cell = cell;
      scene.add(ring);
      this.rings.push(ring);
    }

    for (let seat = 0; seat < 2; seat++) {
      this.pawns.push([]);
      this.pawnTargets.push([]);
      for (let w = 0; w < 2; w++) {
        const pawn = this.makePawn(SEAT_COLORS[seat]!, w);
        pawn.visible = false;
        scene.add(pawn);
        this.pawns[seat]!.push(pawn);
        this.pawnTargets[seat]!.push(new THREE.Vector3());
      }
    }
  }

  private makePawn(color: string, index: number) {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.45 });
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.08, 20), mat);
    base.position.y = 0.04;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.18, 0.4, 20), mat);
    body.position.y = 0.28;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 14), mat);
    head.position.y = 0.58;
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.025, 8, 20), new THREE.MeshStandardMaterial({ color: index ? 0xffffff : 0xf6d36b }));
    band.rotation.x = Math.PI / 2;
    band.position.y = 0.42;
    for (const m of [base, body, head]) { m.castShadow = true; m.userData.pawn = true; }
    g.add(base, body, head, band);
    return g;
  }

  private rebuildCell(cell: number, level: number, dome: boolean) {
    const group = this.buildings[cell]!;
    group.traverse(obj => { if (obj instanceof THREE.Mesh) { obj.geometry.dispose(); (obj.material as THREE.Material).dispose(); } });
    group.clear();
    const white = new THREE.MeshStandardMaterial({ color: 0xfbfaf6, roughness: 0.75 });
    const sizes = [0.86, 0.74, 0.6];
    const heights = [0.36, 0.32, 0.3];
    let y = 0;
    for (let l = 0; l < level; l++) {
      const block = new THREE.Mesh(new THREE.BoxGeometry(sizes[l]!, heights[l]! - 0.02, sizes[l]!), white);
      block.position.y = y + heights[l]! / 2;
      block.castShadow = true;
      block.receiveShadow = true;
      block.userData.cell = cell;
      group.add(block);
      // A dark window slot on two faces so the stacks read as little houses.
      const win = new THREE.Mesh(new THREE.BoxGeometry(sizes[l]! * 0.26, heights[l]! * 0.42, 0.01), new THREE.MeshStandardMaterial({ color: 0x3a5c8c }));
      win.position.set(0, block.position.y, sizes[l]! / 2 + 0.005);
      group.add(win);
      const win2 = win.clone();
      win2.position.z = -win.position.z;
      group.add(win2);
      y += heights[l]!;
    }
    if (dome) {
      const domeMesh = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2b5cad, roughness: 0.4 }));
      domeMesh.position.y = y;
      domeMesh.castShadow = true;
      domeMesh.userData.cell = cell;
      group.add(domeMesh);
    }
  }

  sync(state: SceneState) {
    this.dirty = 40;
    const previous = this.state;
    this.state = state;
    for (let cell = 0; cell < CELLS; cell++) {
      const count = state.levels[cell]! + (state.domes[cell] ? 1 : 0);
      if (count !== this.builtCounts[cell]) {
        this.rebuildCell(cell, state.levels[cell]!, state.domes[cell]!);
        if (previous && count > this.builtCounts[cell]!) { this.popCell = cell; this.popStart = this.clock.getElapsedTime(); }
        this.builtCounts[cell] = count;
      }
      const ring = this.rings[cell]!;
      const highlight = state.highlights.get(cell);
      ring.visible = Boolean(highlight) || state.selectedCell === cell;
      (ring.material as THREE.MeshBasicMaterial).color.setHex(state.selectedCell === cell ? 0xffffff : HIGHLIGHT_COLORS[highlight ?? 'place']);
      ring.position.set(cellX(cell), 0.12 + LEVEL_TOP[state.levels[cell]!]! + (state.domes[cell] ? 0.3 : 0) + 0.01, cellZ(cell));
    }
    state.workers.forEach((pair, seat) => pair.forEach((cell, w) => {
      const pawn = this.pawns[seat]![w]!;
      if (cell === null) { pawn.visible = false; return; }
      const target = new THREE.Vector3(cellX(cell), 0.1 + LEVEL_TOP[state.levels[cell]!]!, cellZ(cell));
      if (!pawn.visible) { pawn.position.copy(target).add(new THREE.Vector3(0, 1.5, 0)); pawn.visible = true; }
      if (!this.pawnTargets[seat]![w]!.equals(target)) this.pawnHop[seat]![w] = this.clock.getElapsedTime();
      this.pawnTargets[seat]![w]!.copy(target);
    }));
  }

  private onDown = (e: PointerEvent) => { this.down = { x: e.clientX, y: e.clientY, t: performance.now() }; };
  private onUp = (e: PointerEvent) => {
    const start = this.down;
    this.down = null;
    if (!start || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const pawnMeshes = this.pawns.flat().filter(p => p.visible);
    const hits = this.raycaster.intersectObjects([...pawnMeshes, ...this.rings.filter(r => r.visible), ...this.buildings, ...this.tiles], true);
    for (const hit of hits) {
      let obj: THREE.Object3D | null = hit.object;
      // A pawn maps to the cell under it.
      while (obj && obj.parent && obj.parent !== this.scene) obj = obj.parent;
      const pawnIndex = pawnMeshes.indexOf(obj as THREE.Group);
      if (pawnIndex >= 0 && this.state) {
        const flat = this.state.workers.flat();
        const cell = flat[this.pawns.flat().indexOf(obj as THREE.Group)];
        if (cell !== null && cell !== undefined) { this.onPick(cell); return; }
      }
      const cell = hit.object.userData.cell as number | undefined;
      if (cell !== undefined) { this.onPick(cell); return; }
    }
  };

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.host;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Narrow portrait screens need a wider lens to keep the whole board in view.
    this.camera.fov = w / h < 0.8 ? 58 : 42;
    this.camera.updateProjectionMatrix();
    this.dirty = Math.max(this.dirty, 2);
    if (!this.sized) { this.sized = true; this.resetCamera(this.seat); }
  }

  private loop = () => {
    this.frame = requestAnimationFrame(this.loop);
    const t = this.clock.getElapsedTime();
    const pos = this.sea.geometry.attributes.position!;
    this.controls.update();
    if (this.lowPower) {
      if (this.dirty <= 0) return;
      this.dirty -= 1;
    }
    if (!this.reducedMotion && !this.lowPower) {
      const arr = pos.array as Float32Array;
      for (let i = 0; i < arr.length; i += 3) {
        const x = this.seaBase[i]!, z = this.seaBase[i + 2]!;
        arr[i + 1] = Math.sin(x * 0.35 + t * 0.9) * 0.12 + Math.cos(z * 0.4 + t * 0.7) * 0.1;
      }
      pos.needsUpdate = true;
    }
    this.pawns.forEach((pair, seat) => pair.forEach((pawn, w) => {
      if (!pawn.visible) return;
      const target = this.pawnTargets[seat]![w]!;
      pawn.position.lerp(target, 0.16);
      const since = t - this.pawnHop[seat]![w]!;
      pawn.position.y = THREE.MathUtils.lerp(pawn.position.y, target.y, 0.2) + (since < 0.4 ? Math.sin((since / 0.4) * Math.PI) * 0.35 : 0);
    }));
    if (this.popCell !== null) {
      const k = Math.min(1, (t - this.popStart) / 0.35);
      const s = k < 1 ? 0.6 + 0.4 * Math.sin(k * Math.PI / 2) + Math.sin(k * Math.PI) * 0.08 : 1;
      this.buildings[this.popCell]!.scale.set(1, s, 1);
      if (k >= 1) this.popCell = null;
    }
    const pulse = 0.55 + Math.sin(t * 4) * 0.3;
    for (const ring of this.rings) if (ring.visible) (ring.material as THREE.MeshBasicMaterial).opacity = this.lowPower ? 0.85 : pulse;
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.renderer.domElement.removeEventListener('pointerdown', this.onDown);
    this.renderer.domElement.removeEventListener('pointerup', this.onUp);
    this.scene.traverse(obj => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        for (const m of Array.isArray(obj.material) ? obj.material : [obj.material]) m.dispose();
      }
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
