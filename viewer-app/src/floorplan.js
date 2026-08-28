import * as THREE from 'three';
import { applyPBRTexture } from './textures.js';

import { PRESENTATION_SCALE } from './config.js';

const WALL_HEIGHT = 2.5 * PRESENTATION_SCALE;
const WALL_THICKNESS = 0.1 * PRESENTATION_SCALE;
const CORNER_EXTEND = WALL_THICKNESS / 2;
const FRAME_THICKNESS = 0.12 * PRESENTATION_SCALE;

// A storey's ceiling sits at wall height, and the storey above
// starts its floor at exactly that height — two coincident
// surfaces across the whole building. Dropping the ceiling a
// couple of centimetres separates them while keeping both
// paintable. The gap is behind the walls, so it never shows.
const CEILING_INSET = 0.02 * PRESENTATION_SCALE;

// Balconies: a railing on the open edges, and an overhang above
// that projects from the building but stops short of the edge —
// which is what makes it read as a balcony rather than a room
// with its roof missing.
const RAILING_HEIGHT = 1.1 * PRESENTATION_SCALE;
const RAILING_THICKNESS = 0.06 * PRESENTATION_SCALE;
const RAILING_CAP = 0.05 * PRESENTATION_SCALE;
const OVERHANG_THICKNESS = 0.15 * PRESENTATION_SCALE;
const OVERHANG_SETBACK = 0.35 * PRESENTATION_SCALE;
const FRAME_DEPTH = WALL_THICKNESS * 0.9;

function createWallSegment(
  start, ux, uz, angle, fromDist, toDist, wallId, fromHeight, toHeight
) {
  const yLo = fromHeight === undefined ? 0 : fromHeight;
  const yHi = toHeight === undefined ? WALL_HEIGHT : toHeight;

  const segLength = toDist - fromDist;
  const segHeight = yHi - yLo;
  const midDist = (fromDist + toDist) / 2;

  const geometry = new THREE.BoxGeometry(segLength, segHeight, WALL_THICKNESS);

  const sharedMaterial = new THREE.MeshStandardMaterial({
    color: 0xd8d8d0,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });

  const materials = [
    sharedMaterial,
    sharedMaterial,
    sharedMaterial,
    sharedMaterial,
    new THREE.MeshStandardMaterial({
      color: 0xd8d8d0, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
    }),
    new THREE.MeshStandardMaterial({
      color: 0xd8d8d0, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
    }),
  ];

  const wall = new THREE.Mesh(geometry, materials);

  wall.position.set(
    start.x + ux * midDist,
    yLo + segHeight / 2,
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
function createDoorForOpening(start, ux, uz, angle, fromDist, toDist, swing) {
  const openingWidth = toDist - fromDist;
  const midDist = (fromDist + toDist) / 2;

  // The frame straddles the opening's edges.
    const frameSpan = openingWidth - 0.02;
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
  // Which side the door swings into, chosen at trace time.
  doorPivot.userData.swing = swing === -1 ? -1 : 1;
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

function createWindowForOpening(start, ux, uz, angle, fromDist, toDist, sill, head, interiorSide) {
  const openingWidth = toDist - fromDist;
  const openingHeight = head - sill;
  const midDist = (fromDist + toDist) / 2;

  const group = new THREE.Group();
  group.position.set(
    start.x + ux * midDist,
    0,
    start.z + uz * midDist
  );
  group.rotation.y = -angle;
  group.name = 'window_decorative';

  const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x5c3a21 });
  const FRAME_DEPTH = WALL_THICKNESS * 0.9;
  const F = FRAME_THICKNESS * 0.7;

  const midY = sill + openingHeight / 2;

  const leftPost = new THREE.Mesh(
    new THREE.BoxGeometry(F, openingHeight, FRAME_DEPTH), frameMaterial
  );
  leftPost.position.set(-openingWidth / 2 + F / 2, midY, 0);
  group.add(leftPost);

  const rightPost = new THREE.Mesh(
    new THREE.BoxGeometry(F, openingHeight, FRAME_DEPTH), frameMaterial
  );
  rightPost.position.set(openingWidth / 2 - F / 2, midY, 0);
  group.add(rightPost);

  const head_ = new THREE.Mesh(
    new THREE.BoxGeometry(openingWidth, F, FRAME_DEPTH), frameMaterial
  );
  head_.position.set(0, head - F / 2, 0);
  group.add(head_);

  const sill_ = new THREE.Mesh(
    new THREE.BoxGeometry(openingWidth, F, FRAME_DEPTH), frameMaterial
  );
  sill_.position.set(0, sill + F / 2, 0);
  group.add(sill_);

  const paneW = openingWidth - F * 2;
  const paneH = openingHeight - F * 2;

  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(paneW, paneH, WALL_THICKNESS * 0.15),
    new THREE.MeshStandardMaterial({
      color: 0xaaccdd,
      transparent: true,
      opacity: 0.35,
    })
  );

  const pivot = new THREE.Group();
  pivot.position.set(-paneW / 2, midY, 0);
  glass.position.set(paneW / 2, 0, 0);
  pivot.add(glass);
  pivot.name = 'window_pivot';
  // Which side of the wall is the room this window belongs to.
  // Recorded when placed; used so it only opens from inside.
  pivot.userData.interiorSide = interiorSide === -1 ? -1 : 1;
  pivot.userData.wallStart = { x: start.x, z: start.z };
  pivot.userData.wallDir = { ux: ux, uz: uz };
  group.add(pivot);

  return group;
}

