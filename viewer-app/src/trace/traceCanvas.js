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
let doorPendingOpening = null; // { offset, width } awaiting a swing side

// --------------------------------------------------
// Rooms — floors and ceilings only
// --------------------------------------------------
let completedRooms = [];

/*
 * Storeys. Each completed storey is a plain snapshot in metres —
 * walls and rooms — plus the reference point its coordinates are
 * measured against.
 *
 * Two floors are usually drawn side by side on one sheet, so the
 * upper floor traces out 15m east of the lower one. Aligning them
 * means picking the same physical corner on each drawing; every
 * storey is then shifted so those points coincide.
 */
let completedStoreys = [];
let storeyRefPoint = null;      // { meterX, meterZ } for the storey being traced
let awaitingRefPoint = false;   // true right after New Floor, until a corner is clicked
let previousRefPoint = null;    // the corner picked on the floor below
let previousStoreySnapshot = null; // the floor below, drawn as a guide
let currentRoomPointIds = [];

// --------------------------------------------------
// Mode: 'idle' | 'calibrate' | 'walls' | 'doors' | 'room'
// --------------------------------------------------
let mode = 'idle';

const SNAP_TOLERANCE_PX = 18;
const WALL_LINE_SPLIT_TOLERANCE_PX = 12;
const WALL_PICK_TOLERANCE_PX = 20;
const DOOR_SIDE_MIN_PX = 12;

/*
 * Plans are drawn to round numbers; clicks are not. A wall that traces
 * at 3.47m on a plan dimensioned in centimetres is meant to be 3.50m,
 * and on a low-resolution scan the error is larger than the rounding.
 *
 * A wall length within this tolerance of a multiple of the grid is
 * pulled onto it, by moving the point being placed along the wall's
 * own direction so the angle is untouched.
 */
const LENGTH_SNAP_GRID_M = 0.05;
const LENGTH_SNAP_TOLERANCE_M = 0.06;
let lengthSnapEnabled = true;

// Metres per storey. The viewer scales this like everything else.
const STOREY_HEIGHT_M = 2.5;

/*
 * Floors of the same building share an exterior, but tracing each one
 * by hand never reproduces it exactly — a few centimetres out and the
 * upper floor visibly overhangs the lower.
 *
 * With this on, every storey above the ground is stretched and shifted
 * so its exterior extents match the ground floor's exactly. Right when
 * floors share a footprint, wrong for a genuine setback or terrace —
 * turn it off for those.
 */
const ALIGN_STOREY_FOOTPRINTS = true;
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

