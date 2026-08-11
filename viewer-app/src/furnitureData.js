export const furnitureCatalog = [
  {
    id: 'bed_queen',
    label: 'Queen Bed',
    dimensions: { width: 1.6, height: 0.6, depth: 2.0 },
    color: 0x8899aa,
    modelFolder: 'bed',
  },
  {
    id: 'desk',
    label: 'Desk',
    dimensions: { width: 1.2, height: 0.75, depth: 0.6 },
    color: 0xaa8866,
    modelFolder: 'desk',
  },
  {
    id: 'chair',
    label: 'Chair',
    dimensions: { width: 0.5, height: 0.9, depth: 0.5 },
    color: 0x668877,
    modelFolder: 'chair',
  },
  {
    id: 'wardrobe',
    label: 'Wardrobe',
    dimensions: { width: 1.0, height: 2.0, depth: 0.6 },
    color: 0x776655,
    modelFolder: 'wardrobe',
  },
];

export const placedFurniture = [];

let nextInstanceId = 1;

export function addFurnitureInstance(catalogId, roomId, position) {
  const instance = {
    instanceId: `furniture_${nextInstanceId++}`,
    catalogId,
    roomId,
    position: { x: position.x, z: position.z },
    rotationY: 0,
  };
  placedFurniture.push(instance);
  return instance;
}