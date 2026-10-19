import * as THREE from 'three';
import gsap from 'gsap';
import type { SceneContext } from './scene';
import type {
  DoorRecord,
  LuggageMode,
  RoomAssets,
  TowerRecord,
} from './types';

export interface ControllerCallbacks {
  onStatus: (text: string) => void;
  onToast: (text: string) => void;
  onTooltip: (text: string, x: number, y: number) => void;
  onHideTooltip: () => void;
  onOccupancyChange: (occupied: boolean) => void;
  onTowerFocus: (tower: TowerRecord) => void;
}

interface PickResult {
  door?: DoorRecord;
  luggage?: true;
}

const HOME = new THREE.Vector3(1.55, 0, -1.15);
const HOME_QUATERNION = new THREE.Quaternion();
const SUITCASE_SLOT = {
  leftX: 0.2525,
  rightX: 0.7475,
  y: 0.06,
  z: -0.2425,
  approachZ: 0.68,
};
const DRAG_THRESHOLD = 6;

function padDoor(number: number): string {
  return String(number).padStart(2, '0');
}

function isVisibleInScene(object: THREE.Object3D): boolean {
  let node: THREE.Object3D | null = object;
  while (node) {
    if (!node.visible) return false;
    node = node.parent;
  }
  return true;
}

export class DemoController {
  private readonly context: SceneContext;
  private readonly roomAssets: RoomAssets;
  private readonly luggageRoot: THREE.Group;
  private readonly callbacks: ControllerCallbacks;
  private readonly canvas: HTMLCanvasElement;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly home = HOME.clone();
  private readonly homeQuaternion = HOME_QUATERNION.clone();
  private readonly floorRing: THREE.Mesh;
  private readonly floorRingMaterial: THREE.MeshBasicMaterial;

  private mode: LuggageMode = 'free';
  private occupiedDoor: DoorRecord | null = null;
  private hoveredDoor: DoorRecord | null = null;
  private pointerDown: { x: number; y: number; time: number } | null = null;
  private pointerX = 0;
  private pointerY = 0;
  private dragged = false;
  private pendingStow: DoorRecord | null = null;
  private luggageTween: gsap.core.Tween | null = null;

  constructor(
    context: SceneContext,
    roomAssets: RoomAssets,
    luggageRoot: THREE.Group,
    callbacks: ControllerCallbacks,
  ) {
    this.context = context;
    this.roomAssets = roomAssets;
    this.luggageRoot = luggageRoot;
    this.callbacks = callbacks;
    this.canvas = context.renderer.domElement;

    this.luggageRoot.position.copy(this.home);
    this.luggageRoot.quaternion.copy(this.homeQuaternion);

    this.floorRingMaterial = new THREE.MeshBasicMaterial({
      color: 0x35f28c,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    });
    this.floorRing = new THREE.Mesh(
      new THREE.RingGeometry(0.16, 0.215, 48),
      this.floorRingMaterial,
    );
    this.floorRing.rotation.x = -Math.PI / 2;
    this.floorRing.position.y = 0.014;
    this.floorRing.renderOrder = 4;
    context.scene.add(this.floorRing);

    this.bindEvents();
    this.callbacks.onOccupancyChange(false);
    this.updateStatus();
  }

