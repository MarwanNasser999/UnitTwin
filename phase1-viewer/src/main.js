import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { buildFloorPlan } from './floorplan.js';
import { floorPlan } from './floorplanData.js';

// 1. Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a1a);

// 2. Camera — start standing inside the living room, roughly eye height
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 1.6, 0); // 1.6m ~ average eye height

// 3. Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('app').appendChild(renderer.domElement);

// 4. Pointer lock controls — mouse movement -> camera look direction
const controls = new PointerLockControls(camera, document.body);

// Click anywhere to lock the pointer and start looking around
document.addEventListener('click', () => {
  controls.lock();
});

// Floor plan
const roomsGroup = buildFloorPlan(floorPlan);
scene.add(roomsGroup);

// Lighting
const light = new THREE.DirectionalLight(0xffffff, 2);
light.position.set(5, 10, 7);
scene.add(light);
scene.add(new THREE.AmbientLight(0xffffff, 0.3));

// --- WASD movement ---
const move = { forward: false, back: false, left: false, right: false };
const MOVE_SPEED = 3; // meters per second

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

  const delta = clock.getDelta(); // seconds since last frame — makes movement speed
                                    // consistent regardless of framerate

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