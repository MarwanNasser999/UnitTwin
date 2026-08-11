import * as THREE from 'three';
import { applyPBRTexture } from './textures.js';

const WALL_HEIGHT = 2.5;
const WALL_THICKNESS = 0.1;

function createWallSegment(start, ux, uz, angle, fromDist, toDist, wallId) {
  const segLength = toDist - fromDist;
  const midDist = (fromDist + toDist) / 2;

  const geometry = new THREE.BoxGeometry(segLength, WALL_HEIGHT, WALL_THICKNESS);
  const material = new THREE.MeshStandardMaterial({ color: 0xd8d8d0 });
  const wall = new THREE.Mesh(geometry, material);

  wall.position.set(
    start.x + ux * midDist,
    WALL_HEIGHT / 2,
    start.z + uz * midDist
  );
  wall.rotation.y = -angle;
  wall.name = wallId;

  return wall;
}

function buildWall(wallData) {
  const { start, end, openings = [], id } = wallData;

  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(dz, dx);
  const ux = dx / length;
  const uz = dz / length;

  const group = new THREE.Group();
  group.name = `${id}_group`;

  if (openings.length === 0) {
    group.add(createWallSegment(start, ux, uz, angle, 0, length, id));
    return group;
  }

  const sorted = [...openings].sort((a, b) => a.offset - b.offset);
  let cursor = 0;
  for (const opening of sorted) {
    if (opening.offset > cursor) {
      group.add(createWallSegment(start, ux, uz, angle, cursor, opening.offset, id));
    }
    cursor = opening.offset + opening.width;
  }
  if (cursor < length) {
    group.add(createWallSegment(start, ux, uz, angle, cursor, length, id));
  }

  return group;
}

function buildRoomShape(corners) {
  const shape = new THREE.Shape();
  shape.moveTo(corners[0].x, corners[0].z);
  for (let i = 1; i < corners.length; i++) {
    shape.lineTo(corners[i].x, corners[i].z);
  }
  shape.lineTo(corners[0].x, corners[0].z);
  return shape;
}

/**
 * Generates proper UV coordinates for a ShapeGeometry based on each
 * vertex's real X/Z position, normalized against the room's bounds.
 * Without this, ShapeGeometry's default UVs don't tile textures
 * sensibly for non-rectangular shapes.
 */
function applyShapeUVs(geometry, corners) {
  const xs = corners.map((c) => c.x);
  const zs = corners.map((c) => c.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);

  const width = maxX - minX || 1;
  const depth = maxZ - minZ || 1;

  const position = geometry.attributes.position;
  const uv = new Float32Array(position.count * 2);

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i); // ShapeGeometry builds flat on X/Y before we rotate it

    uv[i * 2] = (x - minX) / width;
    uv[i * 2 + 1] = (y - minZ) / depth;
  }

  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

function createFloor(corners) {
  const shape = buildRoomShape(corners);
  const geometry = new THREE.ShapeGeometry(shape);
  applyShapeUVs(geometry, corners);

  const material = new THREE.MeshStandardMaterial({
    color: 0x999999,
    side: THREE.DoubleSide,
  });
  const floor = new THREE.Mesh(geometry, material);
  floor.name = 'floor';
  floor.rotation.x = -Math.PI / 2;

  return floor;
}

function createCeiling(corners, wallHeight) {
  const shape = buildRoomShape(corners);
  const geometry = new THREE.ShapeGeometry(shape);
  applyShapeUVs(geometry, corners);

  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
  });
  const ceiling = new THREE.Mesh(geometry, material);
  ceiling.name = 'ceiling';
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = wallHeight;

  return ceiling;
}
let currentFloorPlanRef = null;
export function buildFloorPlan(floorPlan) {
  currentFloorPlanRef = floorPlan;
  const root = new THREE.Group();

  const wallsGroup = new THREE.Group();
  wallsGroup.name = 'walls';
  for (const wallData of floorPlan.walls) {
    wallsGroup.add(buildWall(wallData));
  }
  root.add(wallsGroup);

  for (const roomData of floorPlan.rooms) {
    const roomGroup = new THREE.Group();
    roomGroup.name = roomData.id;
    roomGroup.add(createFloor(roomData.corners));
    roomGroup.add(createCeiling(roomData.corners, WALL_HEIGHT));
    root.add(roomGroup);
  }

  return root;
}

export function applyWallColor(floorPlanRoot, wallId, colorHex) {
  floorPlanRoot.traverse((child) => {
    if (child.isMesh && child.name === wallId) {
      child.material.map = null;
      child.material.normalMap = null;
      child.material.roughnessMap = null;
      child.material.color.set(colorHex);
      child.material.needsUpdate = true;
    }
  });
}

export function applyFloorColor(floorPlanRoot, roomId, colorHex) {
  const room = floorPlanRoot.getObjectByName(roomId);
  if (!room) return;

  room.traverse((child) => {
    if (child.isMesh && child.name === 'floor') {
      child.material.map = null;
      child.material.normalMap = null;
      child.material.roughnessMap = null;
      child.material.color.set(colorHex);
      child.material.needsUpdate = true;
    }
  });
}

export function applyWallTexture(floorPlanRoot, wallId, textureFolder) {
  floorPlanRoot.traverse((child) => {
    if (child.isMesh && child.name === wallId) {
      const width = child.geometry.parameters.width;
      applyPBRTexture(child, textureFolder, width, WALL_HEIGHT, 0.5);
    }
  });
}

export function applyFloorTexture(floorPlanRoot, roomId, textureFolder) {
  const room = floorPlanRoot.getObjectByName(roomId);
  if (!room) return;

  const roomData = currentFloorPlanRef.rooms.find((r) => r.id === roomId);
  const xs = roomData.corners.map((c) => c.x);
  const zs = roomData.corners.map((c) => c.z);
  const width = Math.max(...xs) - Math.min(...xs);
  const depth = Math.max(...zs) - Math.min(...zs);

  room.traverse((child) => {
    if (child.isMesh && child.name === 'floor') {
      applyPBRTexture(child, textureFolder, width, depth, 0.5);
    }
  });
}

export function applyCeilingTexture(floorPlanRoot, roomId, textureFolder) {
  const room = floorPlanRoot.getObjectByName(roomId);
  if (!room) return;

  const roomData = currentFloorPlanRef.rooms.find((r) => r.id === roomId);
  const xs = roomData.corners.map((c) => c.x);
  const zs = roomData.corners.map((c) => c.z);
  const width = Math.max(...xs) - Math.min(...xs);
  const depth = Math.max(...zs) - Math.min(...zs);

  room.traverse((child) => {
    if (child.isMesh && child.name === 'ceiling') {
      applyPBRTexture(child, textureFolder, width, depth, 0.5);
    }
  });
}

export function applyCeilingColor(floorPlanRoot, roomId, colorHex) {
  const room = floorPlanRoot.getObjectByName(roomId);
  if (!room) return;

  room.traverse((child) => {
    if (child.isMesh && child.name === 'ceiling') {
      child.material.map = null;
      child.material.normalMap = null;
      child.material.roughnessMap = null;
      child.material.color.set(colorHex);
      child.material.needsUpdate = true;
    }
  });
}

export function getWallOBB(wallMesh) {
  return {
    x: wallMesh.position.x,
    z: wallMesh.position.z,
    halfWidth: wallMesh.geometry.parameters.width / 2,
    halfDepth: wallMesh.geometry.parameters.depth / 2,
    rotation: wallMesh.rotation.y,
  };
}