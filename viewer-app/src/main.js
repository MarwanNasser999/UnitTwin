import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

import { buildFloorPlan, getWallOBB } from './floorplan.js';
import { floorPlan as defaultFloorPlan } from './floorplanData.js';

import {
  buildFurnitureLayer,
  getFurnitureOBB,
} from './furniture.js';

import {
  placedFurniture,
  furnitureCatalog,
} from './furnitureData.js';

import { checkOBBOverlap } from './collision.js';

import {
  buildUI,
  selectWallFromScene,
  selectRoomFromScene,
  selectFurnitureFromScene,
  getSelectedFurnitureId,
  deselectAll,
  togglePanel,
} from './ui.js';


function getActiveFloorPlan() {
  const saved = localStorage.getItem('unittwin_trace_preview');

  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (e) {
      console.error(
        'Failed to parse saved trace data, using default.',
        e
      );
    }
  }

  return defaultFloorPlan;
}


/*
 * PRESENTATION SCALE
 *
 * Real stored dimensions remain unchanged.
 * Only the rendered floor-plan coordinates are expanded
 * horizontally/depth-wise for visual comfort.
 *
 * Example:
 * Real 3.0m room width
 * -> rendered as 3.3 world units.
 */
const PRESENTATION_SCALE = 1.1;


/*
 * Scale the floor-plan data exactly once.
 *
 * This affects:
 * - wall start/end positions
 * - wall opening offsets/widths
 * - room corners
 *
 * Real source data remains untouched.
 */
function scaleFloorPlan(plan, scale) {
  return {
    ...plan,

    walls: plan.walls.map((w) => ({
      ...w,

      start: {
        x: w.start.x * scale,
        z: w.start.z * scale,
      },

      end: {
        x: w.end.x * scale,
        z: w.end.z * scale,
      },

      openings: w.openings
        ? w.openings.map((o) => ({
            ...o,
            offset: o.offset * scale,
            width: o.width * scale,
          }))
        : undefined,
    })),

    rooms: plan.rooms.map((r) => ({
      ...r,

      corners: r.corners.map((c) => ({
        x: c.x * scale,
        z: c.z * scale,
      })),
    })),
  };
}


/*
 * Get the real floor plan first,
 * then create the presentation-scaled version.
 */
const sourceFloorPlan = getActiveFloorPlan();

const floorPlan = scaleFloorPlan(
  sourceFloorPlan,
  PRESENTATION_SCALE
);


/**
 * Calculates a sensible camera spawn point — the center of all
 * traced/hand-typed rooms — instead of a hardcoded world origin.
 *
 * Since floorPlan is already presentation-scaled,
 * the spawn point is automatically in the correct rendered space.
 */
function calculateFloorPlanCenter(plan) {
  const allCorners = plan.rooms.flatMap(
    (r) => r.corners
  );

  if (allCorners.length === 0) {
    return {
      x: 0,
      z: 0,
    };
  }

  const xs = allCorners.map(
    (c) => c.x
  );

  const zs = allCorners.map(
    (c) => c.z
  );

  return {
    x:
      (Math.min(...xs) +
        Math.max(...xs)) /
      2,

    z:
      (Math.min(...zs) +
        Math.max(...zs)) /
      2,
  };
}


const scene = new THREE.Scene();

scene.background = new THREE.Color(
  0x1a1a1a
);


/*
 * FOV = 90
 *
 * This was confirmed as the current visual sweet spot.
 */
const camera = new THREE.PerspectiveCamera(
  100,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);


const spawnCenter =
  calculateFloorPlanCenter(
    floorPlan
  );


/*
 * Camera remains at real human eye height.
 *
 * X/Z use the presentation-scaled floor plan.
 * Y remains 1.6m.
 */
camera.position.set(
  spawnCenter.x,
  1.6,
  spawnCenter.z
);


/*
 * TEMPORARY CAMERA DEBUG
 *
 * Press P in the viewer to print:
 * - camera position
 * - eye height
 * - FOV
 */
document.addEventListener(
  'keydown',
  (e) => {
    if (e.code === 'KeyP') {
      console.log(
        'Camera position:',
        camera.position
      );

      console.log(
        'Camera Y (eye height):',
        camera.position.y
      );

      console.log(
        'Camera FOV:',
        camera.fov
      );

      console.log(
        'Presentation scale:',
        PRESENTATION_SCALE
      );
    }
  }
);


