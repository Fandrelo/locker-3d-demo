import * as THREE from 'three';
import gsap from 'gsap';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export type CameraPreset =
  | 'overview'
  | 'entry'
  | 'kiosk'
  | 'lockers'
  | 'suitcase';

export interface SceneContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  hoverBox: THREE.BoxHelper;
  selectionBox: THREE.BoxHelper;
}

const PRESETS: Record<
  CameraPreset,
  { position: [number, number, number]; target: [number, number, number] }
> = {
  overview: {
    position: [2.7, 2.9, 4.7],
    target: [1.95, 1.0, -1.6],
  },
  entry: {
    position: [2.45, 1.55, -0.25],
    target: [2.15, 1.15, -2.4],
  },
  kiosk: {
    position: [2.5, 1.58, -1.1],
    target: [2.5, 1.2, -2.45],
  },
  lockers: {
    position: [2.25, 1.7, -2.15],
    target: [0.5, 1.15, -1.15],
  },
  suitcase: {
    position: [2.65, 1.3, -0.4],
    target: [1.55, 0.42, -1.15],
  },
};

const UP = new THREE.Vector3(0, 1, 0);

const MOVE_CODES = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyQ',
  'KeyE',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ShiftLeft',
  'ShiftRight',
]);

/** Keeps the free camera near the facility instead of letting it get lost. */
const MOVE_BOUNDS = {
  minX: -2.5,
  maxX: 6.5,
  minY: 0.3,
  maxY: 6,
  minZ: -5.5,
  maxZ: 7.5,
};

const WALK_SPEED = 2.2;
const SPRINT_SPEED = 4.6;
const MOVE_RESPONSE = 12;

export interface FreeMoveControls {
  update: (deltaSeconds: number) => void;
  dispose: () => void;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  );
}

/**
 * Keyboard navigation layered on top of OrbitControls. Moving translates both
 * the camera and the orbit target, so the camera keeps its current view
 * direction while the user walks/flys through the room.
 */
export function createFreeMoveControls(
  context: SceneContext,
  onMoveStart?: () => void,
): FreeMoveControls {
  const pressed = new Set<string>();
  const velocity = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const wish = new THREE.Vector3();
  const before = new THREE.Vector3();
  const applied = new THREE.Vector3();

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!MOVE_CODES.has(event.code) || isEditableTarget(event.target)) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    event.preventDefault();
    if (pressed.has(event.code)) return;

    pressed.add(event.code);

    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') return;

    gsap.killTweensOf(context.camera.position);
    gsap.killTweensOf(context.controls.target);
    onMoveStart?.();
  };

  const onKeyUp = (event: KeyboardEvent): void => {
    if (MOVE_CODES.has(event.code)) pressed.delete(event.code);
  };

  const clearKeys = (): void => {
    pressed.clear();
    velocity.set(0, 0, 0);
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', clearKeys);
  document.addEventListener('visibilitychange', clearKeys);

  const update = (deltaSeconds: number): void => {
    const forwardInput =
      (pressed.has('KeyW') || pressed.has('ArrowUp') ? 1 : 0) -
      (pressed.has('KeyS') || pressed.has('ArrowDown') ? 1 : 0);
    const strafeInput =
      (pressed.has('KeyD') || pressed.has('ArrowRight') ? 1 : 0) -
      (pressed.has('KeyA') || pressed.has('ArrowLeft') ? 1 : 0);
    const verticalInput =
      (pressed.has('KeyE') ? 1 : 0) - (pressed.has('KeyQ') ? 1 : 0);

    if (
      forwardInput === 0 &&
      strafeInput === 0 &&
      verticalInput === 0 &&
      velocity.lengthSq() < 1e-6
    ) {
      return;
    }

    context.camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
    forward.normalize();
    right.crossVectors(forward, UP).normalize();

    wish.set(0, 0, 0);
    if (forwardInput !== 0) wish.addScaledVector(forward, forwardInput);
    if (strafeInput !== 0) wish.addScaledVector(right, strafeInput);
    if (wish.lengthSq() > 1) wish.normalize();
    wish.y += verticalInput;
    if (wish.lengthSq() > 1) wish.normalize();

    const sprinting = pressed.has('ShiftLeft') || pressed.has('ShiftRight');
    wish.multiplyScalar(sprinting ? SPRINT_SPEED : WALK_SPEED);

    const blend = 1 - Math.exp(-MOVE_RESPONSE * Math.min(deltaSeconds, 0.1));
    velocity.lerp(wish, blend);
    if (velocity.lengthSq() < 1e-6) {
      velocity.set(0, 0, 0);
      return;
    }

    before.copy(context.camera.position);
    context.camera.position.addScaledVector(velocity, deltaSeconds);
    context.camera.position.x = THREE.MathUtils.clamp(
      context.camera.position.x,
      MOVE_BOUNDS.minX,
      MOVE_BOUNDS.maxX,
    );
    context.camera.position.y = THREE.MathUtils.clamp(
      context.camera.position.y,
      MOVE_BOUNDS.minY,
      MOVE_BOUNDS.maxY,
    );
    context.camera.position.z = THREE.MathUtils.clamp(
      context.camera.position.z,
      MOVE_BOUNDS.minZ,
      MOVE_BOUNDS.maxZ,
    );

    applied.subVectors(context.camera.position, before);
    context.controls.target.add(applied);
  };

  const dispose = (): void => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', clearKeys);
    document.removeEventListener('visibilitychange', clearKeys);
  };

  return { update, dispose };
}

