import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

import {
  buildFloorPlan,
  rebuildWall,
  getWallOBB,
  setActiveStoreyRef,
} from './floorplan.js';
import { floorPlan as defaultFloorPlan } from './floorplanData.js';
import { buildFurnitureLayer, getFurnitureOBB } from './furniture.js';
import { placedFurniture, furnitureCatalog } from './furnitureData.js';
import { checkOBBOverlap } from './collision.js';

import {
  buildUI,
  selectWallFromScene,
  selectRoomFromScene,
  selectFurnitureFromScene,
  getSelectedFurnitureId,
  deselectAll,
  togglePanel,
  setWindowPlacingState,
  setActiveStoreyInUI,
} from './ui.js';

import { PRESENTATION_SCALE } from './config.js';

/*
 * A building is a list of storeys, each a complete floor plan plus a
 * base height:
 *
 *   { storeys: [ { id, label, base, height, walls, rooms } ] }
 *
 * Plans saved before storeys existed are a bare { walls, rooms }, so
 * they get wrapped into a single ground storey on load and keep
 * working untouched.
 */

const DEFAULT_STOREY_HEIGHT = 2.5;

function normaliseToBuilding(plan) {
  if (plan && Array.isArray(plan.storeys) && plan.storeys.length > 0) {
    return plan;
  }

  return {
    storeys: [
      {
        id: 'ground',
        label: 'Ground Floor',
        base: 0,
        height: DEFAULT_STOREY_HEIGHT,
        walls: plan.walls || [],
        rooms: plan.rooms || [],
      },
    ],
  };
}

function getActiveBuilding() {
  const saved = localStorage.getItem('unittwin_trace_preview');

  if (saved) {
    try {
      return normaliseToBuilding(JSON.parse(saved));
    } catch (e) {
      console.error('Failed to parse saved trace data, using default.', e);
    }
  }

  return normaliseToBuilding(defaultFloorPlan);
}

function scaleStorey(storey, scale) {
  return {
    ...storey,
    base: storey.base * scale,
    height: storey.height * scale,
    walls: storey.walls.map((w) => ({
      ...w,
      start: { x: w.start.x * scale, z: w.start.z * scale },
      end: { x: w.end.x * scale, z: w.end.z * scale },
      openings: w.openings
        ? w.openings.map((o) => ({ ...o, offset: o.offset * scale, width: o.width * scale }))
        : undefined,
      windows: w.windows
        ? w.windows.map((n) => ({
            offset: n.offset * scale,
            width: n.width * scale,
            sillHeight: n.sillHeight * scale,
            headHeight: n.headHeight * scale,
          }))
        : undefined,
    })),
    rooms: storey.rooms.map((r) => ({
      ...r,
      corners: r.corners.map((c) => ({ x: c.x * scale, z: c.z * scale })),
    })),
  };
}

function scaleBuilding(building, scale) {
  return {
    ...building,
    storeys: building.storeys.map((s) => scaleStorey(s, scale)),
  };
}

const sourceBuilding = getActiveBuilding();
const building = scaleBuilding(sourceBuilding, PRESENTATION_SCALE);

// Only one storey is walkable at a time. Everything that used to read
// the flat plan now reads the active storey instead.
let activeStoreyIndex = 0;
let floorPlan = building.storeys[activeStoreyIndex];

// Register synthetic doorway header wall IDs into each room's
// wallIds array (and give ui.js a real, labelable wall-data entry),
// so clicking a doorway wall correctly finds its owning room.

function calculateRoomCenter(room) {
  const xs = room.corners.map((c) => c.x);
  const zs = room.corners.map((c) => c.z);
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    z: (Math.min(...zs) + Math.max(...zs)) / 2,
  };
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a1a);