const renderer =
  new THREE.WebGLRenderer({
    antialias: true,
  });


renderer.setSize(
  window.innerWidth,
  window.innerHeight
);


document
  .getElementById('app')
  .appendChild(
    renderer.domElement
  );


const walkControls =
  new PointerLockControls(
    camera,
    document.body
  );


const orbitControls =
  new OrbitControls(
    camera,
    renderer.domElement
  );


orbitControls.enabled = false;


/*
 * Build the already-scaled floor plan.
 */
const roomsGroup =
  buildFloorPlan(
    floorPlan
  );


scene.add(
  roomsGroup
);


/*
 * TEMPORARY:
 * 1-meter reference cube.
 *
 * IMPORTANT:
 * This stays exactly 1m × 1m × 1m.
 * It is intentionally NOT presentation-scaled.
 */
const refCube =
  new THREE.Mesh(
    new THREE.BoxGeometry(
      1,
      1,
      1
    ),

    new THREE.MeshBasicMaterial({
      color: 0xff0000,
    })
  );


refCube.position.set(
  0.5,
  0.5,
  0.5
);


scene.add(
  refCube
);


const floorMesh =
  roomsGroup
    .getObjectByName(
      floorPlan.rooms[0].id
    )
    .children.find(
      (c) =>
        c.name === 'floor'
    );


const floorBox =
  new THREE.Box3().setFromObject(
    floorMesh
  );


const floorSize =
  new THREE.Vector3();


floorBox.getSize(
  floorSize
);


console.log(
  'ACTUAL FLOOR SIZE (world units):',
  floorSize
);


console.log(
  'ACTUAL FLOOR BOUNDS:',
  floorBox.min,
  floorBox.max
);


const wallsGroup =
  roomsGroup.getObjectByName(
    'walls'
  );


let furnitureGroup =
  buildFurnitureLayer(
    placedFurniture
  );


scene.add(
  furnitureGroup
);


function rebuildFurniture() {
  scene.remove(
    furnitureGroup
  );

  furnitureGroup =
    buildFurnitureLayer(
      placedFurniture
    );

  scene.add(
    furnitureGroup
  );

  const selectedId =
    getSelectedFurnitureId();

  if (selectedId) {
    const mesh =
      furnitureGroup.children.find(
        (child) =>
          child.name === selectedId
      );

    if (mesh) {
      transformControls.attach(
        mesh
      );
    }
  }
}


const transformControls =
  new TransformControls(
    camera,
    renderer.domElement
  );


transformControls.setMode(
  'rotate'
);

transformControls.showX = false;
transformControls.showZ = false;

transformControls.size = 1.5;


scene.add(
  transformControls
);


let dragMode = 'move';

let preEditCameraPosition =
  null;


function updateGizmoVisibility() {
  if (
    dragMode === 'rotate'
  ) {
    transformControls.enabled =
      true;

    transformControls.visible =
      true;
  } else {
    transformControls.enabled =
      false;

    transformControls.visible =
      false;
  }
}


transformControls.addEventListener(
  'dragging-changed',
  (event) => {
    orbitControls.enabled =
      !event.value;
  }
);


transformControls.addEventListener(
  'objectChange',
  () => {
    const selectedId =
      getSelectedFurnitureId();

    const instance =
      placedFurniture.find(
        (f) =>
          f.instanceId ===
          selectedId
      );

    const mesh =
      transformControls.object;

    if (
      instance &&
      mesh
    ) {
      instance.rotationY =
        mesh.rotation.y;
    }
  }
);


document.addEventListener(
  'keydown',
  (e) => {
    if (
      e.code === 'KeyR' &&
      getSelectedFurnitureId()
    ) {
      dragMode =
        dragMode === 'move'
          ? 'rotate'
          : 'move';

      updateGizmoVisibility();
    }
  }
);


function enterEditMode(
  mesh
) {
  preEditCameraPosition =
    camera.position.clone();

  walkControls.unlock();

  orbitControls.enabled =
    true;

  orbitControls.target.copy(
    mesh.position
  );

  dragMode = 'move';

  updateGizmoVisibility();
}


