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
//
// A wall is { id, pointA, pointB, openings: [{ offset, width }] }.
// Openings are measured in METRES along the wall from pointA.
// A door is an opening on a wall — never a gap between walls.
// --------------------------------------------------
let networkPoints = [];
let networkWalls = [];
let nextPointId = 1;
let nextWallId = 1;

let currentChainPointId = null;
let wallChainHistory = [];

let previewCursor = null;

// --------------------------------------------------
// Door marking state
// --------------------------------------------------
let doorWallId = null;      // wall currently selected for a door
let doorFirstT = null;      // first click's position along that wall (0..1)

// --------------------------------------------------
// Rooms — floors and ceilings only
// --------------------------------------------------
let completedRooms = [];
let currentRoomPointIds = [];

// --------------------------------------------------
// Mode: 'idle' | 'calibrate' | 'walls' | 'doors' | 'room'
// --------------------------------------------------
let mode = 'idle';

const SNAP_TOLERANCE_PX = 18;
const WALL_LINE_SPLIT_TOLERANCE_PX = 12;
const WALL_PICK_TOLERANCE_PX = 20;
const ORTHO_SNAP_DEGREES = 8;
const COORD_SNAP_PX = 12;

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

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);

      calibrationPoints = [];
      pixelsPerMeter = null;

      networkPoints = [];
      networkWalls = [];

      nextPointId = 1;
      nextWallId = 1;

      currentChainPointId = null;
      wallChainHistory = [];
      previewCursor = null;

      doorWallId = null;
      doorFirstT = null;

      completedRooms = [];
      currentRoomPointIds = [];

      mode = 'idle';

      if (onLoaded) onLoaded();
    };

    img.onerror = () => console.error('Failed to load image.');
    img.src = event.target.result;
  };

  reader.onerror = () => console.error('Failed to read file.');
  reader.readAsDataURL(file);
}

export function isCalibrated() {
  return pixelsPerMeter !== null;
}

export function redrawImage() {
  if (!loadedImage) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(loadedImage, 0, 0);
}

// ==================================================
// Drawing
// ==================================================

