let canvas = null;
let ctx = null;
let loadedImage = null;

// --------------------------------------------------
// Calibration
// --------------------------------------------------
let calibrationPoints = [];
let pixelsPerMeter = null;

// --------------------------------------------------
// Shared wall network
// --------------------------------------------------
let networkPoints = []; // { id, pixelX, pixelY, meterX, meterZ }
let networkWalls = [];  // { id, pointA, pointB }
let nextPointId = 1;
let nextWallId = 1;

let currentChainPointId = null;
// History of clicks made during the current wall chain, so Undo can
// precisely reverse them: { wallId|null, pointId, pointWasNew }
let wallChainHistory = [];

// --------------------------------------------------
// Rooms
// --------------------------------------------------
let completedRooms = []; // { id, label, pointIds, wallIds, openSegments }
let currentRoomPointIds = [];

// --------------------------------------------------
// Mode: 'idle' | 'calibrate' | 'walls' | 'room'
// --------------------------------------------------
let mode = 'idle';

const SNAP_TOLERANCE_PX = 18; // clicking within this many pixels of an
// existing point always reuses it — never creates a duplicate on top

// ==================================================
// Canvas / image
// ==================================================

export function initCanvas() {
  canvas = document.getElementById('trace-canvas');

  if (!canvas) {
    console.error('Canvas #trace-canvas was not found.');
    return;
  }

  ctx = canvas.getContext('2d');
}

export function getCanvas() {
  return canvas;
}

export function loadImageFile(file, onLoaded) {
  const reader = new FileReader();

  reader.onload = (event) => {
    const img = new Image();

    img.onload = () => {
      loadedImage = img;

      canvas.width = img.width;
      canvas.height = img.height;

      ctx.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
      );

      ctx.drawImage(img, 0, 0);

      calibrationPoints = [];
      pixelsPerMeter = null;

      networkPoints = [];
      networkWalls = [];

      nextPointId = 1;
      nextWallId = 1;

      currentChainPointId = null;
      wallChainHistory = [];

      completedRooms = [];
      currentRoomPointIds = [];

      mode = 'idle';

      if (onLoaded) {
        onLoaded();
      }
    };

    img.onerror = () => {
      console.error('Failed to load image.');
    };

    img.src = event.target.result;
  };

  reader.onerror = () => {
    console.error('Failed to read file.');
  };

  reader.readAsDataURL(file);
}

export function isCalibrated() {
  return pixelsPerMeter !== null;
}

export function redrawImage() {
  if (!loadedImage) return;

  ctx.clearRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

  ctx.drawImage(
    loadedImage,
    0,
    0
  );
}

// ==================================================
// Drawing
// ==================================================