const camera = new THREE.PerspectiveCamera(
  100,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

const EYE_HEIGHT = 1.6;

function moveCameraToStorey(storey) {
  if (!storey.rooms || storey.rooms.length === 0) return;
  const c = calculateRoomCenter(storey.rooms[0]);
  camera.position.set(c.x, (storey.base || 0) + EYE_HEIGHT, c.z);
}

moveCameraToStorey(floorPlan);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('app').appendChild(renderer.domElement);

const walkControls = new PointerLockControls(camera, document.body);
const orbitControls = new OrbitControls(camera, renderer.domElement);
orbitControls.enabled = false;

/*
 * Every storey is built once. Only the active one is visible and
 * collidable — walking the first floor should not bump into ground
 * floor walls, and hidden storeys must not block the view.
 *
 * roomsGroup and wallsGroup always point at the active storey, so
 * everything downstream keeps reading them exactly as before.
 */
const storeyGroups = building.storeys.map((storey) => {
  const group = buildFloorPlan(storey);
  scene.add(group);
  return group;
});

let roomsGroup = storeyGroups[activeStoreyIndex];
setActiveStoreyRef(floorPlan);
window.roomsGroup = roomsGroup;

// --------------------------------------------------
// Door pivots: collected once after the scene is built, used for
// proximity checks (E to open/close) and the swing animation.
// --------------------------------------------------
let doorPivots = [];

function refreshOpenablePivots() {
  doorPivots = [];
  roomsGroup.traverse((child) => {
    if (child.name === 'door_pivot' || child.name === 'window_pivot') {
      doorPivots.push({
        pivot: child,
        worldPosition: new THREE.Vector3(),
        isOpen: false,
        targetRotation: 0,
      });
    }
  });
  doorPivots.forEach((d) => d.pivot.getWorldPosition(d.worldPosition));
}
refreshOpenablePivots();

let wallsGroup = roomsGroup.getObjectByName('walls');

let furnitureGroup = buildFurnitureLayer(placedFurniture);
scene.add(furnitureGroup);

function rebuildFurniture() {
  scene.remove(furnitureGroup);
  furnitureGroup = buildFurnitureLayer(placedFurniture);
  scene.add(furnitureGroup);

  const selectedId = getSelectedFurnitureId();
  if (selectedId) {
    const mesh = furnitureGroup.children.find((child) => child.name === selectedId);
    if (mesh) transformControls.attach(mesh);
  }
}

const transformControls = new TransformControls(camera, renderer.domElement);
transformControls.setMode('rotate');
transformControls.showX = false;
transformControls.showZ = false;
transformControls.size = 1.5;
scene.add(transformControls);

let dragMode = 'move';
let preEditCameraPosition = null;

function updateGizmoVisibility() {
  if (dragMode === 'rotate') {
    transformControls.enabled = true;
    transformControls.visible = true;
  } else {
    transformControls.enabled = false;
    transformControls.visible = false;
  }
}

let rotationBeforeDrag = null;

transformControls.addEventListener('dragging-changed', (event) => {
  orbitControls.enabled = !event.value;

  const selectedId = getSelectedFurnitureId();
  const instance = placedFurniture.find((f) => f.instanceId === selectedId);
  const mesh = transformControls.object;

  if (event.value) {
    // Drag starting — remember an angle known to be valid.
    rotationBeforeDrag = instance ? instance.rotationY : null;
    return;
  }

  // Drag finished. Checking during the drag fights the gizmo, so the
  // turn is free and only the final angle has to fit.
  if (!instance || !mesh || rotationBeforeDrag === null) return;

  const catalogItem = furnitureCatalog.find((c) => c.id === instance.catalogId);
  if (!catalogItem) return;

  const blocked = wouldCollide(
    instance.position.x,
    instance.position.z,
    instance.rotationY,
    catalogItem,
    instance.instanceId
  );

  if (blocked) {
    instance.rotationY = rotationBeforeDrag;
    mesh.rotation.y = rotationBeforeDrag;
  }

  rotationBeforeDrag = null;
});

transformControls.addEventListener('objectChange', () => {
  const selectedId = getSelectedFurnitureId();
  const instance = placedFurniture.find((f) => f.instanceId === selectedId);
  const mesh = transformControls.object;
  if (instance && mesh) {
    instance.rotationY = mesh.rotation.y;
  }
});

document.addEventListener('keydown', (e) => {
  if (e.code === 'KeyR' && getSelectedFurnitureId()) {
    dragMode = dragMode === 'move' ? 'rotate' : 'move';
    updateGizmoVisibility();
  }
});

function enterEditMode(mesh) {
  preEditCameraPosition = camera.position.clone();
  walkControls.unlock();
  orbitControls.enabled = true;
  orbitControls.target.copy(mesh.position);
  dragMode = 'move';
  updateGizmoVisibility();
}

function exitEditMode() {
  orbitControls.enabled = false;
  transformControls.detach();
  if (preEditCameraPosition) {
    camera.position.copy(preEditCameraPosition);
  }
  camera.rotation.set(0, camera.rotation.y, 0);
}

function findValidSpawnPoint(catalogItem) {
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();

  const baseX = camera.position.x + forward.x * 1.5;
  const baseZ = camera.position.z + forward.z * 1.5;

  // Rings outward from the aimed point. Standing in a corner blocks
  // everything close in, so the search has to reach past one ring.
  const RINGS = [0, 0.6, 1.2, 1.8];
  const DIRECTIONS = 12;

  for (const radius of RINGS) {
    if (radius === 0) {
      if (!wouldCollide(baseX, baseZ, 0, catalogItem, null)) {
        return { x: baseX, z: baseZ };
      }
      continue;
    }

    for (let i = 0; i < DIRECTIONS; i++) {
      const a = (i / DIRECTIONS) * Math.PI * 2;
      const testX = baseX + Math.cos(a) * radius;
      const testZ = baseZ + Math.sin(a) * radius;

      if (!wouldCollide(testX, testZ, 0, catalogItem, null)) {
        return { x: testX, z: testZ };
      }
    }
  }

  // The camera is always inside the room, so try there before giving
  // up — better than the old fallback, which returned a point already
  // known to collide and dropped furniture through the wall.
  if (!wouldCollide(camera.position.x, camera.position.z, 0, catalogItem, null)) {
    return { x: camera.position.x, z: camera.position.z };
  }

  return null;
}

buildUI(
  floorPlan,
  roomsGroup,
  rebuildFurniture,
  findValidSpawnPoint,
  exitEditMode,
  (mode) => {
    dragMode = mode;
    updateGizmoVisibility();
  },
  setWindowPlacementActive
);

// --------------------------------------------------
// Storey switching
// --------------------------------------------------

// Walking happens on one storey, but seeing the building stacked is
// useful on its own. Collision, the camera and the panel always follow
// the active storey regardless.
let showAllStoreys = false;

function applyStoreyVisibility() {
  storeyGroups.forEach((group, i) => {
    group.visible = showAllStoreys || i === activeStoreyIndex;
  });
}

function setActiveStorey(index) {
  if (index < 0 || index >= building.storeys.length) return;
  if (index === activeStoreyIndex) return;

  // Placing a window on a storey you are leaving makes no sense.
  if (windowPlacementActive) setWindowPlacementActive(false);

  deselectAll();
  transformControls.detach();

  activeStoreyIndex = index;
  floorPlan = building.storeys[index];

  roomsGroup = storeyGroups[index];
  wallsGroup = roomsGroup.getObjectByName('walls');
  window.roomsGroup = roomsGroup;

  setActiveStoreyRef(floorPlan);
  applyStoreyVisibility();
  refreshOpenablePivots();
  moveCameraToStorey(floorPlan);

  setActiveStoreyInUI(floorPlan, roomsGroup);
  renderStoreySelector();
}

function renderStoreySelector() {
  let bar = document.getElementById('storey-selector');

  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'storey-selector';
    bar.style.position = 'fixed';
    bar.style.right = '16px';
    bar.style.top = '16px';
    bar.style.display = 'flex';
    bar.style.flexDirection = 'column';
    bar.style.gap = '6px';
    bar.style.zIndex = '20';
    document.body.appendChild(bar);
  }

  bar.innerHTML = '';

  const allBtn = document.createElement('button');
  allBtn.textContent = showAllStoreys ? 'Showing all floors' : 'Show all floors';
  allBtn.style.padding = '6px 12px';
  allBtn.style.cursor = 'pointer';
  allBtn.style.border = showAllStoreys ? '2px solid #4af' : '1px solid #666';
  allBtn.style.background = showAllStoreys ? '#2a3a4a' : '#222';
  allBtn.style.color = '#fff';
  allBtn.style.marginBottom = '4px';

  allBtn.addEventListener('click', () => {
    showAllStoreys = !showAllStoreys;
    applyStoreyVisibility();
    renderStoreySelector();
  });

  bar.appendChild(allBtn);

  // Topmost storey first, so the list reads like the building looks.
  building.storeys
    .map((storey, index) => ({ storey, index }))
    .sort((a, b) => b.storey.base - a.storey.base)
    .forEach(({ storey, index }) => {
      const btn = document.createElement('button');
      btn.textContent = storey.label || storey.id;
      btn.style.padding = '6px 12px';
      btn.style.cursor = 'pointer';
      btn.style.border = index === activeStoreyIndex ? '2px solid #4af' : '1px solid #666';
      btn.style.background = index === activeStoreyIndex ? '#2a3a4a' : '#222';
      btn.style.color = '#fff';

      btn.addEventListener('click', () => setActiveStorey(index));
      bar.appendChild(btn);
    });
}