function exitEditMode() {
  orbitControls.enabled =
    false;

  transformControls.detach();

  if (
    preEditCameraPosition
  ) {
    camera.position.copy(
      preEditCameraPosition
    );
  }

  camera.rotation.set(
    0,
    camera.rotation.y,
    0
  );
}


function findValidSpawnPoint(
  catalogItem
) {
  const forward =
    new THREE.Vector3();

  camera.getWorldDirection(
    forward
  );

  forward.y = 0;

  forward.normalize();


  const baseX =
    camera.position.x +
    forward.x * 1.5;


  const baseZ =
    camera.position.z +
    forward.z * 1.5;


  const OFFSETS = [
    { x: 0, z: 0 },
    { x: 0.6, z: 0 },
    { x: -0.6, z: 0 },
    { x: 0, z: 0.6 },
    { x: 0, z: -0.6 },
    { x: 0.6, z: 0.6 },
    { x: -0.6, z: 0.6 },
    { x: 0.6, z: -0.6 },
    { x: -0.6, z: -0.6 },
  ];


  for (
    const offset of OFFSETS
  ) {
    const testX =
      baseX + offset.x;

    const testZ =
      baseZ + offset.z;


    if (
      !wouldCollide(
        testX,
        testZ,
        0,
        catalogItem,
        null
      )
    ) {
      return {
        x: testX,
        z: testZ,
      };
    }
  }


  return {
    x: baseX,
    z: baseZ,
  };
}


buildUI(
  roomsGroup,
  rebuildFurniture,
  findValidSpawnPoint,
  exitEditMode,
  (mode) => {
    dragMode = mode;
    updateGizmoVisibility();
  }
);


const light =
  new THREE.DirectionalLight(
    0xffffff,
    2
  );


light.position.set(
  5,
  10,
  7
);


scene.add(
  light
);


scene.add(
  new THREE.AmbientLight(
    0xffffff,
    0.3
  )
);


function getAllWallOBBs() {
  const obbs = [];


  wallsGroup.traverse(
    (child) => {
      if (child.isMesh) {
        obbs.push(
          getWallOBB(child)
        );
      }
    }
  );


  return obbs;
}


function wouldCollide(
  testX,
  testZ,
  rotationY,
  catalogItem,
  excludeInstanceId
) {
  const testOBB = {
    x: testX,
    z: testZ,

    halfWidth:
      catalogItem.dimensions.width /
      2,

    halfDepth:
      catalogItem.dimensions.depth /
      2,

    rotation:
      rotationY,
  };


  for (
    const wallOBB of getAllWallOBBs()
  ) {
    if (
      checkOBBOverlap(
        testOBB,
        wallOBB
      )
    ) {
      return true;
    }
  }


  for (
    const other of placedFurniture
  ) {
    if (
      other.instanceId ===
      excludeInstanceId
    ) {
      continue;
    }


    const otherCatalog =
      furnitureCatalog.find(
        (c) =>
          c.id ===
          other.catalogId
      );


    const otherOBB =
      getFurnitureOBB(
        other,
        otherCatalog
      );


    if (
      checkOBBOverlap(
        testOBB,
        otherOBB
      )
    ) {
      return true;
    }
  }


  return false;
}


const dragRaycaster =
  new THREE.Raycaster();


const groundPlane =
  new THREE.Plane(
    new THREE.Vector3(
      0,
      1,
      0
    ),
    0
  );


const dragPointerNDC =
  new THREE.Vector2();


let draggingInstance =
  null;

let draggingMesh =
  null;

let draggingCatalogItem =
  null;


function getGroundPointFromMouse(
  clientX,
  clientY
) {
  dragPointerNDC.x =
    (clientX /
      window.innerWidth) *
      2 -
    1;

  dragPointerNDC.y =
    -(
      (clientY /
        window.innerHeight) *
        2 -
      1
    );


  dragRaycaster.setFromCamera(
    dragPointerNDC,
    camera
  );


  const point =
    new THREE.Vector3();


  dragRaycaster.ray.intersectPlane(
    groundPlane,
    point
  );


  return point;
}


