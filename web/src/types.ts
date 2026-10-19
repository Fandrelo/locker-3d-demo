import type * as THREE from 'three';

export type DoorSide = 'left' | 'right';

/**
 * Locker compartment sizing in millimetres.
 * Source: lockers-physical-infra/winnsen.md, section 2.
 */
export interface LockerSize {
  tier: string;
  doorsPerTower: number;
  /** Compartment interior: height × width × depth, in millimetres. */
  compartment: { height: number; width: number; depth: number };
  volumeLitres: number;
}

export interface TowerRecord {
  node: THREE.Object3D;
  label: string;
  model: string;
  wall: string;
  size: LockerSize;
  doors: DoorRecord[];
}

export interface DoorRecord {
  node: THREE.Object3D;
  tower: TowerRecord;
  number: number;
  side: DoorSide;
  closedAngle: number;
  openAngle: number;
  isOpen: boolean;
  isOccupied: boolean;
  ledMaterial: THREE.MeshStandardMaterial | null;
}

export interface RoomAssets {
  room: THREE.Group;
  towers: TowerRecord[];
  doors: DoorRecord[];
  cutaway: THREE.Object3D[];
}

export type LuggageMode = 'free' | 'selected' | 'moving' | 'stowed';