applyStoreyVisibility();

// A single storey needs no selector.
if (building.storeys.length > 1) renderStoreySelector();

// --------------------------------------------------
// Window placement
// --------------------------------------------------

const WINDOW_WIDTH = 1.2 * PRESENTATION_SCALE;
const WINDOW_SILL = 0.9 * PRESENTATION_SCALE;
const WINDOW_HEAD = 2.1 * PRESENTATION_SCALE;
const WINDOW_EDGE_MARGIN = 0.1 * PRESENTATION_SCALE;

let windowPlacementActive = false;
let windowGhost = null;
let windowGhostValid = false;
let windowGhostTarget = null;   // { wallData, offset }

const placementRaycaster = new THREE.Raycaster();

// While placing, the pointer is unlocked and the ghost follows the
// mouse rather than the crosshair.
const placementPointer = new THREE.Vector2(0, 0);

window.addEventListener('mousemove', (event) => {
  if (!windowPlacementActive) return;
  placementPointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  placementPointer.y = -((event.clientY / window.innerHeight) * 2 - 1);
});

// WALL_THICKNESS lives in floorplan.js; this only sizes the ghost.
const WALL_THICKNESS_GUESS = 0.1 * PRESENTATION_SCALE;

function createWindowGhost() {
  const geo = new THREE.BoxGeometry(
    WINDOW_WIDTH,
    WINDOW_HEAD - WINDOW_SILL,
    WALL_THICKNESS_GUESS * 1.2
  );
  const mat = new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    transparent: true,
    opacity: 0.4,
    depthTest: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 999;
  mesh.visible = false;
  scene.add(mesh);
  return mesh;
}

