import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { buildFloorPlan } from './floorplan.js';
import { floorPlan } from './floorplanData.js';
import { buildUI, selectWallFromScene, togglePanel } from './ui.js';

// 1. Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a1a);

// 2. Camera
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 1.6, 0);

// 3. Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('app').appendChild(renderer.domElement);

// 4. Pointer lock controls
const controls = new PointerLockControls(camera, document.body);

// Floor plan
const roomsGroup = buildFloorPlan(floorPlan);
scene.add(roomsGroup);

// UI panel
buildUI(roomsGroup);

// Lighting
const light = new THREE.DirectionalLight(0xffffff, 2);
light.position.set(5, 10, 7);
scene.add(light);
scene.add(new THREE.AmbientLight(0xffffff, 0.3));

// --- Click handling: lock pointer OR select a wall, never both,
// and never when the click landed on the UI panel. ---
const raycaster = new THREE.Raycaster();
const screenCenter = new THREE.Vector2(0, 0);

document.addEventListener('click', (event) => {
  // If the click landed on the UI panel (or any of its children),
  // let the panel's own button handlers deal with it — don't lock
  // the pointer or raycast into the scene.
  if (event.target.closest('#ui-panel')) return;

  if (!controls.isLocked) {
    controls.lock();
    return;
  }

  // Pointer is already locked — this click means "select what I'm looking at"
  raycaster.setFromCamera(screenCenter, camera);
  const wallsGroup = roomsGroup.getObjectByName('walls');
  const intersects = raycaster.intersectObjects(wallsGroup.children, true);

  if (intersects.length > 0) {
    const hitMesh = intersects[0].object;
    if (hitMesh.isMesh && hitMesh.name) {
      selectWallFromScene(hitMesh.name);
    }
  }
});

// --- Tab toggles the panel manually ---
document.addEventListener('keydown', (e) => {
  if (e.code === 'Tab') {
    e.preventDefault(); // stop Tab from doing browser default (focus-switching)
    togglePanel();
  }
});

// --- WASD movement ---
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

// 5. Render loop
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  const distance = MOVE_SPEED * delta;

  if (move.forward) controls.moveForward(distance);
  if (move.back) controls.moveForward(-distance);
  if (move.right) controls.moveRight(distance);
  if (move.left) controls.moveRight(-distance);

  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});