export function loadImageFile(file, onLoaded, keepStoreys) {
  const reader = new FileReader();

  reader.onload = (event) => {
    const img = new Image();

    img.onload = () => {
      loadedImage = img;
      canvas.width = img.width;
      canvas.height = img.height;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);

      // Adding a floor from a second drawing keeps what is already
      // traced; only a fresh project clears it. Calibration is per
      // image, so a new image always needs recalibrating.
      if (!keepStoreys) {
        completedStoreys = [];
      }

      storeyRefPoint = null;
      // Every floor picks its own alignment corner, the first
      // included — otherwise the concept only appears on floor two,
      // demanding a match to something never knowingly chosen.
      awaitingRefPoint = true;

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
  if (mode === 'doors' && doorWallId) {
    const wall = getWall(doorWallId);
    const a = wall ? getPoint(wall.pointA) : null;
    const b = wall ? getPoint(wall.pointB) : null;

    if (a && b) {
      // First click placed, waiting for the second.
      if (doorFirstT !== null) {
        drawMarker(
          a.pixelX + (b.pixelX - a.pixelX) * doorFirstT,
          a.pixelY + (b.pixelY - a.pixelY) * doorFirstT,
          '#ffdd00',
          8
        );
      }

      // Opening set, waiting for a side. A door can only open
      // perpendicular to its wall, so show exactly those two
      // directions: up/down on a horizontal wall, left/right on a
      // vertical one, square to it on anything angled.
      if (doorPendingOpening) {
        const lengthM = wallLengthMeters(wall);
        const t1 = doorPendingOpening.offset / lengthM;
        const t2 = (doorPendingOpening.offset + doorPendingOpening.width) / lengthM;

        const x1 = a.pixelX + (b.pixelX - a.pixelX) * t1;
        const y1 = a.pixelY + (b.pixelY - a.pixelY) * t1;
        const x2 = a.pixelX + (b.pixelX - a.pixelX) * t2;
        const y2 = a.pixelY + (b.pixelY - a.pixelY) * t2;

        drawLine(x1, y1, x2, y2, '#ffdd00', 5);

        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;

        const wdx = b.pixelX - a.pixelX;
        const wdy = b.pixelY - a.pixelY;
        const wlen = Math.hypot(wdx, wdy) || 1;
        const nx = -wdy / wlen;
        const ny = wdx / wlen;

        const ARROW = 45;

        for (const sign of [1, -1]) {
          const tipX = midX + nx * ARROW * sign;
          const tipY = midY + ny * ARROW * sign;

          drawLine(midX, midY, tipX, tipY, '#ffdd00', 3);
          drawMarker(tipX, tipY, '#ffdd00', 7);
        }

        drawLabel(x1, y1, x2, y2, 'Click one arrow', '#ffdd00');
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

  if (calibrationPoints[0] && pixelsPerMeter) {
    const origin = calibrationPoints[0];

    /*
     * The floor below, drawn faintly over this drawing and lined up
     * on the two reference corners. Keeping its measurements on
     * screen is the whole point — you can see what the floor below
     * measured while tracing the one above it.
     */
    if (previousStoreySnapshot) {
      // Before the alignment corner is clicked there is nothing to
      // line up against, so it is drawn where it was traced. Once the
      // corner is set it snaps over this floor's drawing.
      const aligned = previousRefPoint && storeyRefPoint;
      const shiftX = aligned ? storeyRefPoint.meterX - previousRefPoint.meterX : 0;
      const shiftZ = aligned ? storeyRefPoint.meterZ - previousRefPoint.meterZ : 0;

      const toPixel = function (m) {
        return {
          pixelX: origin.x + (m.x + shiftX) * pixelsPerMeter,
          pixelY: origin.y + (m.z + shiftZ) * pixelsPerMeter,
        };
      };

      ctx.save();
      ctx.globalAlpha = 0.45;

      for (const w of previousStoreySnapshot.walls) {
        const a = toPixel(w.start);
        const b = toPixel(w.end);

        drawLine(a.pixelX, a.pixelY, b.pixelX, b.pixelY, '#00d0ff', 2);

        const lengthM = Math.hypot(w.end.x - w.start.x, w.end.z - w.start.z);
        drawLabel(a.pixelX, a.pixelY, b.pixelX, b.pixelY, lengthM.toFixed(2) + 'm', '#00d0ff');
      }

      ctx.restore();
    }

    // Where the floor below put its corner. On a single sheet this
    // lands on the other drawing, so you can see what to match.
    if (previousRefPoint) {
      const gx = origin.x + previousRefPoint.meterX * pixelsPerMeter;
      const gy = origin.y + previousRefPoint.meterZ * pixelsPerMeter;

      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.arc(gx, gy, 12, 0, Math.PI * 2);
      ctx.strokeStyle = '#ff44ff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();

      drawLabel(gx, gy, gx, gy, 'floor below', '#ff44ff');
    }

    if (storeyRefPoint) {
      const px = origin.x + storeyRefPoint.meterX * pixelsPerMeter;
      const py = origin.y + storeyRefPoint.meterZ * pixelsPerMeter;

      drawMarker(px, py, '#ff44ff', 8);
      drawLabel(px, py, px, py, 'REF', '#ff44ff');
    }
  }

  if (mode === 'calibrate') {
    for (const cp of calibrationPoints) {
      drawMarker(cp.x, cp.y, '#00ff00', 6);
    }

    if (calibrationPoints.length === 1 && previewCursor) {
      const a = calibrationPoints[0];
      drawLine(a.x, a.y, previewCursor.x, previewCursor.y, '#00ff00', 2);
      drawMarker(previewCursor.x, previewCursor.y, '#00ff00', 5);
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

function handleCalibrationClick(pixelX, pixelY, onCalibrationNeeded, bypassSnapping) {
  let x = pixelX;
  let y = pixelY;

  // CAD dimension lines are horizontal or vertical, so the second
  // point snaps square to the first unless Shift is held.
  if (calibrationPoints.length === 1 && bypassSnapping !== true) {
    const a = calibrationPoints[0];
    const snapped = applySnapping(x, y, { pixelX: a.x, pixelY: a.y });
    x = snapped.x;
    y = snapped.y;
  }

  calibrationPoints.push({ x: x, y: y });
  previewCursor = null;
  redrawAll();

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

  // A floor added from a second drawing needs its alignment corner
  // before anything else; without this it drops to idle and the
  // reference point is never collected.
  mode = awaitingRefPoint ? 'refpoint' : 'idle';

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
  doorPendingOpening = null;
  previewCursor = null;
  redrawAll();
}

export function exitDoorMarkMode() {
  mode = 'idle';
  doorWallId = null;
  doorFirstT = null;
  doorPendingOpening = null;
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
  if (mode === 'calibrate') {
    if (calibrationPoints.length === 1) {
      const a = calibrationPoints[0];
      const snapped = bypassSnapping === true
        ? { x: pixelX, y: pixelY }
        : applySnapping(pixelX, pixelY, { pixelX: a.x, pixelY: a.y });
      previewCursor = { x: snapped.x, y: snapped.y };
      redrawAll();
    }
    return;
  }

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
      let snapped = bypassSnapping === true
        ? { x: pixelX, y: pixelY }
        : applySnapping(pixelX, pixelY, anchor);

      if (bypassSnapping !== true) {
        snapped = applyLengthSnap(snapped.x, snapped.y, anchor);
      }

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

/**
 * Nudges a click along the wall it is forming so the wall lands on a
 * round length. Only the distance from the anchor changes, so ortho
 * snapping and any deliberate angle survive intact.
 */
function applyLengthSnap(x, y, anchorPoint) {
  if (!lengthSnapEnabled || !anchorPoint || !pixelsPerMeter) return { x: x, y: y };

  const dx = x - anchorPoint.pixelX;
  const dy = y - anchorPoint.pixelY;
  const pixelLen = Math.hypot(dx, dy);
  if (pixelLen < 1) return { x: x, y: y };

  const metres = pixelLen / pixelsPerMeter;
  const snapped = Math.round(metres / LENGTH_SNAP_GRID_M) * LENGTH_SNAP_GRID_M;

  if (snapped <= 0) return { x: x, y: y };
  if (Math.abs(metres - snapped) > LENGTH_SNAP_TOLERANCE_M) return { x: x, y: y };

  const scale = (snapped * pixelsPerMeter) / pixelLen;
  return {
    x: anchorPoint.pixelX + dx * scale,
    y: anchorPoint.pixelY + dy * scale,
  };
}

export function setLengthSnapEnabled(on) {
  lengthSnapEnabled = on === true;
}

export function isLengthSnapEnabled() {
  return lengthSnapEnabled;
}

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
      let snapped = bypassSnapping
        ? { x: pixelX, y: pixelY }
        : applySnapping(pixelX, pixelY, anchor);

      // Round the wall's length after squaring its angle, so the two
      // corrections do not fight each other.
      if (!bypassSnapping) {
        snapped = applyLengthSnap(snapped.x, snapped.y, anchor);
      }

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
    doorPendingOpening = null;
    redrawAll();
    if (cb.onWallSelected) cb.onWallSelected(wallLengthMeters(hit.wall));
    return;
  }

  const wall = getWall(doorWallId);
  if (!wall) {
    doorWallId = null;
    doorFirstT = null;
    doorPendingOpening = null;
    return;
  }

  const a = getPoint(wall.pointA);
  const b = getPoint(wall.pointB);
  if (!a || !b) return;

  const dx = b.pixelX - a.pixelX;
  const dy = b.pixelY - a.pixelY;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return;

  // Third click: which side of the wall does the door swing into?
  if (doorPendingOpening) {
    // Dividing by the wall's length turns the cross product into a
    // real perpendicular distance in pixels, so the threshold means
    // the same on a long wall as on a short one.
    const len = Math.sqrt(lengthSq);
    const cross = (dx * (pixelY - a.pixelY) - dy * (pixelX - a.pixelX)) / len;

    // A door can only swing perpendicular to its own wall, so the
    // click has to land clearly on one side. Near the line itself the
    // side is ambiguous — refuse rather than guess.
    if (Math.abs(cross) < DOOR_SIDE_MIN_PX) {
      if (cb.onDoorSideAmbiguous) cb.onDoorSideAmbiguous();
      return;
    }

    const swing = cross >= 0 ? 1 : -1;

    if (!wall.openings) wall.openings = [];
    wall.openings.push({
      offset: doorPendingOpening.offset,
      width: doorPendingOpening.width,
      swing: swing,
    });

    const placedWidth = doorPendingOpening.width;

    doorPendingOpening = null;
    doorWallId = null;
    doorFirstT = null;
    redrawAll();

    if (cb.onDoorMarked) cb.onDoorMarked(getMarkedDoorCount(), placedWidth);
    return;
  }

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

  // Hold the opening until a third click picks the swing side.
  doorPendingOpening = {
    offset: parseFloat(offset.toFixed(3)),
    width: parseFloat(width.toFixed(3)),
  };

  redrawAll();
  if (cb.onDoorNeedsSide) cb.onDoorNeedsSide(width);
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
  if (doorPendingOpening) {
    doorPendingOpening = null;
    redrawAll();
    return;
  }
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
    handleCalibrationClick(pixelX, pixelY, cb.onCalibrationNeeded, bypassSnapping === true);
    return;
  }

  if (mode === 'refpoint') {
    if (pixelsPerMeter === null) return;
    handleRefPointClick(pixelX, pixelY, cb);
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

/**
 * Freezes the storey being traced into plain metre coordinates.
 */
function snapshotCurrentStorey() {
  const walls = networkWalls.map(function (w) {
    const a = getPoint(w.pointA);
    const b = getPoint(w.pointB);

    const wallData = {
      id: w.id,
      start: { x: a.meterX, z: a.meterZ },
      end: { x: b.meterX, z: b.meterZ },
    };

    const ops = w.openings || [];
    if (ops.length > 0) {
      wallData.openings = ops.map(function (o) {
        return { offset: o.offset, width: o.width, swing: o.swing || 1 };
      });
    }

    const wins = w.windows || [];
    if (wins.length > 0) {
      wallData.windows = wins.map(function (n) {
        return {
          offset: n.offset,
          width: n.width,
          sillHeight: n.sillHeight,
          headHeight: n.headHeight,
          interiorSide: n.interiorSide,
        };
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
        return { x: p.meterX, z: p.meterZ };
      }),
    };
  });

  // With no reference clicked, the first point traced serves as one.
  // That way the ground floor needs nothing from the user.
  let ref = storeyRefPoint;
  if (!ref && networkPoints.length > 0) {
    ref = { meterX: networkPoints[0].meterX, meterZ: networkPoints[0].meterZ };
  }

  return { walls: walls, rooms: rooms, ref: ref };
}

export function hasCurrentStoreyWork() {
  return networkWalls.length > 0 || completedRooms.length > 0;
}

export function getStoreyCount() {
  return completedStoreys.length + (hasCurrentStoreyWork() ? 1 : 0);
}

export function isAwaitingRefPoint() {
  return awaitingRefPoint;
}

export function getPreviousRefPoint() {
  return previousRefPoint;
}

export function getStoreyRefPoint() {
  return storeyRefPoint;
}

/**
 * Files the current storey and starts a fresh one on the same image.
 * Calibration carries over — two floors on one sheet share a scale.
 */
export function startNewFloor(label) {
  if (!hasCurrentStoreyWork()) return { success: false, reason: 'nothing_traced' };

  const snap = snapshotCurrentStorey();
  snap.label = label || 'Floor ' + (completedStoreys.length + 1);
  completedStoreys.push(snap);

  networkPoints = [];
  networkWalls = [];
  nextPointId = 1;
  nextWallId = 1;

  currentChainPointId = null;
  wallChainHistory = [];
  previewCursor = null;

  doorWallId = null;
  doorFirstT = null;
  doorPendingOpening = null;

  completedRooms = [];
  currentRoomPointIds = [];

  previousRefPoint = snap.ref || null;
  previousStoreySnapshot = snap;

  storeyRefPoint = null;
  awaitingRefPoint = true;
  mode = 'refpoint';

  redrawAll();
  return { success: true, storeyIndex: completedStoreys.length };
}

function handleRefPointClick(pixelX, pixelY, cb) {
  const converted = pixelToMeter(pixelX, pixelY);
  storeyRefPoint = { meterX: converted.meterX, meterZ: converted.meterZ };

  awaitingRefPoint = false;
  mode = 'idle';
  redrawAll();

  if (cb && cb.onRefPointSet) cb.onRefPointSet();
}

/**
 * Extents of every wall endpoint in a storey snapshot.
 */
function storeyBounds(snap) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const w of snap.walls) {
    for (const p of [w.start, w.end]) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }
  }

  if (!isFinite(minX)) return null;
  return { minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ };
}

export function saveAllRoomsForPreview() {
  localStorage.removeItem('unittwin_trace_preview');

  const snaps = completedStoreys.slice();
  if (hasCurrentStoreyWork()) {
    const cur = snapshotCurrentStorey();
    cur.label = 'Floor ' + (snaps.length + 1);
    snaps.push(cur);
  }

  if (snaps.length === 0) return;

  // The ground floor's reference point is the anchor; every storey
  // above shifts so its own reference lands on the same spot.
  const anchor = snaps[0].ref;
  const groundBounds = storeyBounds(snaps[0]);

  const storeys = snaps.map(function (snap, i) {
    let dx = 0;
    let dz = 0;

    if (anchor && snap.ref) {
      dx = anchor.meterX - snap.ref.meterX;
      dz = anchor.meterZ - snap.ref.meterZ;
    }

    // Stretch this storey so its exterior extents match the ground
    // floor's, then position it to sit exactly on top. A hand-traced
    // upper floor is otherwise a few centimetres out and overhangs.
    let sx = 1;
    let sz = 1;
    let ox = 0;
    let oz = 0;

    if (ALIGN_STOREY_FOOTPRINTS && i > 0 && groundBounds) {
      const b = storeyBounds(snap);

      if (b) {
        const w = b.maxX - b.minX;
        const d = b.maxZ - b.minZ;

        if (w > 0.01) sx = (groundBounds.maxX - groundBounds.minX) / w;
        if (d > 0.01) sz = (groundBounds.maxZ - groundBounds.minZ) / d;

        ox = groundBounds.minX - b.minX * sx;
        oz = groundBounds.minZ - b.minZ * sz;

        // The fit already places it; the reference offset would
        // double up.
        dx = 0;
        dz = 0;
      }
    }

    const fx = function (v) { return v * sx + ox + dx; };
    const fz = function (v) { return v * sz + oz + dz; };

    const r3 = function (v) { return parseFloat(v.toFixed(3)); };

    return {
      id: i === 0 ? 'ground' : 'floor' + i,
      label: i === 0 ? 'Ground Floor' : (snap.label || 'Floor ' + (i + 1)),
      base: r3(i * STOREY_HEIGHT_M),
      height: STOREY_HEIGHT_M,

      walls: snap.walls.map(function (w) {
        const out = {
          id: w.id,
          start: { x: r3(fx(w.start.x)), z: r3(fz(w.start.z)) },
          end: { x: r3(fx(w.end.x)), z: r3(fz(w.end.z)) },
        };
        if (w.openings) out.openings = w.openings;
        if (w.windows) out.windows = w.windows;
        return out;
      }),

      rooms: snap.rooms.map(function (room) {
        return {
          id: room.id,
          label: room.label,
          wallIds: room.wallIds,
          corners: room.corners.map(function (c) {
            return { x: r3(fx(c.x)), z: r3(fz(c.z)) };
          }),
        };
      }),
    };
  });

  localStorage.setItem('unittwin_trace_preview', JSON.stringify({ storeys: storeys }));
}

// ==================================================
// Full reset
// ==================================================

export function startOver() {
  completedStoreys = [];
  storeyRefPoint = null;
  awaitingRefPoint = false;
  previousRefPoint = null;
  previousStoreySnapshot = null;

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
  doorPendingOpening = null;

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