function wallLengthOf(wallData) {
  const dx = wallData.end.x - wallData.start.x;
  const dz = wallData.end.z - wallData.start.z;
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * Is [offset, offset+width] clear of this wall's doors and windows,
 * and inside the wall with a margin at each end?
 */
function windowFitsOnWall(wallData, offset) {
  const length = wallLengthOf(wallData);
  const from = offset;
  const to = offset + WINDOW_WIDTH;

  if (from < WINDOW_EDGE_MARGIN) return false;
  if (to > length - WINDOW_EDGE_MARGIN) return false;

  for (const o of wallData.openings || []) {
    if (from < o.offset + o.width && to > o.offset) return false;
  }

  for (const n of wallData.windows || []) {
    if (from < n.offset + n.width && to > n.offset) return false;
  }

  return true;
}

function updateWindowGhost() {
  if (!windowPlacementActive) return;

  if (!windowGhost) windowGhost = createWindowGhost();

  placementRaycaster.setFromCamera(placementPointer, camera);
  const hits = placementRaycaster.intersectObjects(wallsGroup.children, true);

  windowGhostValid = false;
  windowGhostTarget = null;

  // Frames, glass and door panels have no name, so walk past them to
  // the first real wall behind — pointing at an existing window then
  // still evaluates against the wall it sits in, and reports red.
  let hit = null;
  let wallData = null;

  for (const h of hits) {
    const w = floorPlan.walls.find(function (x) { return x.id === h.object.name; });
    if (w) {
      hit = h;
      wallData = w;
      break;
    }
  }

  if (!hit) {
    windowGhost.visible = false;
    return;
  }

  // Where along the wall did we hit?
  const dx = wallData.end.x - wallData.start.x;
  const dz = wallData.end.z - wallData.start.z;
  const length = Math.sqrt(dx * dx + dz * dz);
  const ux = dx / length;
  const uz = dz / length;

  const along =
    (hit.point.x - wallData.start.x) * ux + (hit.point.z - wallData.start.z) * uz;

  const offset = along - WINDOW_WIDTH / 2;
  const fits = windowFitsOnWall(wallData, offset);

  const midDist = offset + WINDOW_WIDTH / 2;
  // The ghost lives in the scene, not the storey group, so the
  // storey's own height has to be added — otherwise on an upper floor
  // it hovers down at ground level.
  windowGhost.position.set(
    wallData.start.x + ux * midDist,
    (floorPlan.base || 0) + (WINDOW_SILL + WINDOW_HEAD) / 2,
    wallData.start.z + uz * midDist
  );
  windowGhost.rotation.y = -Math.atan2(dz, dx);
  windowGhost.material.color.set(fits ? 0x00ff00 : 0xff0000);
  windowGhost.visible = true;

  windowGhostValid = fits;
  if (fits) windowGhostTarget = { wallData: wallData, offset: offset };
}

function placeWindow() {
  if (!windowGhostValid || !windowGhostTarget) return;

  const wallData = windowGhostTarget.wallData;
  if (!wallData.windows) wallData.windows = [];

  // Whichever side of the wall you are standing on when you place it
  // is the inside — that is the only side it can be opened from.
  const wdx = wallData.end.x - wallData.start.x;
  const wdz = wallData.end.z - wallData.start.z;
  const cross =
    wdx * (camera.position.z - wallData.start.z) -
    wdz * (camera.position.x - wallData.start.x);

  wallData.windows.push({
    offset: windowGhostTarget.offset,
    width: WINDOW_WIDTH,
    sillHeight: WINDOW_SILL,
    headHeight: WINDOW_HEAD,
    interiorSide: cross >= 0 ? 1 : -1,
  });

  rebuildWall(roomsGroup, wallData);
  refreshOpenablePivots();
}

export function setWindowPlacementActive(active) {
  windowPlacementActive = active;

  if (active) {
    // Free the mouse so the ghost can be aimed directly.
    walkControls.unlock();
  } else if (windowGhost) {
    windowGhost.visible = false;
  }

  setWindowPlacingState(active);
}
window.setWindowPlacementActive = setWindowPlacementActive;

const light = new THREE.DirectionalLight(0xffffff, 2);
light.position.set(5, 10, 7);
scene.add(light);
scene.add(new THREE.AmbientLight(0xffffff, 0.3));

function getAllWallOBBs() {
  const obbs = [];
  wallsGroup.traverse((child) => {
    if (child.isMesh) obbs.push(getWallOBB(child));
  });
  return obbs;
}

function wouldCollide(testX, testZ, rotationY, catalogItem, excludeInstanceId) {
  const testOBB = {
    x: testX,
    z: testZ,
    halfWidth: catalogItem.dimensions.width / 2,
    halfDepth: catalogItem.dimensions.depth / 2,
    rotation: rotationY,
  };

  for (const wallOBB of getAllWallOBBs()) {
    if (checkOBBOverlap(testOBB, wallOBB)) return true;
  }

  for (const other of placedFurniture) {
    if (other.instanceId === excludeInstanceId) continue;
    const otherCatalog = furnitureCatalog.find((c) => c.id === other.catalogId);
    const otherOBB = getFurnitureOBB(other, otherCatalog);
    if (checkOBBOverlap(testOBB, otherOBB)) return true;
  }

  return false;
}

const dragRaycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const dragPointerNDC = new THREE.Vector2();
let draggingInstance = null;
let draggingMesh = null;
let draggingCatalogItem = null;

function getGroundPointFromMouse(clientX, clientY) {
  dragPointerNDC.x = (clientX / window.innerWidth) * 2 - 1;
  dragPointerNDC.y = -((clientY / window.innerHeight) * 2 - 1);
  dragRaycaster.setFromCamera(dragPointerNDC, camera);
  const point = new THREE.Vector3();
  dragRaycaster.ray.intersectPlane(groundPlane, point);
  return point;
}

renderer.domElement.addEventListener('mousedown', (event) => {
  const selectedId = getSelectedFurnitureId();
  if (!selectedId || !orbitControls.enabled || dragMode !== 'move') return;
  if (event.target.closest('#ui-panel')) return;

  dragPointerNDC.x = (event.clientX / window.innerWidth) * 2 - 1;
  dragPointerNDC.y = -((event.clientY / window.innerHeight) * 2 - 1);
  dragRaycaster.setFromCamera(dragPointerNDC, camera);

  const hits = dragRaycaster.intersectObjects(furnitureGroup.children, true);
  if (hits.length > 0 && hits[0].object.name === selectedId) {
    let topLevelObject = hits[0].object;
    while (topLevelObject.parent && topLevelObject.parent !== furnitureGroup) {
      topLevelObject = topLevelObject.parent;
    }

    draggingInstance = placedFurniture.find((f) => f.instanceId === selectedId);
    draggingMesh = topLevelObject;
    draggingCatalogItem = furnitureCatalog.find((c) => c.id === draggingInstance.catalogId);
    orbitControls.enabled = false;
  }
});

window.addEventListener('mousemove', (event) => {
  if (!draggingInstance) return;

  const groundPoint = getGroundPointFromMouse(event.clientX, event.clientY);
  const rotationY = draggingInstance.rotationY;

  const startX = draggingInstance.position.x;
  const startZ = draggingInstance.position.z;
  const targetX = groundPoint.x;
  const targetZ = groundPoint.z;

  const totalDist = Math.hypot(targetX - startX, targetZ - startZ);
  const STEP_SIZE = 0.05;
  const steps = Math.max(1, Math.ceil(totalDist / STEP_SIZE));

  let lastValidX = startX;
  let lastValidZ = startZ;

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const stepX = startX + (targetX - startX) * t;
    const stepZ = startZ + (targetZ - startZ) * t;

    if (wouldCollide(stepX, stepZ, rotationY, draggingCatalogItem, draggingInstance.instanceId)) {
      break;
    }

    lastValidX = stepX;
    lastValidZ = stepZ;
  }

  draggingInstance.position.x = lastValidX;
  draggingInstance.position.z = lastValidZ;
  draggingMesh.position.x = lastValidX;
  draggingMesh.position.z = lastValidZ;
});

