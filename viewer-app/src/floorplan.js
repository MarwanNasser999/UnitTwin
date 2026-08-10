import * as THREE from 'three';

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

function createFloor(corners) {
  const xs = corners.map((c) => c.x);
  const zs = corners.map((c) => c.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);

  const width = maxX - minX;
  const depth = maxZ - minZ;
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;

  const geometry = new THREE.PlaneGeometry(width, depth);
  const material = new THREE.MeshStandardMaterial({
    color: 0x999999,
    side: THREE.DoubleSide,
  });
  const floor = new THREE.Mesh(geometry, material);
  floor.name = 'floor';

  floor.rotation.x = -Math.PI / 2;
  floor.position.set(centerX, 0, centerZ);

  return floor;
}

export function buildFloorPlan(floorPlan) {
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
    root.add(roomGroup);
  }

  return root;
}

export function applyWallColor(floorPlanRoot, wallId, colorHex) {
  floorPlanRoot.traverse((child) => {
    if (child.isMesh && child.name === wallId) {
      child.material.color.set(colorHex);
    }
  });
}

export function applyFloorColor(floorPlanRoot, roomId, colorHex) {
  const room = floorPlanRoot.getObjectByName(roomId);
  if (!room) return;

  room.traverse((child) => {
    if (child.isMesh && child.name === 'floor') {
      child.material.color.set(colorHex);
    }
  });
}

/**
 * Returns an OBB ({x, z, halfWidth, halfDepth, rotation}) for a wall
 * mesh, derived from its actual BoxGeometry dimensions and transform.
 */
export function getWallOBB(wallMesh) {
  return {
    x: wallMesh.position.x,
    z: wallMesh.position.z,
    halfWidth: wallMesh.geometry.parameters.width / 2,
    halfDepth: wallMesh.geometry.parameters.depth / 2,
    rotation: wallMesh.rotation.y,
  };
}