renderer.domElement.addEventListener(
  'mousedown',
  (event) => {
    const selectedId =
      getSelectedFurnitureId();


    if (
      !selectedId ||
      !orbitControls.enabled ||
      dragMode !== 'move'
    ) {
      return;
    }


    if (
      event.target.closest(
        '#ui-panel'
      )
    ) {
      return;
    }


    dragPointerNDC.x =
      (event.clientX /
        window.innerWidth) *
        2 -
      1;


    dragPointerNDC.y =
      -(
        (event.clientY /
          window.innerHeight) *
          2 -
        1
      );


    dragRaycaster.setFromCamera(
      dragPointerNDC,
      camera
    );


    const hits =
      dragRaycaster.intersectObjects(
        furnitureGroup.children,
        true
      );


    if (
      hits.length > 0 &&
      hits[0].object.name ===
        selectedId
    ) {
      let topLevelObject =
        hits[0].object;


      while (
        topLevelObject.parent &&
        topLevelObject.parent !==
          furnitureGroup
      ) {
        topLevelObject =
          topLevelObject.parent;
      }


      draggingInstance =
        placedFurniture.find(
          (f) =>
            f.instanceId ===
            selectedId
        );


      draggingMesh =
        topLevelObject;


      draggingCatalogItem =
        furnitureCatalog.find(
          (c) =>
            c.id ===
            draggingInstance.catalogId
        );


      orbitControls.enabled =
        false;
    }
  }
);


window.addEventListener(
  'mousemove',
  (event) => {
    if (!draggingInstance) {
      return;
    }


    const groundPoint =
      getGroundPointFromMouse(
        event.clientX,
        event.clientY
      );


    const rotationY =
      draggingInstance.rotationY;


    const startX =
      draggingInstance.position.x;


    const startZ =
      draggingInstance.position.z;


    const targetX =
      groundPoint.x;


    const targetZ =
      groundPoint.z;


    const totalDist =
      Math.hypot(
        targetX - startX,
        targetZ - startZ
      );


    const STEP_SIZE =
      0.05;


    const steps =
      Math.max(
        1,
        Math.ceil(
          totalDist /
            STEP_SIZE
        )
      );


    let lastValidX =
      startX;


    let lastValidZ =
      startZ;


    for (
      let i = 1;
      i <= steps;
      i++
    ) {
      const t =
        i / steps;


      const stepX =
        startX +
        (targetX - startX) *
          t;


      const stepZ =
        startZ +
        (targetZ - startZ) *
          t;


      if (
        wouldCollide(
          stepX,
          stepZ,
          rotationY,
          draggingCatalogItem,
          draggingInstance.instanceId
        )
      ) {
        break;
      }


      lastValidX =
        stepX;


      lastValidZ =
        stepZ;
    }


    draggingInstance.position.x =
      lastValidX;


    draggingInstance.position.z =
      lastValidZ;


    draggingMesh.position.x =
      lastValidX;


    draggingMesh.position.z =
      lastValidZ;
  }
);


window.addEventListener(
  'mouseup',
  () => {
    if (draggingInstance) {
      orbitControls.enabled =
        true;
    }


    draggingInstance = null;
    draggingMesh = null;
    draggingCatalogItem = null;
  }
);


const raycaster =
  new THREE.Raycaster();


const screenCenter =
  new THREE.Vector2(
    0,
    0
  );


document.addEventListener(
  'click',
  (event) => {
    if (
      event.target.closest(
        '#ui-panel'
      )
    ) {
      return;
    }


    if (
      transformControls.dragging
    ) {
      return;
    }


    if (draggingInstance) {
      return;
    }


    if (orbitControls.enabled) {
      return;
    }


    if (
      !walkControls.isLocked
    ) {
      if (
        !getSelectedFurnitureId()
      ) {
        walkControls.lock();
      }

      return;
    }


    raycaster.setFromCamera(
      screenCenter,
      camera
    );


    const furnitureHits =
      raycaster.intersectObjects(
        furnitureGroup.children,
        true
      );


    if (
      furnitureHits.length > 0
    ) {
      let topLevelObject =
        furnitureHits[0].object;


      while (
        topLevelObject.parent &&
        topLevelObject.parent !==
          furnitureGroup
      ) {
        topLevelObject =
          topLevelObject.parent;
      }


      selectFurnitureFromScene(
        topLevelObject.name
      );


      transformControls.attach(
        topLevelObject
      );


      enterEditMode(
        topLevelObject
      );


      return;
    }


    const wallHits =
      raycaster.intersectObjects(
        wallsGroup.children,
        true
      );


    if (
      wallHits.length > 0
    ) {
      const hit =
        wallHits[0].object;


      selectWallFromScene(
        hit.name
      );


      return;
    }


    const surfaceHits =
      raycaster
        .intersectObjects(
          roomsGroup.children,
          true
        )
        .filter(
          (hit) =>
            hit.object.name ===
              'floor' ||
            hit.object.name ===
              'ceiling'
        );


    if (
      surfaceHits.length > 0
    ) {
      let parent =
        surfaceHits[0].object.parent;


      while (
        parent &&
        !floorPlan.rooms.some(
          (r) =>
            r.id ===
            parent.name
        )
      ) {
        parent =
          parent.parent;
      }


      if (parent) {
        selectRoomFromScene(
          parent.name
        );


        return;
      }
    }


    deselectAll();

    transformControls.detach();
  }
);


