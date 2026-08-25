import * as THREE from 'three';
import { applyPBRTexture } from './textures.js';

import { PRESENTATION_SCALE } from './config.js';

const WALL_HEIGHT = 2.5 * PRESENTATION_SCALE;
const WALL_THICKNESS = 0.1 * PRESENTATION_SCALE;

// Walls extend half a thickness past each end so perpendicular walls
// fill the corner square instead of leaving a notch.
const CORNER_EXTEND = WALL_THICKNESS / 2;

const FRAME_THICKNESS = 0.12 * PRESENTATION_SCALE;
const FRAME_DEPTH = WALL_THICKNESS * 0.9;

function createWallSegment(start, ux, uz, angle, fromDist, toDist, wallId) {
  const segLength = toDist - fromDist;
  const midDist = (fromDist + toDist) / 2;

  const geometry = new THREE.BoxGeometry(segLength, WALL_HEIGHT, WALL_THICKNESS);

  const sharedMaterial = new THREE.MeshStandardMaterial({ color: 0xd8d8d0 });
  const materials = [
    sharedMaterial,
    sharedMaterial,
    sharedMaterial,
    sharedMaterial,
    new THREE.MeshStandardMaterial({ color: 0xd8d8d0 }),
    new THREE.MeshStandardMaterial({ color: 0xd8d8d0 }),
  ];

  const wall = new THREE.Mesh(geometry, materials);

  wall.position.set(
    start.x + ux * midDist,
    WALL_HEIGHT / 2,
    start.z + uz * midDist
  );

  wall.rotation.y = -angle;
  wall.name = wallId;

  return wall;
}

/**
 * Builds the framed door filling one opening on a wall.
 *
 * The opening is given as a distance range along the wall, so the
 * door is positioned using the wall's own direction and origin —
 * it cannot land anywhere except exactly in its opening.
 */
function createDoorForOpening(start, ux, uz, angle, fromDist, toDist) {
  const openingWidth = toDist - fromDist;
  const midDist = (fromDist + toDist) / 2;

  // The frame straddles the opening's edges.
    const frameSpan = openingWidth;
  const panelWidth = openingWidth - FRAME_THICKNESS * 2;
  const panelHeight = WALL_HEIGHT - FRAME_THICKNESS;

  const doorGroup = new THREE.Group();
  doorGroup.position.set(
    start.x + ux * midDist,
    0,
    start.z + uz * midDist
  );
  doorGroup.rotation.y = -angle;
  doorGroup.name = 'door_decorative';

  const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x5c3a21 });

  const leftPost = new THREE.Mesh(
    new THREE.BoxGeometry(FRAME_THICKNESS, WALL_HEIGHT, FRAME_DEPTH),
    frameMaterial
  );
  leftPost.position.set(-frameSpan / 2 + FRAME_THICKNESS / 2, WALL_HEIGHT / 2, 0);
  doorGroup.add(leftPost);

  const rightPost = new THREE.Mesh(
    new THREE.BoxGeometry(FRAME_THICKNESS, WALL_HEIGHT, FRAME_DEPTH),
    frameMaterial
  );

  rightPost.position.set(frameSpan / 2 - FRAME_THICKNESS / 2, WALL_HEIGHT / 2, 0);
  doorGroup.add(rightPost);

  const lintel = new THREE.Mesh(
    new THREE.BoxGeometry(frameSpan, FRAME_THICKNESS, FRAME_DEPTH),
    frameMaterial
  );
  lintel.position.set(0, WALL_HEIGHT - FRAME_THICKNESS / 2, 0);
  doorGroup.add(lintel);

  const doorMaterial = new THREE.MeshStandardMaterial({ color: 0x8b5a2b });
  const doorPanel = new THREE.Mesh(
    new THREE.BoxGeometry(panelWidth, panelHeight, WALL_THICKNESS * 0.6),
    doorMaterial
  );

  const doorPivot = new THREE.Group();
    doorPivot.position.set(-frameSpan / 2 + FRAME_THICKNESS, panelHeight / 2, 0);
  doorPanel.position.set(panelWidth / 2, 0, 0);
  doorPivot.add(doorPanel);
  doorPivot.name = 'door_pivot';
  doorGroup.add(doorPivot);

  const handleMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });

  const handleOutside = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.04, 0.12), handleMaterial
  );
  handleOutside.position.set(panelWidth / 2 - 0.08, 0, WALL_THICKNESS * 0.4);
  doorPanel.add(handleOutside);

  const handleInside = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.04, 0.12), handleMaterial
  );
  handleInside.position.set(panelWidth / 2 - 0.08, 0, -WALL_THICKNESS * 0.4);
  doorPanel.add(handleInside);

  return doorGroup;
}

function buildWall(wallData) {
  const start = wallData.start;
  const end = wallData.end;
  const openings = wallData.openings || [];
  const id = wallData.id;

  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.sqrt(dx * dx + dz * dz);
  if (length === 0) return new THREE.Group();

  const angle = Math.atan2(dz, dx);
  const ux = dx / length;
  const uz = dz / length;

  const group = new THREE.Group();
  group.name = id + '_group';

  if (openings.length === 0) {
    group.add(
      createWallSegment(start, ux, uz, angle, -CORNER_EXTEND, length + CORNER_EXTEND, id)
    );
    return group;
  }

    const sorted = openings.slice().sort(function (a, b) { return a.offset - b.offset; });
  let cursor = -CORNER_EXTEND;
  let isFirstSegment = true;

  for (const opening of sorted) {
    const openStart = opening.offset;
    const openEnd = opening.offset + opening.width;

    if (openStart > cursor) {
      group.add(createWallSegment(start, ux, uz, angle, cursor, openStart, id));
    }

    group.add(createDoorForOpening(start, ux, uz, angle, openStart, openEnd));

    cursor = openEnd;
    isFirstSegment = false;
  }

  if (cursor < length + CORNER_EXTEND) {
    group.add(createWallSegment(start, ux, uz, angle, cursor, length + CORNER_EXTEND, id));
  }

  return group;
}

