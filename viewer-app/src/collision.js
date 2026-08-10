/**
 * Oriented Bounding Box collision detection using the Separating
 * Axis Theorem (SAT). Works correctly for rotated rectangles, unlike
 * simple axis-aligned bounding box checks.
 *
 * A box is: { x, z, halfWidth, halfDepth, rotation }
 * (rotation in radians, around the Y/up axis, using Three.js's
 * rotation convention)
 */

function getCorners(box) {
  const { x, z, halfWidth, halfDepth, rotation } = box;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);

  const localCorners = [
    { x: -halfWidth, z: -halfDepth },
    { x: halfWidth, z: -halfDepth },
    { x: halfWidth, z: halfDepth },
    { x: -halfWidth, z: halfDepth },
  ];

  return localCorners.map((c) => ({
    x: x + c.x * cos + c.z * sin,
    z: z - c.x * sin + c.z * cos,
  }));
}

function project(corners, axisX, axisZ) {
  let min = Infinity;
  let max = -Infinity;
  for (const c of corners) {
    const proj = c.x * axisX + c.z * axisZ;
    if (proj < min) min = proj;
    if (proj > max) max = proj;
  }
  return { min, max };
}

function getAxes(corners) {
  const axes = [];
  for (let i = 0; i < corners.length; i++) {
    const p1 = corners[i];
    const p2 = corners[(i + 1) % corners.length];
    const edgeX = p2.x - p1.x;
    const edgeZ = p2.z - p1.z;
    axes.push({ x: -edgeZ, z: edgeX });
  }
  return axes;
}

export function checkOBBOverlap(boxA, boxB) {
  const cornersA = getCorners(boxA);
  const cornersB = getCorners(boxB);

  const axes = [...getAxes(cornersA), ...getAxes(cornersB)];

  for (const axis of axes) {
    const length = Math.sqrt(axis.x * axis.x + axis.z * axis.z);
    const nx = axis.x / length;
    const nz = axis.z / length;

    const projA = project(cornersA, nx, nz);
    const projB = project(cornersB, nx, nz);

    if (projA.max < projB.min || projB.max < projA.min) {
      return false;
    }
  }

  return true;
}