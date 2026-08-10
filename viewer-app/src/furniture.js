import * as THREE from 'three';
import { furnitureCatalog } from './furnitureData.js';

function createFurnitureMesh(catalogItem, instance) {
  const { width, height, depth } = catalogItem.dimensions;

  const geometry = new THREE.BoxGeometry(width, height, depth);
  const material = new THREE.MeshStandardMaterial({ color: catalogItem.color });
  const mesh = new THREE.Mesh(geometry, material);

  mesh.position.set(
    instance.position.x,
    height / 2,
    instance.position.z
  );
  mesh.rotation.y = instance.rotationY;
  mesh.name = instance.instanceId;

  return mesh;
}

export function buildFurnitureLayer(placedFurniture) {
  const group = new THREE.Group();
  group.name = 'furniture';

  for (const instance of placedFurniture) {
    const catalogItem = furnitureCatalog.find((c) => c.id === instance.catalogId);
    if (!catalogItem) continue;

    const mesh = createFurnitureMesh(catalogItem, instance);
    group.add(mesh);
  }

  return group;
}

/**
 * Returns an OBB ({x, z, halfWidth, halfDepth, rotation}) for a
 * furniture instance, used for collision checks during dragging.
 */
export function getFurnitureOBB(instance, catalogItem) {
  return {
    x: instance.position.x,
    z: instance.position.z,
    halfWidth: catalogItem.dimensions.width / 2,
    halfDepth: catalogItem.dimensions.depth / 2,
    rotation: instance.rotationY,
  };
}