export function createScene(container: HTMLElement): SceneContext {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0c0f);

  const camera = new THREE.PerspectiveCamera(
    45,
    container.clientWidth / container.clientHeight,
    0.05,
    100,
  );
  camera.position.set(...PRESETS.overview.position);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.82;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(...PRESETS.overview.target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.minDistance = 1.1;
  controls.maxDistance = 11;
  controls.minPolarAngle = 0.08;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.panSpeed = 0.7;
  controls.rotateSpeed = 0.65;
  controls.zoomSpeed = 0.8;
  controls.update();

  controls.addEventListener('start', () => {
    gsap.killTweensOf(camera.position);
    gsap.killTweensOf(controls.target);
  });

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.24;
  pmrem.dispose();

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshStandardMaterial({
      color: 0x0a0b0e,
      roughness: 0.96,
      metalness: 0,
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.105;
  ground.receiveShadow = true;
  scene.add(ground);

  const hemisphere = new THREE.HemisphereLight(0xcfe0ff, 0x17191e, 0.5);
  scene.add(hemisphere);

  const key = new THREE.DirectionalLight(0xfff2e2, 2.0);
  key.position.set(5.5, 7, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -5;
  key.shadow.camera.right = 5;
  key.shadow.camera.top = 6;
  key.shadow.camera.bottom = -2;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 20;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.015;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xa8c6ff, 0.34);
  fill.position.set(-4, 4, 2);
  scene.add(fill);

  const interior = new THREE.PointLight(0xffd8ad, 9, 9, 2);
  interior.position.set(2, 2.25, -1.5);
  scene.add(interior);

  const hoverBox = new THREE.BoxHelper(new THREE.Object3D(), 0xffc45c);
  hoverBox.visible = false;
  const hoverMaterial = hoverBox.material as THREE.LineBasicMaterial;
  hoverMaterial.depthTest = false;
  hoverMaterial.transparent = true;
  hoverMaterial.opacity = 0.95;
  scene.add(hoverBox);

  const selectionBox = new THREE.BoxHelper(new THREE.Object3D(), 0x6ea8ff);
  selectionBox.visible = false;
  const selectionMaterial = selectionBox.material as THREE.LineBasicMaterial;
  selectionMaterial.depthTest = false;
  selectionMaterial.transparent = true;
  selectionMaterial.opacity = 0.95;
  scene.add(selectionBox);

  const resize = () => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === 0 || height === 0) return;
    camera.aspect = width / height;
    camera.fov = camera.aspect < 1 ? 58 : 45;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
  };

  window.addEventListener('resize', resize);
  const observer = new ResizeObserver(resize);
  observer.observe(container);

  return { scene, camera, renderer, controls, hoverBox, selectionBox };
}

export function applyPreset(
  context: SceneContext,
  preset: CameraPreset,
  immediate = false,
): void {
  const { camera, controls } = context;
  const { position, target } = PRESETS[preset];

  if (immediate) {
    camera.position.set(...position);
    controls.target.set(...target);
    controls.update();
    return;
  }

  gsap.to(camera.position, {
    x: position[0],
    y: position[1],
    z: position[2],
    duration: 1.05,
    ease: 'power2.inOut',
  });
  gsap.to(controls.target, {
    x: target[0],
    y: target[1],
    z: target[2],
    duration: 1.05,
    ease: 'power2.inOut',
  });
}
