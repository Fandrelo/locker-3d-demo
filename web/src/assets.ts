import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { DoorRecord, LockerSize, RoomAssets, TowerRecord } from './types';

const TOWER_META: Record<string, { label: string; model: string; wall: string }> = {
  WINNSEN_E04A_03_Instance: { label: 'LKR-D01', model: 'E04A', wall: 'West wall' },
  WINNSEN_E06B_04_Instance: { label: 'LKR-D02', model: 'E06B', wall: 'West wall' },
  WINNSEN_E06B_05_Instance: { label: 'LKR-B01', model: 'E06B', wall: 'East wall' },
  WINNSEN_E08A_01_Instance: { label: 'LKR-C01', model: 'E08A', wall: 'North wall' },
  WINNSEN_E12A_06_Instance: { label: 'LKR-B02', model: 'E12A', wall: 'East wall' },
  WINNSEN_E12A_07_Instance: { label: 'LKR-A01', model: 'E12A', wall: 'South wall' },
};

/**
 * Compartment sizing per Winnsen model.
 * Source: lockers-physical-infra/winnsen.md — "Standard Modular Dimensions &
 * Compartment Sizes". Keep these values in sync with that document.
 */
const MODEL_SPECS: Record<string, LockerSize> = {
  E04A: {
    tier: 'XXXL',
    doorsPerTower: 4,
    compartment: { height: 907, width: 432, depth: 485 },
    volumeLitres: 190,
  },
  E06B: {
    tier: 'XL',
    doorsPerTower: 6,
    compartment: { height: 602, width: 432, depth: 485 },
    volumeLitres: 126.1,
  },
  E08A: {
    tier: 'L',
    doorsPerTower: 8,
    compartment: { height: 450, width: 432, depth: 485 },
    volumeLitres: 94.3,
  },
  E12A: {
    tier: 'M',
    doorsPerTower: 12,
    compartment: { height: 297, width: 432, depth: 485 },
    volumeLitres: 62.2,
  },
};

/**
 * The GLB renders every tower with E04A geometry, so LKR-D01 (mapped to E04A)
 * is the only tower whose visible geometry matches its published spec. Use it
 * for the always-visible sizing placard.
 */
const FEATURED_SIZE_TOWER = 'LKR-D01';

const PROXY_MESHES = new Set([
  'Master_Mesh_WINNSEN_E04A',
  'Master_Mesh_WINNSEN_E06B',
  'Master_Mesh_WINNSEN_E08A',
  'Master_Mesh_WINNSEN_E12A',
]);

const CUTAWAY_NAMES = [
  'Wall_South_Left',
  'Wall_South_Right',
  'Lintel_Door_South',
  'Door_Leaf_4x3',
  'Door_Jamb_Post_Left',
  'Door_Jamb_Post_Right',
];

function createTowerLabel(text: string, subtitle?: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = subtitle ? 512 : 320;
  canvas.height = subtitle ? 128 : 80;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create tower label canvas');

  context.fillStyle = 'rgba(8, 12, 15, 0.88)';
  context.beginPath();
  context.roundRect(2, 2, canvas.width - 4, canvas.height - 4, subtitle ? 22 : 18);
  context.fill();
  context.strokeStyle = 'rgba(56, 189, 248, 0.62)';
  context.lineWidth = 3;
  context.stroke();

  context.textAlign = 'center';
  context.textBaseline = 'middle';

  if (subtitle) {
    context.fillStyle = '#eaf7ff';
    context.font = '700 40px "Segoe UI", Arial, sans-serif';
    context.fillText(text, canvas.width / 2, 48);

    context.fillStyle = 'rgba(166, 220, 255, 0.95)';
    context.font = '600 23px "Segoe UI", Arial, sans-serif';
    context.fillText(subtitle, canvas.width / 2, 94);
  } else {
    context.fillStyle = '#eafff1';
    context.font = '700 34px "Segoe UI", Arial, sans-serif';
    context.fillText(text, canvas.width / 2, canvas.height / 2 + 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });

  const sprite = new THREE.Sprite(material);
  if (subtitle) {
    sprite.scale.set(0.8, 0.2, 1);
  } else {
    sprite.scale.set(0.6, 0.15, 1);
  }
  sprite.renderOrder = 3;
  return sprite;
}

function tuneMaterials(room: THREE.Object3D): void {
  const seen = new Set<THREE.Material>();

  room.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];

    for (const material of materials) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      if (seen.has(material)) continue;
      seen.add(material);

      if (material.name === 'Mat_Floor_Locker') {
        material.color.setHex(0x23252a);
        material.roughness = 0.34;
        material.metalness = 0.08;
      }

      if (material.name === 'Mat_Wall_Exterior') {
        material.color.setHex(0xc9cdd4);
        material.roughness = 0.82;
      }

      if (material.name === 'Mat_Winnsen_Door') {
        material.color.setHex(0xc7cbd2);
        material.roughness = 0.34;
      }
    }
  });
}

function loadGltf(
  url: string,
  onProgress?: (fraction: number) => void,
): Promise<GLTF> {
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      resolve,
      (event) => {
        if (event.total > 0 && onProgress) {
          onProgress(Math.min(1, event.loaded / event.total));
        }
      },
      reject,
    );
  });
}

