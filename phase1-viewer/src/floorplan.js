import * as THREE from 'three';

const WALL_HEIGHT = 2.5;
const WALL_THICKNESS = 0.1;

/**
 * Builds one wall segment (a solid box) of a given length,
 * positioned at segmentMidDist along the start->end direction.
 */
function createWallSegment(start, ux, uz, angle, fromDist, toDist) {
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

  return wall;
}

/**
 * Builds a wall between start and end. If `openings` is empty, this is
 * one solid segment (same as before). If openings are given, the wall
 * is split into multiple segments with gaps left at each opening.
 *
 * Each opening: { offset, width } — offset = distance from `start`
 * where the gap begins, width = how wide the gap is, both in meters
 * along the wall's own direction.
 */
function createWall(start, end, openings = []) {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(dz, dx);
  const ux = dx / length; // unit direction vector (x component)
  const uz = dz / length; // unit direction vector (z component)

  const group = new THREE.Group();

  if (openings.length === 0) {
    group.add(createWallSegment(start, ux, uz, angle, 0, length));
    return group;
  }

  // Sort openings by where they start along the wall, so we can walk
  // along the wall left-to-right and build solid segments in the gaps.
  const sorted = [...openings].sort((a, b) => a.offset - b.offset);

  let cursor = 0;
  for (const opening of sorted) {
    if (opening.offset > cursor) {
      group.add(createWallSegment(start, ux, uz, angle, cursor, opening.offset));
    }
    cursor = opening.offset + opening.width;
  }
  if (cursor < length) {
    group.add(createWallSegment(start, ux, uz, angle, cursor, length));
  }

  return group;
}

function createFloor(corners) {
  // Find the min/max X and Z across this room's corners to determine
  // the floor's size and center position.
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
    side: THREE.DoubleSide
  });
  const floor = new THREE.Mesh(geometry, material);

  floor.rotation.x = -Math.PI / 2;
  floor.position.set(centerX, 0, centerZ); // <-- the missing piece: actually placing it

  return floor;
}

/**
 * corners: list of {x, z} points, in order, forming a closed loop.
 * openings: list of { wallStart, wallEnd, offset, width }, where
 * wallStart/wallEnd are corner indices identifying which wall the
 * opening belongs to.
 */
export function buildRoom(corners, openings = []) {
  const room = new THREE.Group();

  for (let i = 0; i < corners.length; i++) {
    const start = corners[i];
    const end = corners[(i + 1) % corners.length];

    const wallOpenings = openings
      .filter((o) => o.wallStart === i && o.wallEnd === (i + 1) % corners.length)
      .map((o) => ({ offset: o.offset, width: o.width }));

    room.add(createWall(start, end, wallOpenings));
  }

  const floor = createFloor(corners); // still hardcoded size for now, fine for this step
  room.add(floor);

  return room;
}

export function buildFloorPlan(floorPlan) {
  const allRooms = new THREE.Group();

  for (const roomData of floorPlan.rooms) {
    const roomMesh = buildRoom(roomData.corners, roomData.openings || []);
    roomMesh.name = roomData.id;
    allRooms.add(roomMesh);
  }

  return allRooms;
}