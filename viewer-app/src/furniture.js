import * as THREE from 'three';
import { furnitureCatalog } from './furnitureData.js';

/**
 * Builds one furniture mesh (a placeholder box) from a catalog item,
 * positioned/rotated according to a placed instance's data.
 */
function createFurnitureMesh(catalogItem, instance) {
  const { width, height, depth } = catalogItem.dimensions;

  const geometry = new THREE.BoxGeometry(width, height, depth);
  const material = new THREE.MeshStandardMaterial({ color: catalogItem.color });
  const mesh = new THREE.Mesh(geometry, material);

  mesh.position.set(
    instance.position.x,
    height / 2, // sit on the floor, not centered through it — same trick as walls
    instance.position.z
  );
  mesh.rotation.y = instance.rotationY;

  // Tag the mesh with its instance id so raycasting/selection can
  // identify exactly which placed piece of furniture was clicked.
  mesh.name = instance.instanceId;

  return mesh;
}

/**
 * Builds a THREE.Group containing every currently placed furniture
 * instance. Called whenever furniture is added/removed, to rebuild
 * the furniture layer from scratch — simplest approach for now,
 * same "rebuild rather than patch" pattern we used for the UI panel.
 */
export function buildFurnitureLayer(placedFurniture) {
  const group = new THREE.Group();
  group.name = 'furniture';

  for (const instance of placedFurniture) {
    const catalogItem = furnitureCatalog.find((c) => c.id === instance.catalogId);
    if (!catalogItem) continue; // safety: skip if catalogId doesn't match anything

    const mesh = createFurnitureMesh(catalogItem, instance);
    group.add(mesh);
  }

  return group;
}