/**
 * `GLTFLoader` names a node's `Object3D` after the *node* (`WINNSEN_E12A_07`),
 * not after the mesh it references (`Master_Mesh_WINNSEN_E12A`). Resolve the
 * original glTF mesh name so proxy meshes can be matched reliably even when
 * node names change.
 */
function getSourceMeshName(gltf: GLTF, object: THREE.Object3D): string | undefined {
  const reference = gltf.parser.associations.get(object);
  if (reference?.meshes === undefined) return undefined;
  return gltf.parser.json?.meshes?.[reference.meshes]?.name;
}

function isProxyMesh(gltf: GLTF, object: THREE.Mesh): boolean {
  return (
    PROXY_MESHES.has(object.name) ||
    PROXY_MESHES.has(getSourceMeshName(gltf, object) ?? '')
  );
}

function findByNameFragment(
  root: THREE.Object3D,
  fragment: string,
): THREE.Object3D | null {
  let result: THREE.Object3D | null = null;
  root.traverse((child) => {
    if (!result && child.name.includes(fragment)) result = child;
  });
  return result;
}

function findLed(door: THREE.Object3D): THREE.Object3D | null {
  return findByNameFragment(door, '_LED');
}

function fixDoorHardware(door: THREE.Object3D, number: number): void {
  if (number !== 2 && number !== 4) return;

  const badge = findByNameFragment(door, '_Badge');
  const led = findByNameFragment(door, '_LED');

  if (badge) {
    badge.position.x = -0.422;
    if (number === 4) badge.position.y = 0.43125;
  }

  if (led) {
    led.position.x = -0.410;
    if (number === 4) led.position.y = 0.43875;
  }
}

function cloneLedMaterial(door: THREE.Object3D): THREE.MeshStandardMaterial | null {
  const led = findLed(door);
  if (!(led instanceof THREE.Mesh)) return null;

  const source = led.material;
  if (!(source instanceof THREE.MeshStandardMaterial)) return null;

  const material = source.clone();
  const green = 0x28ff86;
  material.color.setHex(green);
  material.emissive.setHex(green);
  material.emissiveIntensity = 3.2;
  led.material = material;
  return material;
}

export async function loadRoom(
  url: string,
  onProgress?: (fraction: number) => void,
): Promise<RoomAssets> {
  const gltf = await loadGltf(url, onProgress);
  const room = gltf.scene;
  room.name = 'LockerRoom';

  const removals: THREE.Object3D[] = [];
  room.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
    if (isProxyMesh(gltf, object)) removals.push(object);
  });
  removals.forEach((object) => object.parent?.remove(object));
  tuneMaterials(room);
  room.updateMatrixWorld(true);

  const towers: TowerRecord[] = [];
  room.traverse((object) => {
    const meta = TOWER_META[object.name];
    if (!meta) return;

    const size = MODEL_SPECS[meta.model];
    if (!size) {
      throw new Error(`Missing locker specification for model ${meta.model}`);
    }

    const tower: TowerRecord = {
      node: object,
      label: meta.label,
      model: meta.model,
      wall: meta.wall,
      size,
      doors: [],
    };

    object.traverse((child) => {
      const match = /^E04A_Door_0([1-4])(?:_\d+)?$/.exec(child.name);
      if (!match) return;

      const number = Number(match[1]);
      const side = number === 1 || number === 3 ? 'left' : 'right';
      fixDoorHardware(child, number);
      const door: DoorRecord = {
        node: child,
        tower,
        number,
        side,
        closedAngle: child.rotation.y,
        openAngle: side === 'left' ? -Math.PI / 2 : Math.PI / 2,
        isOpen: false,
        isOccupied: false,
        ledMaterial: cloneLedMaterial(child),
      };

      child.userData.__door = door;
      tower.doors.push(door);
    });

    object.userData.__tower = tower;
    towers.push(tower);
  });

  towers.sort((a, b) => a.label.localeCompare(b.label));
  towers.forEach((tower) => {
    tower.doors.sort((a, b) => a.number - b.number);
    const subtitle =
      tower.label === FEATURED_SIZE_TOWER
        ? `${tower.size.tier} · ${tower.size.compartment.height} × ${tower.size.compartment.width} × ${tower.size.compartment.depth} mm`
        : undefined;
    const label = createTowerLabel(tower.label, subtitle);
    label.position.set(0.5, subtitle ? 2.1 : 2.03, 0.02);
    tower.node.add(label);
  });

  const cutaway = CUTAWAY_NAMES.map((name) => room.getObjectByName(name)).filter(
    (object): object is THREE.Object3D => object !== undefined,
  );

  return {
    room,
    towers,
    doors: towers.flatMap((tower) => tower.doors),
    cutaway,
  };
}

export async function loadLuggage(
  url: string,
  onProgress?: (fraction: number) => void,
): Promise<THREE.Group> {
  const gltf = await loadGltf(url, onProgress);
  const luggage = gltf.scene;
  luggage.name = 'Suitcase';

  const removals: THREE.Object3D[] = [];
  luggage.traverse((object) => {
    if (object.name === 'Floor' || object.name === 'Studio_Floor') {
      removals.push(object);
    }
    if (object instanceof THREE.Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  removals.forEach((object) => object.parent?.remove(object));

  luggage.userData.__luggage = true;
  return luggage;
}