/**
 * At a corner, both meeting walls used to extend half a thickness
 * into the same square — their painted faces then sat in the same
 * plane and flickered as the camera moved. Instead, exactly one wall
 * owns each corner and extends into it; the others stop short.
 *
 * Ownership is by position, so it is stable across rebuilds: the
 * first wall in the list touching a given point owns that point.
 */
let cornerOwners = {};

function cornerKey(p) {
  return p.x.toFixed(2) + ',' + p.z.toFixed(2);
}

function computeCornerOwners(walls) {
  cornerOwners = {};

  for (const w of walls) {
    const kStart = cornerKey(w.start);
    const kEnd = cornerKey(w.end);

    if (cornerOwners[kStart] === undefined) {
      cornerOwners[kStart] = w.id + ':start';
    }
    if (cornerOwners[kEnd] === undefined) {
      cornerOwners[kEnd] = w.id + ':end';
    }
  }
}

function ownsCorner(wallData, which) {
  const p = which === 'start' ? wallData.start : wallData.end;
  return cornerOwners[cornerKey(p)] === wallData.id + ':' + which;
}

function buildWall(wallData) {
  const start = wallData.start;
  const end = wallData.end;
  const openings = wallData.openings || [];
  const windows = wallData.windows || [];
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

  // Only extend into a corner this wall owns.
  const extStart = ownsCorner(wallData, 'start') ? CORNER_EXTEND : 0;
  const extEnd = ownsCorner(wallData, 'end') ? CORNER_EXTEND : 0;

  // Every feature that interrupts the wall, sorted along its length.
  const features = [];

  for (const o of openings) {
    features.push({
      kind: 'door',
      from: o.offset,
      to: o.offset + o.width,
      swing: o.swing,
    });
  }

  for (const w of windows) {
    features.push({
      kind: 'window',
      from: w.offset,
      to: w.offset + w.width,
      sill: w.sillHeight,
      head: w.headHeight,
      interiorSide: w.interiorSide,
    });
  }

  features.sort(function (a, b) { return a.from - b.from; });

  if (features.length === 0) {
    group.add(
      createWallSegment(start, ux, uz, angle, -extStart, length + extEnd, id)
    );
    return group;
  }

  let cursor = -extStart;

  for (const f of features) {
    if (f.kind === 'door') {
      // Wall stops short by the frame thickness; the posts fill it.
      if (f.from - FRAME_THICKNESS > cursor) {
        group.add(
          createWallSegment(start, ux, uz, angle, cursor, f.from - FRAME_THICKNESS, id)
        );
      }
      group.add(createDoorForOpening(start, ux, uz, angle, f.from, f.to, f.swing));
      cursor = f.to + FRAME_THICKNESS;
    } else {
      // Solid wall up to the window.
      if (f.from > cursor) {
        group.add(createWallSegment(start, ux, uz, angle, cursor, f.from, id));
      }
      // Wall below the sill and above the head; the window fills between.
      if (f.sill > 0) {
        group.add(createWallSegment(start, ux, uz, angle, f.from, f.to, id, 0, f.sill));
      }
      if (f.head < WALL_HEIGHT) {
        group.add(
          createWallSegment(start, ux, uz, angle, f.from, f.to, id, f.head, WALL_HEIGHT)
        );
      }
      group.add(createWindowForOpening(start, ux, uz, angle, f.from, f.to, f.sill, f.head, f.interiorSide));
      cursor = f.to;
    }
  }

  if (cursor < length + extEnd) {
    group.add(createWallSegment(start, ux, uz, angle, cursor, length + extEnd, id));
  }

  return group;
}