function drawMarker(x, y, color, radius) {
  if (!ctx) return;
  const r = radius || 6;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawLine(ax, ay, bx, by, color, width) {
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.strokeStyle = color;
  ctx.lineWidth = width || 3;
  ctx.stroke();
}

function drawLabel(ax, ay, bx, by, text, color) {
  const midX = (ax + bx) / 2;
  const midY = (ay + by) / 2;
  ctx.font = 'bold 13px sans-serif';
  ctx.fillStyle = color || '#00aaff';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 3;
  ctx.strokeText(text, midX + 6, midY - 6);
  ctx.fillText(text, midX + 6, midY - 6);
}

export function redrawAll() {
  redrawImage();

  for (const wall of networkWalls) {
    const a = getPoint(wall.pointA);
    const b = getPoint(wall.pointB);
    if (!a || !b) continue;

    const isDoorTarget = mode === 'doors' && wall.id === doorWallId;
    drawLine(
      a.pixelX, a.pixelY, b.pixelX, b.pixelY,
      isDoorTarget ? '#ff00ff' : '#00aaff',
      isDoorTarget ? 4 : 2
    );

    const lengthM = wallLengthMeters(wall);
    drawLabel(a.pixelX, a.pixelY, b.pixelX, b.pixelY, lengthM.toFixed(2) + 'm');

    // Draw this wall's openings in yellow
    const openings = wall.openings || [];
    for (const op of openings) {
      const t1 = op.offset / lengthM;
      const t2 = (op.offset + op.width) / lengthM;

      const x1 = a.pixelX + (b.pixelX - a.pixelX) * t1;
      const y1 = a.pixelY + (b.pixelY - a.pixelY) * t1;
      const x2 = a.pixelX + (b.pixelX - a.pixelX) * t2;
      const y2 = a.pixelY + (b.pixelY - a.pixelY) * t2;

      drawLine(x1, y1, x2, y2, '#ffdd00', 5);
      drawLabel(x1, y1, x2, y2, 'DOOR ' + op.width.toFixed(2) + 'm', '#ffdd00');
    }
  }

  for (const point of networkPoints) {
    drawMarker(point.pixelX, point.pixelY, '#ffffff', 4);
  }

  // First door click, awaiting the second
  if (mode === 'doors' && doorWallId && doorFirstT !== null) {
    const wall = getWall(doorWallId);
    if (wall) {
      const a = getPoint(wall.pointA);
      const b = getPoint(wall.pointB);
      if (a && b) {
        drawMarker(
          a.pixelX + (b.pixelX - a.pixelX) * doorFirstT,
          a.pixelY + (b.pixelY - a.pixelY) * doorFirstT,
          '#ffdd00',
          8
        );
      }
    }
  }

  if (mode === 'room' && currentRoomPointIds.length > 0) {
    const pts = currentRoomPointIds.map(getPoint).filter(Boolean);
    for (let i = 0; i < pts.length - 1; i++) {
      drawLine(pts[i].pixelX, pts[i].pixelY, pts[i + 1].pixelX, pts[i + 1].pixelY, '#ff8800', 4);
    }
    for (const p of pts) {
      drawMarker(p.pixelX, p.pixelY, '#ff8800', 6);
    }
  }

  if (mode === 'walls' && previewCursor) {
    const anchor = currentChainPointId ? getPoint(currentChainPointId) : null;

    if (anchor && pixelsPerMeter) {
      drawLine(anchor.pixelX, anchor.pixelY, previewCursor.x, previewCursor.y, '#00ff88', 2);
      const lengthM =
        Math.hypot(previewCursor.x - anchor.pixelX, previewCursor.y - anchor.pixelY) /
        pixelsPerMeter;
      drawLabel(
        anchor.pixelX, anchor.pixelY, previewCursor.x, previewCursor.y,
        lengthM.toFixed(2) + 'm', '#00ff88'
      );
    }

    drawMarker(previewCursor.x, previewCursor.y, '#00ff88', 5);
  }
}

function getPoint(id) {
  return networkPoints.find(function (p) { return p.id === id; }) || null;
}

function getWall(id) {
  return networkWalls.find(function (w) { return w.id === id; }) || null;
}

function wallLengthMeters(wall) {
  const a = getPoint(wall.pointA);
  const b = getPoint(wall.pointB);
  if (!a || !b) return 0;
  return Math.hypot(b.meterX - a.meterX, b.meterZ - a.meterZ);
}

// ==================================================
// Calibration
// ==================================================

export function enterCalibrateMode() {
  mode = 'calibrate';
  calibrationPoints = [];
}

function handleCalibrationClick(pixelX, pixelY, onCalibrationNeeded) {
  calibrationPoints.push({ x: pixelX, y: pixelY });
  drawMarker(pixelX, pixelY, '#00ff00');

  if (calibrationPoints.length === 2 && onCalibrationNeeded) {
    onCalibrationNeeded(calibrationPoints);
  }
}

export function setCalibrationDistance(realMeters) {
  if (calibrationPoints.length !== 2) return false;
  if (!Number.isFinite(realMeters) || realMeters <= 0) return false;

  const a = calibrationPoints[0];
  const b = calibrationPoints[1];
  const pixelDist = Math.hypot(b.x - a.x, b.y - a.y);
  if (pixelDist === 0) return false;

  pixelsPerMeter = pixelDist / realMeters;
  mode = 'idle';
  return true;
}

function pixelToMeter(pixelX, pixelY) {
  const origin = calibrationPoints[0];
  return {
    meterX: (pixelX - origin.x) / pixelsPerMeter,
    meterZ: (pixelY - origin.y) / pixelsPerMeter,
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
  previewCursor = null;
}

export function breakWallChain() {
  currentChainPointId = null;
  wallChainHistory = [];
  previewCursor = null;
  redrawAll();
}

export function exitWallMode() {
  mode = 'idle';
  currentChainPointId = null;
  wallChainHistory = [];
  previewCursor = null;
  redrawAll();
}

export function enterDoorMarkMode() {
  mode = 'doors';
  doorWallId = null;
  doorFirstT = null;
  previewCursor = null;
  redrawAll();
}

export function exitDoorMarkMode() {
  mode = 'idle';
  doorWallId = null;
  doorFirstT = null;
  redrawAll();
}

export function enterRoomMode() {
  mode = 'room';
  currentRoomPointIds = [];
  previewCursor = null;
}

export function exitRoomMode() {
  mode = 'idle';
  currentRoomPointIds = [];
  redrawAll();
}

// ==================================================
// Point snapping
// ==================================================

function findNearbyPoint(pixelX, pixelY, tolerance) {
  let closest = null;
  let closestDist = Infinity;

  for (const p of networkPoints) {
    const dist = Math.hypot(p.pixelX - pixelX, p.pixelY - pixelY);
    if (dist < tolerance && dist < closestDist) {
      closest = p;
      closestDist = dist;
    }
  }
  return closest;
}

function applySnapping(pixelX, pixelY, anchorPoint) {
  let x = pixelX;
  let y = pixelY;

  if (anchorPoint) {
    const dx = x - anchorPoint.pixelX;
    const dy = y - anchorPoint.pixelY;
    const len = Math.hypot(dx, dy);

    if (len > 0) {
      const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
      const nearest90 = Math.round(angleDeg / 90) * 90;

      if (Math.abs(angleDeg - nearest90) < ORTHO_SNAP_DEGREES) {
        const rad = (nearest90 * Math.PI) / 180;
        x = anchorPoint.pixelX + Math.cos(rad) * len;
        y = anchorPoint.pixelY + Math.sin(rad) * len;
      }
    }
  }

  for (const p of networkPoints) {
    if (Math.abs(p.pixelX - x) < COORD_SNAP_PX) x = p.pixelX;
    if (Math.abs(p.pixelY - y) < COORD_SNAP_PX) y = p.pixelY;
  }

  return { x: x, y: y };
}

function createPoint(pixelX, pixelY) {
  const converted = pixelToMeter(pixelX, pixelY);
  const point = {
    id: 'p' + nextPointId,
    pixelX: pixelX,
    pixelY: pixelY,
    meterX: converted.meterX,
    meterZ: converted.meterZ,
  };
  nextPointId = nextPointId + 1;
  networkPoints.push(point);
  return point;
}

// ==================================================
// Wall picking / splitting
// ==================================================

/**
 * Finds the wall whose LINE is closest to a click, with the click's
 * position along it as t (0..1). Used both for splitting a wall
 * while tracing and for placing a door on a wall.
 */
function findWallAtPixel(pixelX, pixelY, tolerance, requireInterior) {
  let best = null;
  let bestDist = Infinity;

  for (const wall of networkWalls) {
    const a = getPoint(wall.pointA);
    const b = getPoint(wall.pointB);
    if (!a || !b) continue;

    const dx = b.pixelX - a.pixelX;
    const dy = b.pixelY - a.pixelY;
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq === 0) continue;

    let t = ((pixelX - a.pixelX) * dx + (pixelY - a.pixelY) * dy) / lengthSq;

    if (requireInterior) {
      if (t < 0.05 || t > 0.95) continue;
    } else {
      t = Math.max(0, Math.min(1, t));
    }

    const projX = a.pixelX + t * dx;
    const projY = a.pixelY + t * dy;
    const dist = Math.hypot(pixelX - projX, pixelY - projY);

    if (dist < bestDist) {
      bestDist = dist;
      best = { wall: wall, t: t, pixelX: projX, pixelY: projY };
    }
  }

  if (best && bestDist < tolerance) return best;
  return null;
}

function splitWallAtPoint(wall, pixelX, pixelY) {
  const newPoint = createPoint(pixelX, pixelY);

  networkWalls = networkWalls.filter(function (w) { return w.id !== wall.id; });

  networkWalls.push({
    id: 'w' + nextWallId, pointA: wall.pointA, pointB: newPoint.id, openings: [],
  });
  nextWallId = nextWallId + 1;

  networkWalls.push({
    id: 'w' + nextWallId, pointA: newPoint.id, pointB: wall.pointB, openings: [],
  });
  nextWallId = nextWallId + 1;

  return newPoint;
}

// ==================================================
// Live preview
// ==================================================

export function setPreviewCursor(pixelX, pixelY, bypassSnapping) {
  if (mode !== 'walls' || pixelsPerMeter === null) return;

  const existing = findNearbyPoint(pixelX, pixelY, SNAP_TOLERANCE_PX);

  if (existing) {
    previewCursor = { x: existing.pixelX, y: existing.pixelY };
  } else {
    const onWall = findWallAtPixel(pixelX, pixelY, WALL_LINE_SPLIT_TOLERANCE_PX, true);

    if (onWall) {
      previewCursor = { x: onWall.pixelX, y: onWall.pixelY };
    } else {
      const anchor = currentChainPointId ? getPoint(currentChainPointId) : null;
      const snapped = bypassSnapping === true
        ? { x: pixelX, y: pixelY }
        : applySnapping(pixelX, pixelY, anchor);
      previewCursor = { x: snapped.x, y: snapped.y };
    }
  }

  redrawAll();
}

export function clearPreviewCursor() {
  previewCursor = null;
  redrawAll();
}

// ==================================================
// Wall tracing mode
// ==================================================

function handleWallModeClick(pixelX, pixelY, bypassSnapping) {
  let point = findNearbyPoint(pixelX, pixelY, SNAP_TOLERANCE_PX);
  let pointWasNew = false;

  if (!point) {
    // Clicking a wall's line is explicit intent — checked at the raw
    // click, before snapping can nudge us off that line.
    const onWall = findWallAtPixel(pixelX, pixelY, WALL_LINE_SPLIT_TOLERANCE_PX, true);

    if (onWall) {
      point = splitWallAtPoint(onWall.wall, onWall.pixelX, onWall.pixelY);
      pointWasNew = true;
    } else {
      const anchor = currentChainPointId ? getPoint(currentChainPointId) : null;
      const snapped = bypassSnapping
        ? { x: pixelX, y: pixelY }
        : applySnapping(pixelX, pixelY, anchor);

      point = findNearbyPoint(snapped.x, snapped.y, SNAP_TOLERANCE_PX);

      if (!point) {
        point = createPoint(snapped.x, snapped.y);
        pointWasNew = true;
      }
    }
  }

  let createdWallId = null;

  if (currentChainPointId && currentChainPointId !== point.id) {
    const alreadyExists = networkWalls.some(function (w) {
      return (w.pointA === currentChainPointId && w.pointB === point.id) ||
        (w.pointA === point.id && w.pointB === currentChainPointId);
    });

    if (!alreadyExists) {
      const wall = {
        id: 'w' + nextWallId,
        pointA: currentChainPointId,
        pointB: point.id,
        openings: [],
      };
      nextWallId = nextWallId + 1;
      networkWalls.push(wall);
      createdWallId = wall.id;
    }
  }

  wallChainHistory.push({ wallId: createdWallId, pointId: point.id, pointWasNew: pointWasNew });
  currentChainPointId = point.id;
  redrawAll();
}

export function undoLastWallPoint() {
  const last = wallChainHistory.pop();
  if (!last) return;

  if (last.wallId) {
    networkWalls = networkWalls.filter(function (w) { return w.id !== last.wallId; });
  }

  if (last.pointWasNew) {
    const stillUsed = networkWalls.some(function (w) {
      return w.pointA === last.pointId || w.pointB === last.pointId;
    });
    if (!stillUsed) {
      networkPoints = networkPoints.filter(function (p) { return p.id !== last.pointId; });
    }
  }

  const prev = wallChainHistory[wallChainHistory.length - 1];
  currentChainPointId = prev ? prev.pointId : null;

  redrawAll();
}

// ==================================================
// Door marking mode
//
// Click a wall to select it, then click two points along it. Both
// clicks are projected onto that wall's own line, so the opening is
// always exactly on the wall no matter how precise the click was.
// ==================================================

function handleDoorMarkClick(pixelX, pixelY, callbacks) {
  const cb = callbacks || {};

  // No wall selected yet — pick the one under the click.
  if (!doorWallId) {
    const hit = findWallAtPixel(pixelX, pixelY, WALL_PICK_TOLERANCE_PX, false);
    if (!hit) {
      if (cb.onNoWallNearby) cb.onNoWallNearby();
      return;
    }
    doorWallId = hit.wall.id;
    doorFirstT = null;
    redrawAll();
    if (cb.onWallSelected) cb.onWallSelected(wallLengthMeters(hit.wall));
    return;
  }

  const wall = getWall(doorWallId);
  if (!wall) {
    doorWallId = null;
    doorFirstT = null;
    return;
  }

  const a = getPoint(wall.pointA);
  const b = getPoint(wall.pointB);
  if (!a || !b) return;

  const dx = b.pixelX - a.pixelX;
  const dy = b.pixelY - a.pixelY;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return;

  let t = ((pixelX - a.pixelX) * dx + (pixelY - a.pixelY) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));

  if (doorFirstT === null) {
    doorFirstT = t;
    redrawAll();
    return;
  }

  const lengthM = wallLengthMeters(wall);
  const tLo = Math.min(doorFirstT, t);
  const tHi = Math.max(doorFirstT, t);

  const offset = tLo * lengthM;
  const width = (tHi - tLo) * lengthM;

  doorFirstT = null;

  if (width < 0.05) {
    redrawAll();
    return;
  }

  if (!wall.openings) wall.openings = [];
  wall.openings.push({
    offset: parseFloat(offset.toFixed(3)),
    width: parseFloat(width.toFixed(3)),
  });

  doorWallId = null;
  redrawAll();

  if (cb.onDoorMarked) cb.onDoorMarked(getMarkedDoorCount(), width);
}

