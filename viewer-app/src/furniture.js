import * as THREE from 'three';
import { furnitureCatalog } from './furnitureData.js';
import { loadFurnitureModel } from './models.js';

function createPlaceholderMesh(catalogItem, instance) {
  const { width, height, depth } = catalogItem.dimensions;

  const geometry = new THREE.BoxGeometry(width, height, depth);
  const material = new THREE.MeshStandardMaterial({ color: catalogItem.color });
  const mesh = new THREE.Mesh(geometry, material);

  mesh.position.set(instance.position.x, height / 2, instance.position.z);
  mesh.rotation.y = instance.rotationY;
  mesh.name = instance.instanceId;

  return mesh;
}

/**
 * Builds the furniture layer. Placeholder boxes appear immediately;
 * if a catalog item has a modelFolder, its real model loads in the
 * background and replaces the placeholder once ready.
 */
export function buildFurnitureLayer(placedFurniture) {
  const group = new THREE.Group();
  group.name = 'furniture';

  for (const instance of placedFurniture) {
    const catalogItem = furnitureCatalog.find((c) => c.id === instance.catalogId);
    if (!catalogItem) continue;

    const placeholder = createPlaceholderMesh(catalogItem, instance);
    group.add(placeholder);

    if (catalogItem.modelFolder) {
      loadFurnitureModel(
        catalogItem.modelFolder,
        catalogItem.dimensions,
        (model) => {
          if (!placeholder.parent) return;

          // `model` here is now the WRAPPER group from models.js —
          // we position/rotate/name the wrapper; the actual mesh
          // inside keeps its own internal centering offset intact.
          model.position.x = placeholder.position.x;
          model.position.z = placeholder.position.z;
          model.rotation.y = instance.rotationY;
          model.name = instance.instanceId;

          model.traverse((child) => {
            child.name = instance.instanceId;
          });

          group.add(model);
          group.remove(placeholder);
        },
        () => {
          // Load failed — placeholder box just stays as-is, already
          // a reasonable fallback, no further action needed.
        }
      );
    }
  }

  return group;
}

export function getFurnitureOBB(instance, catalogItem) {
  return {
    x: instance.position.x,
    z: instance.position.z,
    halfWidth: catalogItem.dimensions.width / 2,
    halfDepth: catalogItem.dimensions.depth / 2,
    rotation: instance.rotationY,
  };
}