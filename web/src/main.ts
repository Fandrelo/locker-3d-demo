import './style.css';
import * as THREE from 'three';
import {
  applyPreset,
  createFreeMoveControls,
  createScene,
  type SceneContext,
} from './scene';
import { loadLuggage, loadRoom } from './assets';
import { DemoController } from './interactions';
import { createKioskScreen } from './kiosk-screen';
import { createUi } from './ui';

function requireElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}

const viewport = requireElement<HTMLDivElement>('#viewport');
const debugEnabled = new URLSearchParams(window.location.search).has('debug');

let context: SceneContext | null = null;
let controller: DemoController | null = null;

const ui = createUi({
  onPreset: (preset) => {
    if (context) applyPreset(context, preset);
  },
  onReset: () => {
    if (!controller || !context) return;
    controller.reset();
    controller.setCutaway(true);
    ui.setCutaway(true);
    applyPreset(context, 'overview');
    ui.setActivePreset('overview');
  },
  onRemoveSuitcase: () => {
    controller?.retrieveLuggage();
  },
  onCutaway: (enabled) => {
    controller?.setCutaway(enabled);
  },
});

function modelUrl(name: string): string {
  return new URL(`models/${name}`, document.baseURI).href;
}

async function boot(): Promise<void> {
  try {
    const sceneContext = createScene(viewport);
    context = sceneContext;

    const timer = new THREE.Timer();
    timer.connect(document);
    const freeMove = createFreeMoveControls(sceneContext, () => {
      ui.setActivePreset(null);
    });

    sceneContext.renderer.domElement.setAttribute(
      'aria-label',
      'Interactive 3D view of the locker facility',
    );

    sceneContext.renderer.setAnimationLoop(() => {
      timer.update();
      freeMove.update(Math.min(timer.getDelta(), 0.1));
      sceneContext.controls.update();
      controller?.update();
      sceneContext.renderer.render(sceneContext.scene, sceneContext.camera);
    });

    ui.setLoadingProgress(0.04);

    const room = await loadRoom(modelUrl('room.glb'), (fraction) => {
      ui.setLoadingProgress(0.04 + fraction * 0.72);
    });
    sceneContext.scene.add(room.room);
    sceneContext.scene.add(createKioskScreen());

    ui.setLoadingProgress(0.78);

    const luggage = await loadLuggage(modelUrl('luggage.glb'), (fraction) => {
      ui.setLoadingProgress(0.78 + fraction * 0.2);
    });
    sceneContext.scene.add(luggage);

    controller = new DemoController(sceneContext, room, luggage, {
      onStatus: ui.setStatus,
      onToast: ui.toast,
      onTooltip: ui.showTooltip,
      onHideTooltip: ui.hideTooltip,
      onOccupancyChange: ui.setRemoveVisible,
      onTowerFocus: ui.setLockerSize,
    });
    controller.setCutaway(true);
    ui.setCutaway(true);

    const featuredTower =
      room.towers.find((tower) => tower.label === 'LKR-D01') ?? room.towers[0];
    if (featuredTower) ui.setLockerSize(featuredTower);

    if (debugEnabled) {
      const project = (point: THREE.Vector3) => {
        const projected = point.clone().project(sceneContext.camera);
        return {
          x: ((projected.x + 1) / 2) * window.innerWidth,
          y: ((1 - projected.y) / 2) * window.innerHeight,
        };
      };

      (window as unknown as Record<string, unknown>).__lockerDemo = {
        controller,
        room,
        getState: () => controller?.getState(),
        getDoorScreen: (label: string, number: number) => {
          const door = room.doors.find(
            (candidate) =>
              candidate.tower.label === label && candidate.number === number,
          );
          if (!door) return null;
          const box = new THREE.Box3().setFromObject(door.node);
          return project(box.getCenter(new THREE.Vector3()));
        },
        getLuggageScreen: () => {
          const point = new THREE.Vector3();
          luggage.getWorldPosition(point);
          point.y += 0.4;
          return project(point);
        },
        pickAt: (x: number, y: number) => {
          const rect = sceneContext.renderer.domElement.getBoundingClientRect();
          const pointer = new THREE.Vector2(
            ((x - rect.left) / rect.width) * 2 - 1,
            -((y - rect.top) / rect.height) * 2 + 1,
          );
          const raycaster = new THREE.Raycaster();
          raycaster.setFromCamera(pointer, sceneContext.camera);
          const hits = raycaster
            .intersectObjects([room.room, luggage], true)
            .filter((hit) => {
              let node: THREE.Object3D | null = hit.object;
              while (node) {
                if (!node.visible) return false;
                node = node.parent;
              }
              return true;
            });
          return hits.slice(0, 6).map((hit) => {
            const names: string[] = [];
            let node: THREE.Object3D | null = hit.object;
            while (node && names.length < 6) {
              names.push(node.name);
              node = node.parent;
            }
            return {
              names,
              distance: hit.distance,
              point: hit.point.toArray(),
            };
          });
        },
      };
    }

    applyPreset(sceneContext, 'overview', true);
    ui.setActivePreset('overview');
    ui.hideLoading();
    ui.setStatus(
      `Ready · ${room.towers.length} lockers · ${room.doors.length} compartments`,
    );

    if (window.matchMedia('(max-width: 820px)').matches) {
      window.setTimeout(() => {
        ui.toast('Tap a locker door to open it · tap the suitcase to stow it.');
      }, 900);
    }
  } catch (error) {
    console.error(error);
    ui.failLoading(
      error instanceof Error
        ? `Could not load the 3D facility: ${error.message}`
        : 'Could not load the 3D facility.',
    );
  }
}

void boot();