export function rebuildWall(floorPlanRoot, wallData) {
  const wallsGroup = floorPlanRoot.getObjectByName('walls');
  if (!wallsGroup) return null;

  const existing = wallsGroup.children.find(function (c) {
    return c.name === wallData.id + '_group';
  });

  if (existing) {
    existing.traverse(function (o) {
      if (o.isMesh) {
        o.geometry.dispose();
        if (Array.isArray(o.material)) {
          o.material.forEach(function (m) { m.dispose(); });
        } else if (o.material) {
          o.material.dispose();
        }
      }
    });
    wallsGroup.remove(existing);
  }

  const rebuilt = buildWall(wallData);
  wallsGroup.add(rebuilt);
  return rebuilt;
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
  ceiling.position.y = wallHeight - CEILING_INSET;

  return ceiling;
}

/**
 * A railing along one open edge of a balcony: a thin panel with a
 * slightly wider cap along the top.
 */
function createRailing(a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length = Math.sqrt(dx * dx + dz * dz);
  if (length === 0) return null;

  const angle = Math.atan2(dz, dx);
  const midX = (a.x + b.x) / 2;
  const midZ = (a.z + b.z) / 2;

  const group = new THREE.Group();
  group.position.set(midX, 0, midZ);
  group.rotation.y = -angle;
  group.name = 'railing';

  const material = new THREE.MeshStandardMaterial({ color: 0xbdbdb5 });

  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(length, RAILING_HEIGHT - RAILING_CAP, RAILING_THICKNESS),
    material
  );
  panel.position.y = (RAILING_HEIGHT - RAILING_CAP) / 2;
  group.add(panel);

  const cap = new THREE.Mesh(
    new THREE.BoxGeometry(length, RAILING_CAP, RAILING_THICKNESS * 2.2),
    new THREE.MeshStandardMaterial({ color: 0x8a8a82 })
  );
  cap.position.y = RAILING_HEIGHT - RAILING_CAP / 2;
  group.add(cap);

  return group;
}

/**
 * Pulls the balcony outline back from its open edges only, leaving
 * the building side flush. Each corner moves inward by the setback
 * of whichever adjacent edges are open, so the overhang projects out
 * over the balcony and stops short of the railing.
 */
function setBackOpenEdges(corners, openEdges, setback) {
  const n = corners.length;
  const isOpen = {};
  (openEdges || []).forEach(function (i) { isOpen[i] = true; });

  // Inward is the side the polygon's interior sits on.
  const inward = signedArea(corners) < 0 ? -1 : 1;

  return corners.map(function (c, i) {
    let ox = 0;
    let oz = 0;

    // Edge i-1 arrives at this corner; edge i leaves it.
    [(i - 1 + n) % n, i].forEach(function (edge) {
      if (!isOpen[edge]) return;

      const a = corners[edge];
      const b = corners[(edge + 1) % n];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len === 0) return;

      ox += (-dz / len) * inward * setback;
      oz += (dx / len) * inward * setback;
    });

    return { x: c.x + ox, z: c.z + oz };
  });
}