document.addEventListener(
  'keydown',
  (e) => {
    if (e.code === 'Tab') {
      e.preventDefault();

      togglePanel();
    }
  }
);


const PLAYER_RADIUS =
  0.05;


const collisionRaycaster =
  new THREE.Raycaster();


function isBlocked(
  origin,
  dirX,
  dirZ,
  distance
) {
  if (distance === 0) {
    return false;
  }


  const dir =
    new THREE.Vector3(
      dirX,
      0,
      dirZ
    ).normalize();


  collisionRaycaster.set(
    origin,
    dir
  );


  collisionRaycaster.far =
    Math.abs(distance) +
    PLAYER_RADIUS;


  const hits =
    collisionRaycaster.intersectObjects(
      wallsGroup.children,
      true
    );


  return (
    hits.length > 0 &&
    hits[0].distance <
      Math.abs(distance) +
        PLAYER_RADIUS
  );
}


const move = {
  forward: false,
  back: false,
  left: false,
  right: false,
};


const MOVE_SPEED =
  3;


document.addEventListener(
  'keydown',
  (e) => {
    if (e.code === 'KeyW') {
      move.forward = true;
    }


    if (e.code === 'KeyS') {
      move.back = true;
    }


    if (e.code === 'KeyA') {
      move.left = true;
    }


    if (e.code === 'KeyD') {
      move.right = true;
    }
  }
);


document.addEventListener(
  'keyup',
  (e) => {
    if (e.code === 'KeyW') {
      move.forward = false;
    }


    if (e.code === 'KeyS') {
      move.back = false;
    }


    if (e.code === 'KeyA') {
      move.left = false;
    }


    if (e.code === 'KeyD') {
      move.right = false;
    }
  }
);


const clock =
  new THREE.Clock();


function animate() {
  requestAnimationFrame(
    animate
  );


  const delta =
    clock.getDelta();


  const speed =
    MOVE_SPEED * delta;


  if (
    walkControls.isLocked
  ) {
    const forward =
      new THREE.Vector3();


    camera.getWorldDirection(
      forward
    );


    forward.y = 0;

    forward.normalize();


    const right =
      new THREE.Vector3();


    right.crossVectors(
      forward,
      camera.up
    ).normalize();


    let dx = 0;
    let dz = 0;


    if (move.forward) {
      dx +=
        forward.x *
        speed;

      dz +=
        forward.z *
        speed;
    }


    if (move.back) {
      dx -=
        forward.x *
        speed;

      dz -=
        forward.z *
        speed;
    }


    if (move.right) {
      dx +=
        right.x *
        speed;

      dz +=
        right.z *
        speed;
    }


    if (move.left) {
      dx -=
        right.x *
        speed;

      dz -=
        right.z *
        speed;
    }


    const blockedX =
      isBlocked(
        camera.position,
        Math.sign(dx),
        0,
        dx
      );


    const blockedZ =
      isBlocked(
        camera.position,
        0,
        Math.sign(dz),
        dz
      );


    if (!blockedX) {
      camera.position.x +=
        dx;
    }


    if (!blockedZ) {
      camera.position.z +=
        dz;
    }
  }


  if (
    orbitControls.enabled
  ) {
    orbitControls.update();
  }


  renderer.render(
    scene,
    camera
  );
}


animate();


window.addEventListener(
  'resize',
  () => {
    camera.aspect =
      window.innerWidth /
      window.innerHeight;


    camera.updateProjectionMatrix();


    renderer.setSize(
      window.innerWidth,
      window.innerHeight
    );
  }
);