export function getMarkedDoorCount() {
  let count = 0;
  for (const w of networkWalls) {
    count += (w.openings || []).length;
  }
  return count;
}

export function undoLastMarkedDoor() {
  // Cancel an in-progress marking first.
  if (doorFirstT !== null) {
    doorFirstT = null;
    redrawAll();
    return;
  }
  if (doorWallId) {
    doorWallId = null;
    redrawAll();
    return;
  }

  // Otherwise remove the most recently added opening.
  for (let i = networkWalls.length - 1; i >= 0; i--) {
    const ops = networkWalls[i].openings || [];
    if (ops.length > 0) {
      ops.pop();
      redrawAll();
      return;
    }
  }
}

// ==================================================
// Room definition mode
// ==================================================

function handleRoomModeClick(pixelX, pixelY, onNoPointNearby) {
  const point = findNearbyPoint(pixelX, pixelY, SNAP_TOLERANCE_PX);
  if (!point) {
    if (onNoPointNearby) onNoPointNearby();
    return;
  }
  currentRoomPointIds.push(point.id);
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
// Self-intersection check
// ==================================================

function orientation(a, b, c) {
  const val = (b.z - a.z) * (c.x - b.x) - (b.x - a.x) * (c.z - b.z);
  if (Math.abs(val) < 1e-9) return 0;
  return val > 0 ? 1 : 2;
}

function onSegmentCheck(a, b, c) {
  return Math.min(a.x, c.x) <= b.x && b.x <= Math.max(a.x, c.x) &&
    Math.min(a.z, c.z) <= b.z && b.z <= Math.max(a.z, c.z);
}

function segmentsIntersect(p1, p2, p3, p4) {
  const o1 = orientation(p1, p2, p3);
  const o2 = orientation(p1, p2, p4);
  const o3 = orientation(p3, p4, p1);
  const o4 = orientation(p3, p4, p2);

  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegmentCheck(p1, p3, p2)) return true;
  if (o2 === 0 && onSegmentCheck(p1, p4, p2)) return true;
  if (o3 === 0 && onSegmentCheck(p3, p1, p4)) return true;
  if (o4 === 0 && onSegmentCheck(p3, p2, p4)) return true;
  return false;
}