window.addEventListener('mouseup', () => {
  if (draggingInstance) {
    orbitControls.enabled = true;
  }
  draggingInstance = null;
  draggingMesh = null;
  draggingCatalogItem = null;
});

const raycaster = new THREE.Raycaster();
const screenCenter = new THREE.Vector2(0, 0);

document.addEventListener('click', (event) => {
  if (windowPlacementActive) {
    placeWindow();
    return;
  }

  if (event.target.closest('#ui-panel')) return;
  if (transformControls.dragging) return;
  if (draggingInstance) return;
  if (orbitControls.enabled) return;

  if (!walkControls.isLocked) {
    if (!getSelectedFurnitureId()) {
      walkControls.lock();
    }
    return;
  }

  raycaster.setFromCamera(screenCenter, camera);

  const furnitureHits = raycaster.intersectObjects(furnitureGroup.children, true);
  if (furnitureHits.length > 0) {
    let topLevelObject = furnitureHits[0].object;
    while (topLevelObject.parent && topLevelObject.parent !== furnitureGroup) {
      topLevelObject = topLevelObject.parent;
    }

    selectFurnitureFromScene(topLevelObject.name);
    transformControls.attach(topLevelObject);
    enterEditMode(topLevelObject);
    return;
  }

  const wallHits = raycaster.intersectObjects(wallsGroup.children, true);
  if (wallHits.length > 0) {
    const hit = wallHits[0];
    const faceIndex = hit.face.materialIndex;
    selectWallFromScene(hit.object.name, faceIndex);
    return;
  }

  const surfaceHits = raycaster
    .intersectObjects(roomsGroup.children, true)
    .filter((hit) => hit.object.name === 'floor' || hit.object.name === 'ceiling');

  if (surfaceHits.length > 0) {
    let parent = surfaceHits[0].object.parent;
    while (parent && !floorPlan.rooms.some((r) => r.id === parent.name)) {
      parent = parent.parent;
    }
    if (parent) {
      selectRoomFromScene(parent.name);
      return;
    }
  }

  deselectAll();
  transformControls.detach();
});

