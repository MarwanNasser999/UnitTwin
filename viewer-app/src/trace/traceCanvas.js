let canvas = null;
let ctx = null;
let loadedImage = null;

let calibrationPoints = [];
let pixelsPerMeter = null;
let corners = [];

// --------------------------------------------------
// Door state
// --------------------------------------------------

let doorMode = false;
let selectedWallIndex = null;
let doorClickPoints = [];
let roomDoors = [];

// --------------------------------------------------
// Completed rooms
// --------------------------------------------------

// {
//   walls: [...],
//   room: {...},
//   rawCorners: [...]
// }

let completedRooms = [];

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
// Door mode state
// --------------------------------------------------

export function enterDoorMode() {
  doorMode = true;
  selectedWallIndex = null;
  doorClickPoints = [];
}

export function exitDoorMode() {
  doorMode = false;
  selectedWallIndex = null;
  doorClickPoints = [];
}

export function isDoorMode() {
  return doorMode;
}


// --------------------------------------------------
// Clear current room doors
// --------------------------------------------------

export function clearRoomDoors() {
  roomDoors = [];

  selectedWallIndex = null;
  doorClickPoints = [];
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
      roomDoors = [];
      completedRooms = [];

      tracingActive = false;

      // Reset door state
      doorMode = false;
      selectedWallIndex = null;
      doorClickPoints = [];

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
// Find closest wall and project click onto wall
// --------------------------------------------------

function findClosestWallAndProjection(
  pixelX,
  pixelY
) {
  let closestWallIndex = -1;
  let closestDist = Infinity;
  let closestProjection = null;

  for (
    let i = 0;
    i < corners.length;
    i++
  ) {
    const a = corners[i];

    const b =
      corners[
        (i + 1) % corners.length
      ];

    const dx =
      b.pixelX - a.pixelX;

    const dy =
      b.pixelY - a.pixelY;

    const lengthSq =
      dx * dx +
      dy * dy;

    // Avoid division by zero
    if (lengthSq === 0) {
      continue;
    }

    // How far along the wall the closest
    // projected point is.
    let t =
      (
        (pixelX - a.pixelX) * dx +
        (pixelY - a.pixelY) * dy
      ) / lengthSq;

    // Clamp projection to the actual wall segment
    t = Math.max(
      0,
      Math.min(1, t)
    );

    const projX =
      a.pixelX + t * dx;

    const projY =
      a.pixelY + t * dy;

    const dist =
      Math.hypot(
        pixelX - projX,
        pixelY - projY
      );

    if (dist < closestDist) {
      closestDist = dist;
      closestWallIndex = i;

      closestProjection = {
        pixelX: projX,
        pixelY: projY,
        t,
      };
    }
  }

  return {
    wallIndex: closestWallIndex,
    projection: closestProjection,
    distance: closestDist,
  };
}


// --------------------------------------------------
// Door mode click handling
// --------------------------------------------------

export function onDoorModeClick(
  pixelX,
  pixelY,
  onDoorPlaced
) {
  const {
    wallIndex,
    projection,
    distance,
  } = findClosestWallAndProjection(
    pixelX,
    pixelY
  );

  // How close the user needs to click
  // to a wall.
  const CLICK_TOLERANCE_PX = 25;

  // Click too far away from every wall
  if (
    wallIndex === -1 ||
    !projection ||
    distance > CLICK_TOLERANCE_PX
  ) {
    return;
  }

  // First click selects the wall
  if (selectedWallIndex === null) {
    selectedWallIndex = wallIndex;
    doorClickPoints = [];
  }

  // Do not allow changing walls
  // while placing the same door.
  else if (
    wallIndex !== selectedWallIndex
  ) {
    return;
  }

  // Store projected point
  doorClickPoints.push(projection);

  // Draw yellow door marker
  drawMarker(
    projection.pixelX,
    projection.pixelY,
    '#ffdd00'
  );

  // Two points = complete door opening
  if (doorClickPoints.length === 2) {

    const a =
      corners[selectedWallIndex];

    const b =
      corners[
        (selectedWallIndex + 1) %
        corners.length
      ];

    // Actual wall length in meters
    const wallLengthMeters =
      Math.hypot(
        b.meterX - a.meterX,
        b.meterZ - a.meterZ
      );

    const t1 =
      doorClickPoints[0].t;

    const t2 =
      doorClickPoints[1].t;

    // Door can be clicked in either direction.
    // Always store the smaller t as the offset.
    const offsetT =
      Math.min(
        t1,
        t2
      );

    const widthT =
      Math.abs(
        t2 - t1
      );

    const door = {
      wallIndex: selectedWallIndex,

      offset: parseFloat(
        (
          offsetT *
          wallLengthMeters
        ).toFixed(3)
      ),

      width: parseFloat(
        (
          widthT *
          wallLengthMeters
        ).toFixed(3)
      ),
    };

    roomDoors.push(door);

    // Reset selection so another door
    // can be placed on any wall.
    selectedWallIndex = null;
    doorClickPoints = [];

    if (onDoorPlaced) {
      onDoorPlaced(roomDoors);
    }
  }
}


// --------------------------------------------------
// Get current room doors
// --------------------------------------------------

export function getRoomDoors() {
  return roomDoors;
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
  // Door mode
  // ----------------------------------------------

  if (doorMode) {
    onDoorModeClick(
      pixelX,
      pixelY,
      null
    );

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

  if (corners.length >= 1) {

    const prev =
      corners[
        corners.length - 1
      ];

    const dx =
      meterX - prev.meterX;

    const dz =
      meterZ - prev.meterZ;

    // Ignore a click directly on the previous
    // corner to avoid an unnecessary warning.
    if (
      dx !== 0 ||
      dz !== 0
    ) {

      // Angle relative to horizontal/vertical axis
      const angleDeg =
        Math.abs(
          Math.atan2(
            dz,
            dx
          ) *
          (180 / Math.PI)
        ) % 90;

      const DIAGONAL_TOLERANCE = 20;

      if (
        angleDeg >
          DIAGONAL_TOLERANCE &&
        angleDeg <
          (90 - DIAGONAL_TOLERANCE) &&
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

  // Debug information for scale diagnosis
  console.log(
    '[TRACE] Calibration completed:',
    {
      point1: a,
      point2: b,
      pixelDistance: pixelDist,
      realDistanceMeters: realMeters,
      pixelsPerMeter,
    }
  );

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
        (i + 1) %
        cornerList.length
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


    // --------------------------------------------
    // Find door openings belonging to this wall
    // --------------------------------------------

    const wallOpenings =
      roomDoors
        .filter(
          (door) =>
            door.wallIndex === i
        )
        .map(
          (door) => ({
            offset: door.offset,
            width: door.width,
          })
        );


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

      // Only add openings when
      // this wall actually has doors.
      ...(wallOpenings.length > 0
        ? {
            openings:
              wallOpenings,
          }
        : {}),
    });
  }


  const roomEntry = {

    id:
      roomId,

    label:
      roomLabel,

    wallIds:
      wallEntries.map(
        (w) =>
          w.id
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
// Debug trace information
// --------------------------------------------------

function logCurrentRoomGeometry() {

  console.group(
    '[TRACE DEBUG] Current Room Geometry'
  );

  console.log(
    'Calibration points:',
    calibrationPoints
  );

  console.log(
    'Pixels per meter:',
    pixelsPerMeter
  );

  console.log(
    'Number of corners:',
    corners.length
  );

  console.log(
    'Corners:',
    JSON.parse(
      JSON.stringify(corners)
    )
  );

  if (corners.length >= 2) {

    const wallLengths =
      [];

    for (
      let i = 0;
      i < corners.length;
      i++
    ) {

      const a =
        corners[i];

      const b =
        corners[
          (i + 1) %
          corners.length
        ];

      const length =
        Math.hypot(
          b.meterX - a.meterX,
          b.meterZ - a.meterZ
        );

      wallLengths.push({
        wallIndex: i,
        from: i,
        to:
          (i + 1) %
          corners.length,
        lengthMeters:
          length,
      });
    }

    console.log(
      'Wall lengths:',
      wallLengths
    );
  }

  console.log(
    'Room doors:',
    JSON.parse(
      JSON.stringify(roomDoors)
    )
  );

  console.groupEnd();
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
      reason:
        'not_enough_corners',
    };
  }


  // ----------------------------------------------
  // DEBUG:
  // Log the geometry BEFORE it is cleared.
  // ----------------------------------------------

  logCurrentRoomGeometry();


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
      reason:
        'duplicate_id',
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
  roomDoors = [];

  // Reset door state
  doorMode = false;
  selectedWallIndex = null;
  doorClickPoints = [];


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
  roomDoors = [];

  // Reset door state
  doorMode = false;
  selectedWallIndex = null;
  doorClickPoints = [];

  // IMPORTANT:
  //
  // If calibration has NOT been completed,
  // clear any partial calibration clicks too.
  //
  // This prevents a leftover first calibration
  // point from contaminating the next attempt.
  //
  // If calibration was already completed,
  // preserve it so it can be reused for another room.

  if (pixelsPerMeter === null) {
    calibrationPoints = [];
  }

  redrawImage();
}


// --------------------------------------------------
// Save all rooms for 3D preview
// --------------------------------------------------

export function saveAllRoomsForPreview() {

  const allWalls =
    completedRooms.flatMap(
      (room) =>
        room.walls
    );

  const allRooms =
    completedRooms.map(
      (room) =>
        room.room
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

  roomDoors = [];

  completedRooms = [];

  tracingActive = false;

  // Reset door state
  doorMode = false;
  selectedWallIndex = null;
  doorClickPoints = [];

  redrawImage();
}


// --------------------------------------------------
// Full trace reset
// --------------------------------------------------

export function resetTrace() {
  startRecalibration();
}