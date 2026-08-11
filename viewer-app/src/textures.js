import * as THREE from 'three';

const loader = new THREE.TextureLoader();
const cache = {};

function loadTexture(url) {
  if (!cache[url]) {
    cache[url] = loader.load(url);
  }
  return cache[url];
}

/**
 * Applies a full PBR texture set (color + normal + roughness) to a
 * mesh, tiling based on real-world surface size.
 */
export function applyPBRTexture(mesh, textureFolder, widthMeters, depthMeters, repeatPerMeter = 1) {
  const base = `/textures/${textureFolder}/`;

  const colorMap = loadTexture(`${base}color.jpg`).clone();
  const normalMap = loadTexture(`${base}normal.jpg`).clone();
  const roughnessMap = loadTexture(`${base}roughness.jpg`).clone();

  [colorMap, normalMap, roughnessMap].forEach((tex) => {
    tex.needsUpdate = true;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(widthMeters * repeatPerMeter, depthMeters * repeatPerMeter);
  });

  mesh.material.map = colorMap;
  mesh.material.normalMap = normalMap;
  mesh.material.roughnessMap = roughnessMap;
  mesh.material.color.set(0xffffff);
  mesh.material.needsUpdate = true;
}