function findSelfIntersection(points) {
  const pts = points.map(function (id) { return getPoint(id); });
  const n = pts.length;

  for (let i = 0; i < n; i++) {
    const a1 = { x: pts[i].meterX, z: pts[i].meterZ };
    const a2 = { x: pts[(i + 1) % n].meterX, z: pts[(i + 1) % n].meterZ };

    for (let j = i + 1; j < n; j++) {
      if (j === i || j === (i + 1) % n || (j + 1) % n === i) continue;

      const b1 = { x: pts[j].meterX, z: pts[j].meterZ };
      const b2 = { x: pts[(j + 1) % n].meterX, z: pts[(j + 1) % n].meterZ };

      if (segmentsIntersect(a1, a2, b1, b2)) {
        return { i: i, j: j };
      }
    }
  }
  return null;
}

// ==================================================
// Commit room — floors and ceilings only. Doors live on walls.
// ==================================================

export function commitCurrentRoom(roomId, roomLabel) {
  let points = currentRoomPointIds.slice();
  if (points.length > 1 && points[points.length - 1] === points[0]) {
    points = points.slice(0, -1);
  }

  if (points.length < 3) {
    return { success: false, reason: 'not_enough_points' };
  }

  const idTaken = completedRooms.some(function (r) { return r.id === roomId; });
  if (idTaken) {
    return { success: false, reason: 'duplicate_id' };
  }

  const intersection = findSelfIntersection(points);
  if (intersection) {
    return { success: false, reason: 'self_intersecting', i: intersection.i, j: intersection.j };
  }

  // Record which traced walls form this room's boundary, where one
  // exists. Purely informational — nothing is generated from it.
  const wallIds = [];
  for (let i = 0; i < points.length; i++) {
    const aId = points[i];
    const bId = points[(i + 1) % points.length];

    const wall = networkWalls.find(function (w) {
      return (w.pointA === aId && w.pointB === bId) || (w.pointA === bId && w.pointB === aId);
    });

    if (wall && wallIds.indexOf(wall.id) === -1) wallIds.push(wall.id);
  }

  completedRooms.push({
    id: roomId,
    label: roomLabel,
    pointIds: points,
    wallIds: wallIds,
  });

  currentRoomPointIds = [];
  redrawAll();

  return { success: true };
}

