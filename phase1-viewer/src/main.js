import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { buildFloorPlan } from './floorplan.js';
import { floorPlan } from './floorplanData.js';
import { buildFurnitureLayer } from './furniture.js';
import { placedFurniture } from './furnitureData.js';
import {
  buildUI,
  selectWallFromScene,
  selectFurnitureFromScene,
  getSelectedFurnitureId,
  deselectAll,
  togglePanel,
} from './ui.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a1a);

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 1.6, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('app').appendChild(renderer.domElement);

const walkControls = new PointerLockControls(camera, document.body);

const orbitControls = new OrbitControls(camera, renderer.domElement);
orbitControls.enabled = false;

const roomsGroup = buildFloorPlan(floorPlan);
scene.add(roomsGroup);

let furnitureGroup = buildFurnitureLayer(placedFurniture);
scene.add(furnitureGroup);

function rebuildFurniture() {
  scene.remove(furnitureGroup);
  furnitureGroup = buildFurnitureLayer(placedFurniture);
  scene.add(furnitureGroup);

  const selectedId = getSelectedFurnitureId();
  if (selectedId) {
    const mesh = furnitureGroup.getObjectByName(selectedId);
    if (mesh) transformControls.attach(mesh);
  }
}

const transformControls = new TransformControls(camera, renderer.domElement);
transformControls.setMode('translate');
scene.add(transformControls);

transformControls.addEventListener('dragging-changed', (event) => {
  orbitControls.enabled = !event.value;
});

transformControls.addEventListener('objectChange', () => {
  const selectedId = getSelectedFurnitureId();
  const instance = placedFurniture.find((f) => f.instanceId === selectedId);
  const mesh = transformControls.object;
  if (instance && mesh) {
    instance.position.x = mesh.position.x;
    instance.position.z = mesh.position.z;
    instance.rotationY = mesh.rotation.y;
  }
});

document.addEventListener('keydown', (e) => {
  if (e.code === 'KeyR' && getSelectedFurnitureId()) {
    transformControls.setMode(
      transformControls.mode === 'translate' ? 'rotate' : 'translate'
    );
  }
});

function enterEditMode(mesh) {
  walkControls.unlock();
  orbitControls.enabled = true;
  orbitControls.target.copy(mesh.position);
}

function exitEditMode() {
  orbitControls.enabled = false;
  transformControls.detach();

  // Orbiting can leave the camera at an odd height/angle — reset to
  // a sensible standing eye-height, keep x/z where you ended up.
  camera.position.y = 1.6;
  camera.rotation.set(0, camera.rotation.y, 0); // keep horizontal facing, zero out any tilt/roll
}

buildUI(roomsGroup, rebuildFurniture, camera, exitEditMode);

const light = new THREE.DirectionalLight(0xffffff, 2);
light.position.set(5, 10, 7);
scene.add(light);
scene.add(new THREE.AmbientLight(0xffffff, 0.3));

const raycaster = new THREE.Raycaster();
const screenCenter = new THREE.Vector2(0, 0);

document.addEventListener('click', (event) => {
  if (event.target.closest('#ui-panel')) return;
  if (transformControls.dragging) return;
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
    const hit = furnitureHits[0].object;
    selectFurnitureFromScene(hit.name);
    transformControls.attach(hit);
    enterEditMode(hit);
    return;
  }

  const wallsGroup = roomsGroup.getObjectByName('walls');
  const wallHits = raycaster.intersectObjects(wallsGroup.children, true);
  if (wallHits.length > 0) {
    const hit = wallHits[0].object;
    selectWallFromScene(hit.name);
    return;
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
  const distance = MOVE_SPEED * delta;

  if (walkControls.isLocked) {
    if (move.forward) walkControls.moveForward(distance);
    if (move.back) walkControls.moveForward(-distance);
    if (move.right) walkControls.moveRight(distance);
    if (move.left) walkControls.moveRight(-distance);
  }

  if (orbitControls.enabled) {
    orbitControls.update();
  }

  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});