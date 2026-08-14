let canvas = null;
let ctx = null;
let loadedImage = null;

let calibrationPoints = [];
let pixelsPerMeter = null;
let corners = [];

let completedRooms = []; 
// {
//   walls: [...],
//   room: {...},
//   rawCorners: [...]
// }

let tracingActive = false;


// --------------------------------------------------
// Canvas initialization
// --------------------------------------------------

export function initCanvas() {
  canvas = document.getElementById('trace-canvas');

  if (!canvas) {
    console.error('Canvas #trace-canvas was not found.');
    return;
  }

  ctx = canvas.getContext('2d');
}


// --------------------------------------------------
// Tracing state
// --------------------------------------------------

export function startTracing() {
  tracingActive = true;
}

export function isTracingActive() {
  return tracingActive;
}

export function stopTracing() {
  tracingActive = false;
}


// --------------------------------------------------
// Image loading
// --------------------------------------------------

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

      ctx.drawImage(
        img,
        0,
        0
      );

      // New image = completely new tracing session
      calibrationPoints = [];
      pixelsPerMeter = null;
      corners = [];
      completedRooms = [];
      tracingActive = false;

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


// --------------------------------------------------
// Get canvas
// --------------------------------------------------

export function getCanvas() {
  return canvas;
}


// --------------------------------------------------
// Check calibration
// --------------------------------------------------

export function isCalibrated() {
  return pixelsPerMeter !== null;
}


// --------------------------------------------------
// Redraw original image only
// --------------------------------------------------

