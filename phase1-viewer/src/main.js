import * as THREE from 'three';
import { buildRoom } from './floorplan.js';
import { buildFloorPlan } from './floorplan.js';
import { floorPlan } from './floorplanData.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// 1. Scene — the empty 3D world container
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a1a);

// 2. Camera — our viewpoint
// Args: field of view (degrees), aspect ratio, near clip, far clip
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(3, 3, 5); // start a bit back and up, looking toward origin

// 3. Renderer — draws the scene into our #app div
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('app').appendChild(renderer.domElement);

// Temporary controls so we can look around with the mouse for now.
// (Later, in Step 5, we'll replace this with proper "walk through the
// apartment" first-person controls — OrbitControls is just to confirm
// the scene/camera/renderer setup actually works.)
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);

// A temporary reference object, just so there's SOMETHING to look at.
// We'll delete this once floorplan.js generates real geometry in Step 2.
const roomsGroup = buildFloorPlan(floorPlan);
scene.add(roomsGroup);

// Basic lighting — without this, MeshStandardMaterial renders pure black.
const light = new THREE.DirectionalLight(0xffffff, 2);
light.position.set(5, 10, 7);
scene.add(light);
scene.add(new THREE.AmbientLight(0xffffff, 0.3));

// 4. Render loop
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();

// Keep things correct if the browser window is resized
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});