document.addEventListener('keydown', (e) => {
  if (e.code === 'Tab') {
    e.preventDefault();
    togglePanel();
  }
});

// --------------------------------------------------
// Door open/close: press E near a door to toggle it
// --------------------------------------------------
const DOOR_INTERACT_DISTANCE = 1.5;

document.addEventListener('keydown', (e) => {
  if (e.code !== 'KeyE') return;
  if (!walkControls.isLocked) return;

  let closestDoor = null;
  let closestDist = Infinity;

  for (const door of doorPivots) {
    const dist = camera.position.distanceTo(door.worldPosition);
    if (dist < DOOR_INTERACT_DISTANCE && dist < closestDist) {
      closestDist = dist;
      closestDoor = door;
    }
  }

  if (!closestDoor) return;

  const ud = closestDoor.pivot.userData || {};

  // A window opens only from the room it was placed in.
  if (closestDoor.pivot.name === 'window_pivot' && ud.wallStart && ud.wallDir) {
    const cross =
      ud.wallDir.ux * (camera.position.z - ud.wallStart.z) -
      ud.wallDir.uz * (camera.position.x - ud.wallStart.x);
    const side = cross >= 0 ? 1 : -1;

    if (side !== ud.interiorSide) return;
  }

  // Doors swing toward the side chosen when the door was marked.
  const swing = ud.swing === -1 ? -1 : 1;

  closestDoor.isOpen = !closestDoor.isOpen;
  closestDoor.targetRotation = closestDoor.isOpen ? -swing * (Math.PI / 2) : 0;
});

