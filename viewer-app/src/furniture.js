import * as THREE from 'three';
import { furnitureCatalog } from './furnitureData.js';
import { loadFurnitureModel } from './models.js';

import { PRESENTATION_SCALE } from './config.js';


function createPlaceholderMesh(
  catalogItem,
  instance
) {
  const {
    width,
    height,
    depth,
  } = catalogItem.dimensions;

  const scaledWidth =
    width * PRESENTATION_SCALE;

  const scaledHeight =
    height * PRESENTATION_SCALE;

  const scaledDepth =
    depth * PRESENTATION_SCALE;


  const geometry =
    new THREE.BoxGeometry(
      scaledWidth,
      scaledHeight,
      scaledDepth
    );


  const material =
    new THREE.MeshStandardMaterial({
      color: catalogItem.color,
    });


  const mesh =
    new THREE.Mesh(
      geometry,
      material
    );


  mesh.position.set(
    instance.position.x,
    scaledHeight / 2,
    instance.position.z
  );


  mesh.rotation.y =
    instance.rotationY;


  mesh.name =
    instance.instanceId;


  return mesh;
}


/**
 * Builds the furniture layer.
 *
 * Furniture dimensions are presentation-scaled by
 * PRESENTATION_SCALE while the original catalog data
 * remains unchanged.
 *
 * Placeholder boxes appear immediately.
 * If a catalog item has a modelFolder, its real model
 * loads in the background and replaces the placeholder
 * once ready.
 */
export function buildFurnitureLayer(
  placedFurniture
) {
  const group =
    new THREE.Group();

  group.name =
    'furniture';


  for (
    const instance of placedFurniture
  ) {
    const catalogItem =
      furnitureCatalog.find(
        (c) =>
          c.id ===
          instance.catalogId
      );


    if (!catalogItem) {
      continue;
    }


    const placeholder =
      createPlaceholderMesh(
        catalogItem,
        instance
      );


    group.add(
      placeholder
    );


    if (
      catalogItem.modelFolder
    ) {
      /*
       * Scale the dimensions passed to the
       * model loader as well, so the real GLTF/GLB
       * model matches the presentation-scaled
       * placeholder dimensions.
       */
      const scaledDimensions = {
        width:
          catalogItem.dimensions.width *
          PRESENTATION_SCALE,

        height:
          catalogItem.dimensions.height *
          PRESENTATION_SCALE,

        depth:
          catalogItem.dimensions.depth *
          PRESENTATION_SCALE,
      };


      loadFurnitureModel(
        catalogItem.modelFolder,
        scaledDimensions,

        (model) => {
          if (!placeholder.parent) {
            return;
          }


          /*
           * `model` here is the WRAPPER group
           * from models.js.
           *
           * We position/rotate/name the wrapper;
           * the actual mesh inside keeps its own
           * internal centering offset intact.
           */
          model.position.x =
            placeholder.position.x;

          /*
           * The wrapper is already grounded by
           * normalizeModelSize — the model's base sits at
           * y = 0 inside it. The placeholder is a box whose
           * origin is its centre, so copying its y would
           * lift the model by half its height.
           */
          model.position.y = 0;

          model.position.z =
            placeholder.position.z;


          model.rotation.y =
            instance.rotationY;


          model.name =
            instance.instanceId;


          model.traverse(
            (child) => {
              child.name =
                instance.instanceId;
            }
          );


          group.add(
            model
          );


          group.remove(
            placeholder
          );
        },

        () => {
          /*
           * Load failed — placeholder box stays
           * as the fallback.
           */
        }
      );
    }
  }


  return group;
}


export function getFurnitureOBB(
  instance,
  catalogItem
) {
  return {
    x:
      instance.position.x,

    z:
      instance.position.z,

    halfWidth:
      (
        catalogItem.dimensions.width *
        PRESENTATION_SCALE
      ) / 2,

    halfDepth:
      (
        catalogItem.dimensions.depth *
        PRESENTATION_SCALE
      ) / 2,

    rotation:
      instance.rotationY,
  };
}