export function redrawImage() {
  if (!loadedImage) {
    return;
  }

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


// --------------------------------------------------
// Redraw current room only
// --------------------------------------------------

function redrawAllRooms() {

  // IMPORTANT:
  // Do NOT draw completed rooms here.
  // Visually we only show the room currently being traced.

  redrawImage();

  // Draw current room corners only
  for (const c of corners) {
    drawMarker(
      c.pixelX,
      c.pixelY,
      '#ff4444'
    );
  }
}


// --------------------------------------------------
// Canvas click handling
// --------------------------------------------------

export function onCanvasClick(
  pixelX,
  pixelY,
  onCalibrationNeeded,
  onCornerAdded,
  onSuspiciousOrder
) {

  // ----------------------------------------------
  // IMPORTANT:
  // Ignore ALL canvas clicks until the user
  // explicitly presses "Add Room".
  // ----------------------------------------------

  if (!tracingActive) {
    return;
  }


  // ----------------------------------------------
  // Calibration phase
  // ----------------------------------------------

  if (calibrationPoints.length < 2) {

    calibrationPoints.push({
      x: pixelX,
      y: pixelY,
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

    return;
  }


  // ----------------------------------------------
  // Waiting for calibration
  // ----------------------------------------------

  if (pixelsPerMeter === null) {
    return;
  }


  // ----------------------------------------------
  // Corner tracing phase
  // ----------------------------------------------

  const origin =
    calibrationPoints[0];

  const meterX =
    (pixelX - origin.x) /
    pixelsPerMeter;

  const meterZ =
    (pixelY - origin.y) /
    pixelsPerMeter;


  // ----------------------------------------------
  // Check direction / angle constraint
  // ----------------------------------------------
  //
  // The next corner should normally connect to
  // the previous corner through a horizontal or
  // vertical wall.
  //
  // A clearly diagonal connection may indicate
  // that the user clicked the corners out of order.
  //
  // This is only a warning. The user can still
  // choose to continue.

  if (corners.length >= 1) {

    const prev =
      corners[corners.length - 1];

    const dx =
      meterX - prev.meterX;

    const dz =
      meterZ - prev.meterZ;


    // Ignore a click directly on the previous
    // corner to avoid an unnecessary warning.
    if (dx !== 0 || dz !== 0) {

      // Angle relative to horizontal/vertical axis
      const angleDeg =
        Math.abs(
          Math.atan2(
            dz,
            dx
          ) *
          (180 / Math.PI)
        ) % 90;


      // angleDeg close to 0:
      // horizontal / vertical
      //
      // angleDeg close to 45:
      // diagonal

      const DIAGONAL_TOLERANCE = 20;


      if (
        angleDeg > DIAGONAL_TOLERANCE &&
        angleDeg < (90 - DIAGONAL_TOLERANCE) &&
        onSuspiciousOrder
      ) {

        const proceed =
          onSuspiciousOrder(
            angleDeg
          );


        // User chose Cancel.
        // Do not add this corner.
        if (!proceed) {
          return;
        }
      }
    }
  }


  // ----------------------------------------------
  // Add corner
  // ----------------------------------------------

  corners.push({
    pixelX,
    pixelY,
    meterX,
    meterZ,
  });


  drawMarker(
    pixelX,
    pixelY,
    '#ff4444'
  );


  if (onCornerAdded) {
    onCornerAdded(corners);
  }
}


// --------------------------------------------------
// Set calibration distance
// --------------------------------------------------

export function setCalibrationDistance(realMeters) {

  if (calibrationPoints.length !== 2) {
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

  const pixelDist =
    Math.hypot(
      b.x - a.x,
      b.y - a.y
    );

  if (pixelDist === 0) {
    return false;
  }

  pixelsPerMeter =
    pixelDist / realMeters;

  return true;
}


// --------------------------------------------------
// Draw marker
// --------------------------------------------------

function drawMarker(
  x,
  y,
  color
) {

  if (!ctx) {
    return;
  }

  ctx.beginPath();

  ctx.arc(
    x,
    y,
    6,
    0,
    Math.PI * 2
  );

  ctx.fillStyle =
    color;

  ctx.fill();

  ctx.strokeStyle =
    '#000';

  ctx.lineWidth =
    1;

  ctx.stroke();
}


// --------------------------------------------------
// Draw room overlay
// --------------------------------------------------

function drawRoomOverlay(
  cornerList,
  color
) {

  // Draw corners
  for (const c of cornerList) {

    drawMarker(
      c.pixelX,
      c.pixelY,
      color
    );
  }


  // Draw walls
  for (
    let i = 0;
    i < cornerList.length;
    i++
  ) {

    const a =
      cornerList[i];

    const b =
      cornerList[
        (i + 1) % cornerList.length
      ];


    ctx.beginPath();

    ctx.moveTo(
      a.pixelX,
      a.pixelY
    );

    ctx.lineTo(
      b.pixelX,
      b.pixelY
    );

    ctx.strokeStyle =
      color;

    ctx.lineWidth =
      2;

    ctx.stroke();
  }
}


// --------------------------------------------------
// Get current corners
// --------------------------------------------------

export function getCorners() {
  return corners;
}


// --------------------------------------------------
// Get completed room count
// --------------------------------------------------

export function getCompletedRoomCount() {
  return completedRooms.length;
}


// --------------------------------------------------
// Generate room data
// --------------------------------------------------

function generateRoomDataInternal(
  roomId,
  roomLabel
) {

  const wallEntries = [];

  for (
    let i = 0;
    i < corners.length;
    i++
  ) {

    const a =
      corners[i];

    const b =
      corners[
        (i + 1) % corners.length
      ];


    wallEntries.push({

      id:
        `wall_${roomId}_${i}`,

      start: {

        x:
          parseFloat(
            a.meterX.toFixed(3)
          ),

        z:
          parseFloat(
            a.meterZ.toFixed(3)
          ),
      },

      end: {

        x:
          parseFloat(
            b.meterX.toFixed(3)
          ),

        z:
          parseFloat(
            b.meterZ.toFixed(3)
          ),
      },
    });
  }


  const roomEntry = {

    id:
      roomId,

    label:
      roomLabel,

    wallIds:
      wallEntries.map(
        (w) => w.id
      ),

    corners:
      corners.map(
        (c) => ({
          x:
            parseFloat(
              c.meterX.toFixed(3)
            ),

          z:
            parseFloat(
              c.meterZ.toFixed(3)
            ),
        })
      ),
  };


  return {
    walls:
      wallEntries,

    room:
      roomEntry,
  };
}


// --------------------------------------------------
// Draw wall length overlay
// --------------------------------------------------

export function drawWallLengthOverlay() {

  // Start from clean image
  redrawAllRooms();


  // Draw current room walls
  for (
    let i = 0;
    i < corners.length;
    i++
  ) {

    const a =
      corners[i];

    const b =
      corners[
        (i + 1) % corners.length
      ];


    // --------------------------------------------
    // Wall line
    // --------------------------------------------

    ctx.beginPath();

    ctx.moveTo(
      a.pixelX,
      a.pixelY
    );

    ctx.lineTo(
      b.pixelX,
      b.pixelY
    );

    ctx.strokeStyle =
      '#00aaff';

    ctx.lineWidth =
      3;

    ctx.stroke();


    // --------------------------------------------
    // Wall length
    // --------------------------------------------

    const dist =
      Math.hypot(
        b.meterX - a.meterX,
        b.meterZ - a.meterZ
      );


    // --------------------------------------------
    // Midpoint
    // --------------------------------------------

    const midX =
      (a.pixelX + b.pixelX) / 2;

    const midY =
      (a.pixelY + b.pixelY) / 2;


    // --------------------------------------------
    // Label
    // --------------------------------------------

    const label =
      `${dist.toFixed(2)}m`;

    ctx.font =
      'bold 16px sans-serif';

    ctx.fillStyle =
      '#00aaff';

    ctx.strokeStyle =
      '#000';

    ctx.lineWidth =
      3;

    ctx.strokeText(
      label,
      midX + 6,
      midY - 6
    );

    ctx.fillText(
      label,
      midX + 6,
      midY - 6
    );
  }
}


// --------------------------------------------------
// Commit current room
// --------------------------------------------------

export function commitCurrentRoom(
  roomId,
  roomLabel
) {

  if (corners.length < 3) {

    return {
      success: false,
      reason: 'not_enough_corners',
    };
  }


  // ----------------------------------------------
  // Prevent duplicate room IDs
  // ----------------------------------------------

  const idTaken =
    completedRooms.some(
      (room) =>
        room.room.id === roomId
    );

  if (idTaken) {

    return {
      success: false,
      reason: 'duplicate_id',
    };
  }


  // ----------------------------------------------
  // Generate room data
  // ----------------------------------------------

  const data =
    generateRoomDataInternal(
      roomId,
      roomLabel
    );


  // ----------------------------------------------
  // Save completed room
  // ----------------------------------------------

  completedRooms.push({

    ...data,

    rawCorners: [
      ...corners
    ],
  });


  // ----------------------------------------------
  // Clear current room
  // ----------------------------------------------

  corners = [];


  // ----------------------------------------------
  // Clean visual state
  // ----------------------------------------------

  redrawAllRooms();


  return {
    success: true,
  };
}


// --------------------------------------------------
// Reset current room corners
// --------------------------------------------------

export function resetCurrentRoomCorners() {

  corners = [];

  redrawImage();
}


// --------------------------------------------------
// Save all rooms for 3D preview
// --------------------------------------------------

export function saveAllRoomsForPreview() {

  const allWalls =
    completedRooms.flatMap(
      (room) => room.walls
    );

  const allRooms =
    completedRooms.map(
      (room) => room.room
    );


  const floorPlanShape = {

    walls:
      allWalls,

    rooms:
      allRooms,
  };


  localStorage.setItem(
    'unittwin_trace_preview',
    JSON.stringify(
      floorPlanShape
    )
  );
}


// --------------------------------------------------
// Full recalibration / complete reset
// --------------------------------------------------

export function startRecalibration() {

  calibrationPoints = [];

  pixelsPerMeter = null;

  corners = [];

  completedRooms = [];

  tracingActive = false;

  redrawImage();
}


// --------------------------------------------------
// Full trace reset
// --------------------------------------------------

export function resetTrace() {

  startRecalibration();
}