function signedArea(corners) {
  let sum = 0;
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    sum += a.x * b.z - b.x * a.z;
  }
  return sum / 2;
}

function buildRoomShape(corners) {
  const cleaned = corners.filter(function (c, i) {
    const prev = corners[(i - 1 + corners.length) % corners.length];
    return Math.hypot(c.x - prev.x, c.z - prev.z) > 0.01;
  });

  const ordered = signedArea(cleaned) < 0 ? cleaned.slice().reverse() : cleaned;

  const shape = new THREE.Shape();
  shape.moveTo(ordered[0].x, ordered[0].z);
  for (let i = 1; i < ordered.length; i++) {
    shape.lineTo(ordered[i].x, ordered[i].z);
  }
  shape.lineTo(ordered[0].x, ordered[0].z);
  return shape;
}

function applyShapeUVs(geometry, corners) {
  const xs = corners.map(function (c) { return c.x; });
  const zs = corners.map(function (c) { return c.z; });

  const minX = Math.min.apply(null, xs);
  const maxX = Math.max.apply(null, xs);
  const minZ = Math.min.apply(null, zs);
  const maxZ = Math.max.apply(null, zs);

  const width = (maxX - minX) || 1;
  const depth = (maxZ - minZ) || 1;

  const position = geometry.attributes.position;
  const uv = new Float32Array(position.count * 2);

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);

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
  floor.rotation.x = Math.PI / 2;

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

  for (const roomData of floorPlan.rooms) {
    const roomGroup = new THREE.Group();
    roomGroup.name = roomData.id;
    roomGroup.add(createFloor(roomData.corners));
    roomGroup.add(createCeiling(roomData.corners, WALL_HEIGHT));
    root.add(roomGroup);
  }

  root.add(wallsGroup);

  return root;
}

export function applyWallColor(floorPlanRoot, wallId, colorHex, faceIndex) {
  floorPlanRoot.traverse(function (child) {
    if (child.isMesh && child.name === wallId && Array.isArray(child.material)) {
      const indicesToUpdate = [faceIndex, 0, 1];
      for (const idx of indicesToUpdate) {
        const mat = child.material[idx];
        mat.map = null;
        mat.normalMap = null;
        mat.roughnessMap = null;
        mat.color.set(colorHex);
        mat.needsUpdate = true;
      }
    }
  });
}

export function applyFloorColor(floorPlanRoot, roomId, colorHex) {
  const room = floorPlanRoot.getObjectByName(roomId);
  if (!room) return;

  room.traverse(function (child) {
    if (child.isMesh && child.name === 'floor') {
      child.material.map = null;
      child.material.normalMap = null;
      child.material.roughnessMap = null;
      child.material.color.set(colorHex);
      child.material.needsUpdate = true;
    }
  });
}

export function applyWallTexture(floorPlanRoot, wallId, textureFolder, faceIndex) {
  floorPlanRoot.traverse(function (child) {
    if (child.isMesh && child.name === wallId && Array.isArray(child.material)) {
      const width = child.geometry.parameters.width;
      const indicesToUpdate = [faceIndex, 0, 1];
      for (const idx of indicesToUpdate) {
        const mat = child.material[idx];
        applyPBRTexture({ material: mat }, textureFolder, width, WALL_HEIGHT, 0.5);
      }
    }
  });
}

export function applyFloorTexture(floorPlanRoot, roomId, textureFolder) {
  const room = floorPlanRoot.getObjectByName(roomId);
  if (!room) return;

  const roomData = currentFloorPlanRef.rooms.find(function (r) { return r.id === roomId; });
  const xs = roomData.corners.map(function (c) { return c.x; });
  const zs = roomData.corners.map(function (c) { return c.z; });
  const width = Math.max.apply(null, xs) - Math.min.apply(null, xs);
  const depth = Math.max.apply(null, zs) - Math.min.apply(null, zs);

  room.traverse(function (child) {
    if (child.isMesh && child.name === 'floor') {
      applyPBRTexture(child, textureFolder, width, depth, 0.5);
    }
  });
}

export function applyCeilingTexture(floorPlanRoot, roomId, textureFolder) {
  const room = floorPlanRoot.getObjectByName(roomId);
  if (!room) return;

  const roomData = currentFloorPlanRef.rooms.find(function (r) { return r.id === roomId; });
  const xs = roomData.corners.map(function (c) { return c.x; });
  const zs = roomData.corners.map(function (c) { return c.z; });
  const width = Math.max.apply(null, xs) - Math.min.apply(null, xs);
  const depth = Math.max.apply(null, zs) - Math.min.apply(null, zs);

  room.traverse(function (child) {
    if (child.isMesh && child.name === 'ceiling') {
      applyPBRTexture(child, textureFolder, width, depth, 0.5);
    }
  });
}

export function applyCeilingColor(floorPlanRoot, roomId, colorHex) {
  const room = floorPlanRoot.getObjectByName(roomId);
  if (!room) return;

  room.traverse(function (child) {
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