// ==================================================
// Unified click dispatcher
// ==================================================

export function onCanvasClick(pixelX, pixelY, callbacks, bypassSnapping) {
  const cb = callbacks || {};

  if (mode === 'calibrate') {
    handleCalibrationClick(pixelX, pixelY, cb.onCalibrationNeeded);
    return;
  }

  if (pixelsPerMeter === null) return;

  if (mode === 'walls') {
    handleWallModeClick(pixelX, pixelY, bypassSnapping === true);
    return;
  }

  if (mode === 'doors') {
    handleDoorMarkClick(pixelX, pixelY, cb);
    return;
  }

  if (mode === 'room') {
    handleRoomModeClick(pixelX, pixelY, cb.onNoPointNearby);
    return;
  }
}

// ==================================================
// Output generation
// ==================================================

export function saveAllRoomsForPreview() {
  localStorage.removeItem('unittwin_trace_preview');

  const walls = networkWalls.map(function (w) {
    const a = getPoint(w.pointA);
    const b = getPoint(w.pointB);

    const wallData = {
      id: w.id,
      start: { x: parseFloat(a.meterX.toFixed(3)), z: parseFloat(a.meterZ.toFixed(3)) },
      end: { x: parseFloat(b.meterX.toFixed(3)), z: parseFloat(b.meterZ.toFixed(3)) },
    };

    const ops = w.openings || [];
    if (ops.length > 0) {
      wallData.openings = ops.map(function (o) {
        return { offset: o.offset, width: o.width };
      });
    }

    return wallData;
  });

  const rooms = completedRooms.map(function (r) {
    return {
      id: r.id,
      label: r.label,
      wallIds: r.wallIds,
      corners: r.pointIds.map(function (pid) {
        const p = getPoint(pid);
        return { x: parseFloat(p.meterX.toFixed(3)), z: parseFloat(p.meterZ.toFixed(3)) };
      }),
    };
  });

  localStorage.setItem('unittwin_trace_preview', JSON.stringify({ walls: walls, rooms: rooms }));
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
  previewCursor = null;

  doorWallId = null;
  doorFirstT = null;

  completedRooms = [];
  currentRoomPointIds = [];

  mode = 'idle';

  redrawImage();
}

// ==================================================
// Debug
// ==================================================

export function debugDumpNetwork() {
  console.log('POINTS:', networkPoints.map(function (p) {
    return { id: p.id, meterX: p.meterX.toFixed(2), meterZ: p.meterZ.toFixed(2) };
  }));
  console.log('WALLS:', networkWalls.map(function (w) {
    return { id: w.id, pointA: w.pointA, pointB: w.pointB, openings: w.openings || [] };
  }));
  console.log('CURRENT ROOM SELECTION:', currentRoomPointIds);
}