document.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && windowPlacementActive) {
    setWindowPlacementActive(false);
  }
});
const PLAYER_RADIUS = 0.3;
const collisionRaycaster = new THREE.Raycaster();

function isBlocked(origin, dirX, dirZ, distance) {
  if (distance === 0) return false;
  const dir = new THREE.Vector3(dirX, 0, dirZ).normalize();
  collisionRaycaster.set(origin, dir);
  collisionRaycaster.far = Math.abs(distance) + PLAYER_RADIUS;
  const hits = collisionRaycaster.intersectObjects(wallsGroup.children, true);
  return hits.length > 0 && hits[0].distance < Math.abs(distance) + PLAYER_RADIUS;
}

const move = { forward: false, back: false, left: false, right: false };
const MOVE_SPEED = 3;

document.addEventListener('keydown', (e) => {
  if (e.code === 'KeyW') move.forward = true;
  if (e.code === 'KeyS') move.back = true;
  if (e.code === 'KeyA') move.left = true;
  if (e.code === 'KeyD') move.right = true;
});

document.addEventListener('keyup', (e) => {
  if (e.code === 'KeyW') move.forward = false;
  if (e.code === 'KeyS') move.back = false;
  if (e.code === 'KeyA') move.left = false;
  if (e.code === 'KeyD') move.right = false;
});

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  const speed = MOVE_SPEED * delta;

  if (walkControls.isLocked) {
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3();
    right.crossVectors(forward, camera.up).normalize();

    let dx = 0, dz = 0;
    if (move.forward) { dx += forward.x * speed; dz += forward.z * speed; }
    if (move.back)    { dx -= forward.x * speed; dz -= forward.z * speed; }
    if (move.right)   { dx += right.x * speed;   dz += right.z * speed; }
    if (move.left)    { dx -= right.x * speed;   dz -= right.z * speed; }

    const blockedX = isBlocked(camera.position, Math.sign(dx), 0, dx);
    const blockedZ = isBlocked(camera.position, 0, Math.sign(dz), dz);
    if (!blockedX) camera.position.x += dx;
    if (!blockedZ) camera.position.z += dz;
  }

  if (orbitControls.enabled) orbitControls.update();

  // Smoothly animate every door toward its target open/closed angle
  for (const door of doorPivots) {
    door.pivot.rotation.y = THREE.MathUtils.lerp(door.pivot.rotation.y, door.targetRotation, 0.1);
  }

  updateWindowGhost();

  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});