function drawMarker(
  x,
  y,
  color,
  radius = 6
) {
  if (!ctx) return;

  ctx.beginPath();

  ctx.arc(
    x,
    y,
    radius,
    0,
    Math.PI * 2
  );

  ctx.fillStyle = color;
  ctx.fill();

  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawWallLine(
  a,
  b,
  color,
  width = 3
) {
  ctx.beginPath();

  ctx.moveTo(
    a.pixelX,
    a.pixelY
  );

  ctx.lineTo(
    b.pixelX,
    b.pixelY
  );

  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function drawWallLabel(
  a,
  b,
  text
) {
  const midX =
    (a.pixelX + b.pixelX) / 2;

  const midY =
    (a.pixelY + b.pixelY) / 2;

  ctx.font = 'bold 13px sans-serif';
  ctx.fillStyle = '#00aaff';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 3;

  ctx.strokeText(
    text,
    midX + 6,
    midY - 6
  );

  ctx.fillText(
    text,
    midX + 6,
    midY - 6
  );
}

export function redrawAll() {
  redrawImage();

  // Draw all network walls
  for (const wall of networkWalls) {
    const a = getPoint(wall.pointA);
    const b = getPoint(wall.pointB);

    if (!a || !b) continue;

    drawWallLine(
      a,
      b,
      '#00aaff',
      2
    );

    const lengthM = Math.hypot(
      b.meterX - a.meterX,
      b.meterZ - a.meterZ
    );

    drawWallLabel(
      a,
      b,
      `${lengthM.toFixed(2)}m`
    );
  }

  // Draw all network points
  for (const point of networkPoints) {
    drawMarker(
      point.pixelX,
      point.pixelY,
      '#ffffff',
      4
    );
  }

  // Draw current room being traced
  if (
    mode === 'room' &&
    currentRoomPointIds.length > 0
  ) {
    const pts =
      currentRoomPointIds
        .map(getPoint)
        .filter(Boolean);

    for (
      let i = 0;
      i < pts.length - 1;
      i++
    ) {
      drawWallLine(
        pts[i],
        pts[i + 1],
        '#ffaa00',
        4
      );
    }

    for (const p of pts) {
      drawMarker(
        p.pixelX,
        p.pixelY,
        '#ffaa00',
        6
      );
    }
  }
}

function getPoint(id) {
  return (
    networkPoints.find(
      (p) => p.id === id
    ) || null
  );
}

// ==================================================
// Calibration
// ==================================================

export function enterCalibrateMode() {
  mode = 'calibrate';
  calibrationPoints = [];
}

function handleCalibrationClick(
  pixelX,
  pixelY,
  onCalibrationNeeded
) {
  calibrationPoints.push({
    x: pixelX,
    y: pixelY
  });

  drawMarker(
    pixelX,
    pixelY,
    '#00ff00'
  );

  if (
    calibrationPoints.length === 2 &&
    onCalibrationNeeded
  ) {
    onCalibrationNeeded(
      calibrationPoints
    );
  }
}

export function setCalibrationDistance(
  realMeters
) {
  if (
    calibrationPoints.length !== 2
  ) {
    return false;
  }

  if (
    !Number.isFinite(realMeters) ||
    realMeters <= 0
  ) {
    return false;
  }

  const [a, b] =
    calibrationPoints;

  const pixelDist = Math.hypot(
    b.x - a.x,
    b.y - a.y
  );

  if (pixelDist === 0) {
    return false;
  }

  pixelsPerMeter =
    pixelDist / realMeters;

  mode = 'idle';

  return true;
}

function pixelToMeter(
  pixelX,
  pixelY
) {
  const origin =
    calibrationPoints[0];

  return {
    meterX:
      (pixelX - origin.x) /
      pixelsPerMeter,

    meterZ:
      (pixelY - origin.y) /
      pixelsPerMeter
  };
}

// ==================================================
// Mode control
// ==================================================

export function getMode() {
  return mode;
}

export function enterWallMode() {
  mode = 'walls';

  currentChainPointId = null;
  wallChainHistory = [];
}

export function breakWallChain() {
  currentChainPointId = null;
  wallChainHistory = [];
}

export function exitWallMode() {
  mode = 'idle';

  currentChainPointId = null;
  wallChainHistory = [];
}

export function enterRoomMode() {
  mode = 'room';
  currentRoomPointIds = [];
}

export function exitRoomMode() {
  mode = 'idle';
  currentRoomPointIds = [];

  redrawAll();
}

// ==================================================
// Point snapping
// ==================================================

function findNearbyPoint(
  pixelX,
  pixelY,
  tolerance
) {
  let closest = null;
  let closestDist = Infinity;

  for (const p of networkPoints) {
    const dist = Math.hypot(
      p.pixelX - pixelX,
      p.pixelY - pixelY
    );

    if (
      dist < tolerance &&
      dist < closestDist
    ) {
      closest = p;
      closestDist = dist;
    }
  }

  return closest;
}

function createPoint(
  pixelX,
  pixelY
) {
  const {
    meterX,
    meterZ
  } = pixelToMeter(
    pixelX,
    pixelY
  );

  const point = {
    id: `p${nextPointId++}`,
    pixelX,
    pixelY,
    meterX,
    meterZ
  };

  networkPoints.push(point);

  return point;
}

// ==================================================
// Wall tracing mode
// ==================================================

function handleWallModeClick(
  pixelX,
  pixelY
) {
  let point = findNearbyPoint(
    pixelX,
    pixelY,
    SNAP_TOLERANCE_PX
  );

  let pointWasNew = false;

  if (!point) {
    point = createPoint(
      pixelX,
      pixelY
    );

    pointWasNew = true;
  }

  let createdWallId = null;

  if (
    currentChainPointId &&
    currentChainPointId !== point.id
  ) {
    const alreadyExists =
      networkWalls.some(
        (w) =>
          (
            w.pointA ===
              currentChainPointId &&
            w.pointB === point.id
          ) ||
          (
            w.pointA === point.id &&
            w.pointB ===
              currentChainPointId
          )
      );

    if (!alreadyExists) {
      const wall = {
        id: `w${nextWallId++}`,
        pointA:
          currentChainPointId,
        pointB: point.id
      };

      networkWalls.push(wall);

      createdWallId = wall.id;
    }
  }

  wallChainHistory.push({
    wallId: createdWallId,
    pointId: point.id,
    pointWasNew
  });

  currentChainPointId =
    point.id;

  redrawAll();
}

/**
 * Undoes the most recent click in the current wall chain.
 */
export function undoLastWallPoint() {
  const last =
    wallChainHistory.pop();

  if (!last) return;

  if (last.wallId) {
    networkWalls =
      networkWalls.filter(
        (w) =>
          w.id !== last.wallId
      );
  }

  if (last.pointWasNew) {
    const stillUsed =
      networkWalls.some(
        (w) =>
          w.pointA ===
            last.pointId ||
          w.pointB ===
            last.pointId
      );

    if (!stillUsed) {
      networkPoints =
        networkPoints.filter(
          (p) =>
            p.id !==
            last.pointId
        );
    }
  }

  const prev =
    wallChainHistory[
      wallChainHistory.length - 1
    ];

  currentChainPointId =
    prev
      ? prev.pointId
      : null;

  redrawAll();
}

// ==================================================
// Room definition mode
// ==================================================

function handleRoomModeClick(
  pixelX,
  pixelY,
  onNoPointNearby
) {
  const point =
    findNearbyPoint(
      pixelX,
      pixelY,
      SNAP_TOLERANCE_PX
    );

  if (!point) {
    if (onNoPointNearby) {
      onNoPointNearby();
    }

    return;
  }

  currentRoomPointIds.push(
    point.id
  );

  redrawAll();
}

export function getCurrentRoomPointCount() {
  return currentRoomPointIds.length;
}

export function undoLastRoomPoint() {
  currentRoomPointIds.pop();

  redrawAll();
}

export function getCompletedRoomCount() {
  return completedRooms.length;
}

export function getNetworkWallCount() {
  return networkWalls.length;
}

// ==================================================
// Polygon validation
// ==================================================

/**
 * Returns:
 * 0 = collinear
 * 1 = clockwise
 * 2 = counter-clockwise
 */
function orientation(a, b, c) {
  const val =
    (b.z - a.z) *
      (c.x - b.x) -
    (b.x - a.x) *
      (c.z - b.z);

  if (Math.abs(val) < 1e-9) {
    return 0;
  }

  return val > 0 ? 1 : 2;
}

/**
 * Checks whether point b lies on
 * the segment from a to c.
 */
function onSegment(a, b, c) {
  return (
    Math.min(a.x, c.x) <= b.x &&
    b.x <= Math.max(a.x, c.x) &&
    Math.min(a.z, c.z) <= b.z &&
    b.z <= Math.max(a.z, c.z)
  );
}

/**
 * Checks whether two line segments intersect.
 */
function segmentsIntersect(p1, p2, p3, p4) {
  function orientation(a, b, c) {
    const val = (b.z - a.z) * (c.x - b.x) - (b.x - a.x) * (c.z - b.z);
    if (Math.abs(val) < 1e-9) return 0;
    return val > 0 ? 1 : 2;
  }
  function onSegment(a, b, c) {
    return (
      Math.min(a.x, c.x) <= b.x && b.x <= Math.max(a.x, c.x) &&
      Math.min(a.z, c.z) <= b.z && b.z <= Math.max(a.z, c.z)
    );
  }

  const o1 = orientation(p1, p2, p3);
  const o2 = orientation(p1, p2, p4);
  const o3 = orientation(p3, p4, p1);
  const o4 = orientation(p3, p4, p2);

  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(p1, p3, p2)) return true;
  if (o2 === 0 && onSegment(p1, p4, p2)) return true;
  if (o3 === 0 && onSegment(p3, p1, p4)) return true;
  if (o4 === 0 && onSegment(p3, p2, p4)) return true;
  return false;
}

/**
 * Checks that the selected room points, connected in order, form a
 * SIMPLE polygon — no two non-adjacent edges may cross. Prevents
 * bowtie/self-intersecting shapes, which produce garbage geometry.
 */
function findSelfIntersection(points) {
  const pts = points.map((id) => getPoint(id));
  const n = pts.length;

  for (let i = 0; i < n; i++) {
    const a1 = pts[i];
    const a2 = pts[(i + 1) % n];

    for (let j = i + 1; j < n; j++) {
      // Skip edges that share a point (adjacent edges always "touch"
      // at their shared corner — that's not a crossing).
      if (j === i || j === (i + 1) % n || (j + 1) % n === i) continue;

      const b1 = pts[j];
      const b2 = pts[(j + 1) % n];

      if (segmentsIntersect(a1, a2, b1, b2)) {
        return { i, j };
      }
    }
  }
  return null;
}

/**
 * A room segment is valid whether or not a wall exists between two
 * consecutive points — a missing wall means an intentional open
 * boundary (this is how doorways/openings are represented, since a
 * doorway drawn on a CAD plan is exactly a gap in the wall line).
 */
export function commitCurrentRoom(roomId, roomLabel) {
  let points = [...currentRoomPointIds];
  if (points.length > 1 && points[points.length - 1] === points[0]) {
    points = points.slice(0, -1);
  }

  if (points.length < 3) {
    return { success: false, reason: 'not_enough_points' };
  }

  const idTaken = completedRooms.some((r) => r.id === roomId);
  if (idTaken) {
    return { success: false, reason: 'duplicate_id' };
  }

  const intersection = findSelfIntersection(points);
  if (intersection) {
    return { success: false, reason: 'self_intersecting', ...intersection };
  }

  // ... rest unchanged (wall matching, pushing to completedRooms, etc.)

  // ----------------------------------------------
  // Wall matching
  // ----------------------------------------------

  const wallIds = [];
  const openSegments = [];

  for (
    let i = 0;
    i < points.length;
    i++
  ) {
    const a = points[i];

    const b =
      points[
        (i + 1) %
          points.length
      ];

    const wall =
      networkWalls.find(
        (w) =>
          (
            w.pointA === a &&
            w.pointB === b
          ) ||
          (
            w.pointA === b &&
            w.pointB === a
          )
      );

    if (wall) {
      wallIds.push(
        wall.id
      );
    } else {
      openSegments.push(i);
    }
  }

  // ----------------------------------------------
  // Commit room
  // ----------------------------------------------

  completedRooms.push({
    id: roomId,
    label: roomLabel,
    pointIds: points,
    wallIds,
    openSegments
  });

  currentRoomPointIds = [];

  redrawAll();

  return {
    success: true,
    openSegments
  };
}

// ==================================================
// Unified click dispatcher
// ==================================================

export function onCanvasClick(
  pixelX,
  pixelY,
  callbacks = {}
) {
  const {
    onCalibrationNeeded,
    onNoPointNearby
  } = callbacks;

  if (
    mode === 'calibrate'
  ) {
    handleCalibrationClick(
      pixelX,
      pixelY,
      onCalibrationNeeded
    );

    return;
  }

  if (
    pixelsPerMeter === null
  ) {
    return;
  }

  if (
    mode === 'walls'
  ) {
    handleWallModeClick(
      pixelX,
      pixelY
    );

    return;
  }

  if (
    mode === 'room'
  ) {
    handleRoomModeClick(
      pixelX,
      pixelY,
      onNoPointNearby
    );

    return;
  }
}

// ==================================================
// Output generation
// ==================================================

export function saveAllRoomsForPreview() {
  localStorage.removeItem(
    'unittwin_trace_preview'
  );

  const walls =
    networkWalls.map(
      (w) => {
        const a =
          getPoint(w.pointA);

        const b =
          getPoint(w.pointB);

        return {
          id: w.id,

          start: {
            x: parseFloat(
              a.meterX.toFixed(3)
            ),
            z: parseFloat(
              a.meterZ.toFixed(3)
            )
          },

          end: {
            x: parseFloat(
              b.meterX.toFixed(3)
            ),
            z: parseFloat(
              b.meterZ.toFixed(3)
            )
          }
        };
      }
    );

  const rooms =
    completedRooms.map(
      (r) => ({
        id: r.id,
        label: r.label,
        wallIds: r.wallIds,

        corners:
          r.pointIds.map(
            (pid) => {
              const p =
                getPoint(pid);

              return {
                x: parseFloat(
                  p.meterX.toFixed(3)
                ),
                z: parseFloat(
                  p.meterZ.toFixed(3)
                )
              };
            }
          )
      })
    );

  localStorage.setItem(
    'unittwin_trace_preview',
    JSON.stringify({
      walls,
      rooms
    })
  );
}

// ==================================================
// Full reset
// ==================================================

export function startOver() {
  calibrationPoints = [];
  pixelsPerMeter = null;

  networkPoints = [];
  networkWalls = [];

  nextPointId = 1;
  nextWallId = 1;

  currentChainPointId = null;
  wallChainHistory = [];

  completedRooms = [];
  currentRoomPointIds = [];

  mode = 'idle';

  redrawImage();
}

// ==================================================
// Debug
// ==================================================

export function debugDumpNetwork() {
  console.log(
    'POINTS:',
    networkPoints.map(
      (p) => ({
        id: p.id,
        meterX:
          p.meterX.toFixed(2),
        meterZ:
          p.meterZ.toFixed(2)
      })
    )
  );

  console.log(
    'WALLS:',
    networkWalls.map(
      (w) => ({
        id: w.id,
        pointA: w.pointA,
        pointB: w.pointB
      })
    )
  );

  console.log(
    'CURRENT ROOM SELECTION:',
    currentRoomPointIds
  );
}