  private bindEvents(): void {
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerleave', this.onPointerLeave);
    this.canvas.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerCancel);
  }

  private readonly onContextMenu = (event: Event): void => {
    event.preventDefault();
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    this.pointerDown = {
      x: event.clientX,
      y: event.clientY,
      time: performance.now(),
    };
    this.dragged = false;
    this.canvas.style.cursor = 'grabbing';
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    this.pointerX = event.clientX;
    this.pointerY = event.clientY;

    if (this.pointerDown) {
      const dx = event.clientX - this.pointerDown.x;
      const dy = event.clientY - this.pointerDown.y;
      if (Math.hypot(dx, dy) > DRAG_THRESHOLD) {
        this.dragged = true;
        this.clearHover();
        return;
      }
    }

    if (this.dragged) return;

    const pick = this.pick(event.clientX, event.clientY);
    this.updateHover(pick, event);
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    const down = this.pointerDown;
    this.pointerDown = null;

    if (!down || this.dragged) {
      this.dragged = false;
      this.canvas.style.cursor = 'grab';
      return;
    }

    const duration = performance.now() - down.time;
    this.dragged = false;
    this.canvas.style.cursor = 'grab';

    if (duration > 650) return;
    this.handleClick(event.clientX, event.clientY);
  };

  private readonly onPointerCancel = (): void => {
    this.pointerDown = null;
    this.dragged = false;
    this.canvas.style.cursor = 'grab';
  };

  private readonly onPointerLeave = (): void => {
    if (!this.pointerDown) {
      this.clearHover();
    }
  };

  private pick(clientX: number, clientY: number): PickResult {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.context.camera);

    const hits = this.raycaster
      .intersectObjects([this.roomAssets.room, this.luggageRoot], true)
      .filter((hit) => isVisibleInScene(hit.object));

    if (hits.length === 0) return {};

    let node: THREE.Object3D | null = hits[0].object;
    while (node) {
      const door = node.userData.__door as DoorRecord | undefined;
      if (door) return { door };
      if (node === this.luggageRoot) return { luggage: true };
      node = node.parent;
    }

    return {};
  }

  private updateHover(pick: PickResult, event: PointerEvent): void {
    if (pick.door) {
      this.hoveredDoor = pick.door;
      this.callbacks.onTowerFocus(pick.door.tower);
      this.context.hoverBox.setFromObject(pick.door.node);
      this.context.hoverBox.visible = true;

      const material = this.context.hoverBox.material as THREE.LineBasicMaterial;
      if (this.mode === 'selected') {
        material.color.setHex(this.isBottomDoor(pick.door) ? 0x35f28c : 0xff455e);
      } else {
        material.color.setHex(0xffc45c);
      }

      this.callbacks.onTooltip(
        this.doorTooltip(pick.door),
        event.clientX,
        event.clientY,
      );
      this.canvas.style.cursor = 'pointer';
      return;
    }

    if (pick.luggage && this.mode !== 'moving') {
      this.hoveredDoor = null;
      this.context.hoverBox.visible = false;
      this.callbacks.onTooltip(
        this.luggageTooltip(),
        event.clientX,
        event.clientY,
      );
      this.canvas.style.cursor = 'pointer';
      return;
    }

    this.clearHover();
    this.canvas.style.cursor = 'grab';
  }

  private clearHover(): void {
    this.hoveredDoor = null;
    this.context.hoverBox.visible = false;
    this.callbacks.onHideTooltip();
  }

  private doorTooltip(door: DoorRecord): string {
    const label = `${door.tower.label} · Door ${padDoor(door.number)} (${door.number <= 2 ? 'bottom' : 'top'} ${door.side})`;
    const size = `${door.tower.size.tier} · ${door.tower.size.compartment.height} × ${door.tower.size.compartment.width} × ${door.tower.size.compartment.depth} mm`;

    if (this.mode === 'selected') {
      return this.isBottomDoor(door)
        ? `Stow the suitcase in ${label} — ${size}`
        : 'The suitcase fits the bottom compartments only';
    }

    if (this.mode === 'stowed' && door === this.occupiedDoor) {
      return `${label} — ${size} — open to retrieve the suitcase`;
    }

    return `${label} — ${size} — ${door.isOccupied ? 'occupied' : door.isOpen ? 'click to close' : 'click to open'}`;
  }

  private luggageTooltip(): string {
    if (this.mode === 'stowed') return 'Suitcase — click to retrieve';
    if (this.mode === 'selected') return 'Suitcase selected — click to deselect';
    return 'Suitcase — click to select';
  }

  private handleClick(clientX: number, clientY: number): void {
    this.pointerX = clientX;
    this.pointerY = clientY;
    if (this.mode === 'moving') return;

    const pick = this.pick(clientX, clientY);

    if (pick.door) {
      this.handleDoorClick(pick.door);
      return;
    }

    if (pick.luggage) {
      this.handleLuggageClick();
      return;
    }

    if (this.mode === 'selected') {
      this.deselectLuggage();
    }
  }

  private handleDoorClick(door: DoorRecord): void {
    if (this.pendingStow) return;

    if (this.mode === 'selected') {
      if (!this.isBottomDoor(door)) {
        this.callbacks.onToast('The suitcase fits the bottom compartments only.');
        return;
      }

      if (door.isOpen) {
        this.stowLuggage(door);
      } else {
        this.pendingStow = door;
        this.animateDoor(door, true, () => {
          if (this.pendingStow !== door) return;
          this.pendingStow = null;
          if (this.mode === 'selected') {
            this.stowLuggage(door);
          }
        });
      }
      return;
    }

    if (this.mode === 'stowed' && door === this.occupiedDoor) {
      if (!door.isOpen) {
        this.animateDoor(door, true);
        this.refreshDoorTooltip(door);
      } else {
        this.callbacks.onToast(
          'Click the suitcase to remove it, or use Remove suitcase.',
        );
      }
      return;
    }

    if (door.isOpen) {
      this.animateDoor(door, false);
    } else {
      this.animateDoor(door, true);
    }
    this.refreshDoorTooltip(door);
  }

  private refreshDoorTooltip(door: DoorRecord): void {
    if (this.hoveredDoor !== door) return;
    this.callbacks.onTooltip(
      this.doorTooltip(door),
      this.pointerX,
      this.pointerY,
    );
  }

  private handleLuggageClick(): void {
    if (this.mode === 'moving') return;

    if (this.mode === 'stowed') {
      this.retrieveLuggage();
      return;
    }

    if (this.mode === 'selected') {
      this.deselectLuggage();
      return;
    }

    this.selectLuggage();
  }

  private selectLuggage(): void {
    this.mode = 'selected';
    this.pendingStow = null;
    this.context.selectionBox.setFromObject(this.luggageRoot);
    this.context.selectionBox.visible = true;
    this.callbacks.onHideTooltip();
    this.callbacks.onToast('Suitcase selected. Choose an open bottom locker.');
    this.updateStatus();
  }

  private deselectLuggage(): void {
    if (this.mode !== 'selected') return;
    this.mode = 'free';
    this.pendingStow = null;
    this.context.selectionBox.visible = false;
    this.callbacks.onHideTooltip();
    this.callbacks.onToast('Suitcase deselected.');
    this.updateStatus();
  }

  private isBottomDoor(door: DoorRecord): boolean {
    return door.number === 1 || door.number === 2;
  }

  private animateDoor(
    door: DoorRecord,
    open: boolean,
    onComplete?: () => void,
  ): void {
    door.isOpen = open;
    gsap.killTweensOf(door.node.rotation);
    gsap.to(door.node.rotation, {
      y: open ? door.closedAngle + door.openAngle : door.closedAngle,
      duration: 0.72,
      ease: 'power3.inOut',
      onComplete,
    });
  }

  private stowLuggage(door: DoorRecord): void {
    if (this.mode !== 'selected' || !door.isOpen) return;

    this.mode = 'moving';
    this.context.selectionBox.setFromObject(this.luggageRoot);
    this.context.selectionBox.visible = true;
    this.callbacks.onHideTooltip();
    this.context.hoverBox.visible = false;
    this.updateStatus();

    const slotX =
      door.side === 'left' ? SUITCASE_SLOT.leftX : SUITCASE_SLOT.rightX;
    const towerNode = door.tower.node;
    towerNode.updateMatrixWorld(true);

    const target = towerNode.localToWorld(
      new THREE.Vector3(slotX, SUITCASE_SLOT.y, SUITCASE_SLOT.z),
    );
    const approach = towerNode.localToWorld(
      new THREE.Vector3(slotX, SUITCASE_SLOT.y, SUITCASE_SLOT.approachZ),
    );
    const targetQuaternion = towerNode.getWorldQuaternion(new THREE.Quaternion());

    this.moveLuggage(
      [this.luggageRoot.position.clone(), approach, target],
      targetQuaternion,
      () => {
        this.mode = 'stowed';
        this.occupiedDoor = door;
        door.isOccupied = true;
        this.setLed(door, true);
        this.context.selectionBox.visible = false;
        this.callbacks.onOccupancyChange(true);
        this.callbacks.onToast(`Suitcase stowed in ${door.tower.label}.`);
        this.updateStatus();

        gsap.delayedCall(0.35, () => {
          this.animateDoor(door, false);
        });
      },
    );
  }

  retrieveLuggage(): void {
    if (this.mode !== 'stowed' || !this.occupiedDoor) return;

    const door = this.occupiedDoor;
    const run = (): void => {
      if (this.mode !== 'stowed' || this.occupiedDoor !== door) return;

      this.mode = 'moving';
      this.context.selectionBox.setFromObject(this.luggageRoot);
      this.context.selectionBox.visible = true;
      this.callbacks.onHideTooltip();
      this.updateStatus();

      const towerNode = door.tower.node;
      towerNode.updateMatrixWorld(true);
      const slotX =
        door.side === 'left' ? SUITCASE_SLOT.leftX : SUITCASE_SLOT.rightX;
      const approach = towerNode.localToWorld(
        new THREE.Vector3(slotX, SUITCASE_SLOT.y, SUITCASE_SLOT.approachZ),
      );

      this.moveLuggage(
        [this.luggageRoot.position.clone(), approach, this.home.clone()],
        this.homeQuaternion.clone(),
        () => {
          this.mode = 'free';
          this.occupiedDoor = null;
          door.isOccupied = false;
          this.setLed(door, false);
          this.context.selectionBox.visible = false;
          this.callbacks.onOccupancyChange(false);
          this.callbacks.onToast('Suitcase retrieved.');
          this.updateStatus();

          gsap.delayedCall(0.3, () => {
            this.animateDoor(door, false);
          });
        },
      );
    };

    if (door.isOpen) {
      run();
    } else {
      this.animateDoor(door, true, run);
    }
  }

  private moveLuggage(
    points: THREE.Vector3[],
    targetQuaternion: THREE.Quaternion,
    onComplete: () => void,
  ): void {
    this.luggageTween?.kill();

    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    const startQuaternion = this.luggageRoot.quaternion.clone();
    const progress = { value: 0 };
    const duration = THREE.MathUtils.clamp(curve.getLength() * 0.7, 0.9, 1.9);

    this.luggageTween = gsap.to(progress, {
      value: 1,
      duration,
      ease: 'power2.inOut',
      onUpdate: () => {
        const t = progress.value;
        this.luggageRoot.position.copy(curve.getPointAt(t));
        this.luggageRoot.quaternion.slerpQuaternions(
          startQuaternion,
          targetQuaternion,
          Math.min(1, t * 1.5),
        );
      },
      onComplete: () => {
        this.luggageTween = null;
        this.luggageRoot.position.copy(points[points.length - 1]);
        this.luggageRoot.quaternion.copy(targetQuaternion);
        onComplete();
      },
    });
  }

  private setLed(door: DoorRecord, occupied: boolean): void {
    const material = door.ledMaterial;
    if (!material) return;

    const color = occupied ? 0xff455e : 0x28ff86;
    material.color.setHex(color);
    material.emissive.setHex(color);
    material.emissiveIntensity = occupied ? 4 : 3.2;
  }

  private updateStatus(): void {
    if (this.mode === 'selected') {
      this.callbacks.onStatus('Suitcase selected · choose an open bottom locker');
      return;
    }

    if (this.mode === 'moving') {
      this.callbacks.onStatus('Positioning the suitcase…');
      return;
    }

    if (this.mode === 'stowed' && this.occupiedDoor) {
      this.callbacks.onStatus(
        `Suitcase stowed in ${this.occupiedDoor.tower.label} · Door ${padDoor(this.occupiedDoor.number)}`,
      );
      return;
    }

    const count = this.roomAssets.doors.length;
    this.callbacks.onStatus(
      `Ready · ${this.roomAssets.towers.length} lockers · ${count} compartments`,
    );
  }

  update(): void {
    if (this.context.selectionBox.visible) {
      this.context.selectionBox.setFromObject(this.luggageRoot);
    }
    if (this.context.hoverBox.visible && this.hoveredDoor) {
      this.context.hoverBox.setFromObject(this.hoveredDoor.node);
    }

    const showRing = this.mode === 'free' || this.mode === 'selected';
    this.floorRing.visible = showRing;

    if (showRing) {
      const time = performance.now() * 0.0025;
      const selected = this.mode === 'selected';
      this.floorRing.position.set(
        this.luggageRoot.position.x,
        0.014,
        this.luggageRoot.position.z,
      );
      this.floorRing.scale.setScalar(1 + Math.sin(time) * 0.06);
      this.floorRingMaterial.color.setHex(selected ? 0x6ea8ff : 0x35f28c);
      this.floorRingMaterial.opacity = selected
        ? 0.75
        : 0.34 + Math.sin(time) * 0.08;
    }
  }

  reset(): void {
    this.luggageTween?.kill();
    this.luggageTween = null;
    this.pendingStow = null;
    this.mode = 'free';
    this.occupiedDoor = null;

    this.roomAssets.doors.forEach((door) => {
      gsap.killTweensOf(door.node.rotation);
      door.node.rotation.y = door.closedAngle;
      door.isOpen = false;
      door.isOccupied = false;
      this.setLed(door, false);
    });

    this.luggageRoot.position.copy(this.home);
    this.luggageRoot.quaternion.copy(this.homeQuaternion);
    this.context.selectionBox.visible = false;
    this.clearHover();
    this.callbacks.onOccupancyChange(false);
    this.callbacks.onToast('Demo reset.');
    this.updateStatus();
  }

  setCutaway(enabled: boolean): void {
    this.roomAssets.cutaway.forEach((object) => {
      object.visible = !enabled;
    });
  }

  getState(): {
    mode: LuggageMode;
    occupied: string | null;
    luggage: [number, number, number];
    doors: {
      tower: string;
      number: number;
      isOpen: boolean;
      isOccupied: boolean;
      angle: number;
    }[];
  } {
    return {
      mode: this.mode,
      occupied: this.occupiedDoor
        ? `${this.occupiedDoor.tower.label}:${this.occupiedDoor.number}`
        : null,
      luggage: this.luggageRoot.position.toArray() as [number, number, number],
      doors: this.roomAssets.doors.map((door) => ({
        tower: door.tower.label,
        number: door.number,
        isOpen: door.isOpen,
        isOccupied: door.isOccupied,
        angle: door.node.rotation.y,
      })),
    };
  }
}
