import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
const loader = new GLTFLoader();
const cache = {};

export function loadFurnitureModel(modelFolder, targetDimensions, onLoad, onError) {
  const url = `/models/${modelFolder}/model.glb`;

  if (cache[url]) {
    const cloned = SkeletonUtils.clone(cache[url]);
    onLoad(cloned);
    return;
  }

  loader.load(
  url,
  (gltf) => {
    const rawModel = gltf.scene;

    // This specific door model bundles a frame/doorway mesh alongside
    // the actual door leaf — we only want the door itself for sizing
    // and rendering, not the surrounding frame (our wall already has
    // its own opening).
    const doorPart = rawModel.getObjectByName('Door002') || rawModel;

    const rawBox = new THREE.Box3().setFromObject(doorPart);
    const rawSize = new THREE.Vector3();
    rawBox.getSize(rawSize);
    console.log(`Raw model size for ${modelFolder}:`, rawSize, 'target:', targetDimensions);

    const wrapper = new THREE.Group();
    normalizeModelSize(doorPart, targetDimensions);
    wrapper.add(doorPart);

    cache[url] = wrapper;
    onLoad(SkeletonUtils.clone(wrapper));
  },

    undefined,
    (error) => {
      console.error(`Failed to load model: ${url}`, error);
      if (onError) onError(error);
    }
  );
}

function normalizeModelSize(model, targetDimensions) {
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box.getSize(size);

  const scaleX = size.x > 0 ? targetDimensions.width / size.x : 1;
  const scaleY = size.y > 0 ? targetDimensions.height / size.y : 1;
  const scaleZ = size.z > 0 ? targetDimensions.depth / size.z : 1;

  model.scale.set(scaleX, scaleY, scaleZ);

  const scaledBox = new THREE.Box3().setFromObject(model);
  const scaledCenter = new THREE.Vector3();
  scaledBox.getCenter(scaledCenter);

  model.position.x -= scaledCenter.x;
  model.position.z -= scaledCenter.z;
  model.position.y -= scaledBox.min.y;
}