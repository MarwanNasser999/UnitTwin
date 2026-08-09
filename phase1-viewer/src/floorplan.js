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

/**
 * Builds ONE wall (possibly split into multiple segments if it has
 * openings) from a single wall data entry. Returns a THREE.Group.
 */
function buildWall(wallData) {
  const { start, end, openings = [], id } = wallData;

  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(dz, dx);
  const ux = dx / length;
  const uz = dz / length;

  const group = new THREE.Group();
  group.name = `${id}_group`; // the group itself; individual segments carry the real id

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

/**
 * Builds the entire floor plan: each wall built exactly once (from
 * floorPlan.walls), plus one floor per room (from floorPlan.rooms).
 * Rooms no longer own/duplicate their walls — they just reference them
 * via wallIds, which is used elsewhere (not for geometry building).
 */
export function buildFloorPlan(floorPlan) {
  const root = new THREE.Group();

  // Build every wall once.
  const wallsGroup = new THREE.Group();
  wallsGroup.name = 'walls';
  for (const wallData of floorPlan.walls) {
    wallsGroup.add(buildWall(wallData));
  }
  root.add(wallsGroup);

  // Build one floor per room.
  for (const roomData of floorPlan.rooms) {
    const roomGroup = new THREE.Group();
    roomGroup.name = roomData.id;
    roomGroup.add(createFloor(roomData.corners));
    root.add(roomGroup);
  }

  return root;
}

/**
 * Recolors a wall by its unique id. Walls now live directly under the
 * "walls" group, not nested inside a room, so we search the whole
 * floor plan root rather than looking inside a specific room first.
 */
export function applyWallColor(floorPlanRoot, wallId, colorHex) {
  floorPlanRoot.traverse((child) => {
    if (child.isMesh && child.name === wallId) {
      child.material.color.set(colorHex);
    }
  });
}

/**
 * Recolors a room's floor by room id.
 */
export function applyFloorColor(floorPlanRoot, roomId, colorHex) {
  const room = floorPlanRoot.getObjectByName(roomId);
  if (!room) return;

  room.traverse((child) => {
    if (child.isMesh && child.name === 'floor') {
      child.material.color.set(colorHex);
    }
  });
}