function createBalconyOverhang(corners, openEdges, wallHeight) {
  const inset = setBackOpenEdges(corners, openEdges, OVERHANG_SETBACK);

  const shape = buildRoomShape(inset);
  const geometry = new THREE.ShapeGeometry(shape);
  applyShapeUVs(geometry, inset);

  const material = new THREE.MeshStandardMaterial({
    color: 0xd8d8d0,
    side: THREE.DoubleSide,
  });

  const group = new THREE.Group();
  group.name = 'overhang';

  const soffit = new THREE.Mesh(geometry, material);
  soffit.name = 'ceiling';
  soffit.rotation.x = Math.PI / 2;
  soffit.position.y = wallHeight - OVERHANG_THICKNESS;
  group.add(soffit);

  const topGeom = new THREE.ShapeGeometry(buildRoomShape(inset));
  applyShapeUVs(topGeom, inset);
  const top = new THREE.Mesh(topGeom, material);
  top.rotation.x = Math.PI / 2;
  top.position.y = wallHeight;
  group.add(top);

  // Closes the slab's exposed edges so it reads as solid, not as a
  // pair of planes.
  const n = inset.length;
  for (let i = 0; i < n; i++) {
    const a = inset[i];
    const b = inset[(i + 1) % n];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len === 0) continue;

    const edge = new THREE.Mesh(
      new THREE.BoxGeometry(len, OVERHANG_THICKNESS, 0.02 * PRESENTATION_SCALE),
      material
    );
    edge.position.set((a.x + b.x) / 2, wallHeight - OVERHANG_THICKNESS / 2, (a.z + b.z) / 2);
    edge.rotation.y = -Math.atan2(dz, dx);
    group.add(edge);
  }

  return group;
}

let currentFloorPlanRef = null;

/**
 * Every storey is built at startup, so buildFloorPlan leaves this
 * pointing at whichever was built last. Texture lookups go through
 * it, so switching storeys has to repoint it or painting silently
 * targets the wrong floor's data.
 */
export function setActiveStoreyRef(storey) {
  currentFloorPlanRef = storey;
}

/**
 * Builds one storey. The storey's own `base` lifts the whole group,
 * so its walls, floors and ceilings are authored at y = 0 exactly as
 * before and nothing inside has to know which floor it is on.
 */
export function buildFloorPlan(floorPlan) {
  currentFloorPlanRef = floorPlan;

  const root = new THREE.Group();
  root.name = 'storey_' + (floorPlan.id || 'ground');
  root.position.y = floorPlan.base || 0;

  computeCornerOwners(floorPlan.walls);

  const wallsGroup = new THREE.Group();
  wallsGroup.name = 'walls';

  for (const wallData of floorPlan.walls) {
    wallsGroup.add(buildWall(wallData));
  }

  for (const roomData of floorPlan.rooms) {
    const roomGroup = new THREE.Group();
    roomGroup.name = roomData.id;
    roomGroup.add(createFloor(roomData.corners));

    if (roomData.kind === 'balcony') {
      // Open to the air: railings where no wall was traced, and an
      // overhang above instead of a full ceiling.
      roomGroup.add(
        createBalconyOverhang(roomData.corners, roomData.openEdges, WALL_HEIGHT)
      );

      const n = roomData.corners.length;
      (roomData.openEdges || []).forEach(function (i) {
        const rail = createRailing(roomData.corners[i], roomData.corners[(i + 1) % n]);
        if (rail) roomGroup.add(rail);
      });
    } else {
      roomGroup.add(createCeiling(roomData.corners, WALL_HEIGHT));
    }
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