// Handles loading an image file and drawing it onto the canvas.
// Plain 2D Canvas drawing — separate system from Three.js's 3D scene.

let canvas = null;
let ctx = null;
let loadedImage = null;

// --------------------------------------------------
// Trace state
// --------------------------------------------------

let calibrationPoints = [];
let pixelsPerMeter = null;
let corners = [];


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

      // Draw clean image
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

      // New image = completely new trace
      calibrationPoints = [];
      pixelsPerMeter = null;
      corners = [];

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
    console.error('Failed to read image file.');
  };

  reader.readAsDataURL(file);
}


// --------------------------------------------------
// Getters
// --------------------------------------------------

export function getCanvas() {
  return canvas;
}

export function getContext() {
  return ctx;
}


// --------------------------------------------------
// Redraw clean image
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
// Canvas click handling
// --------------------------------------------------

export function onCanvasClick(
  pixelX,
  pixelY,
  onCalibrationNeeded,
  onCornerAdded
) {

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

    if (calibrationPoints.length === 2) {
      if (onCalibrationNeeded) {
        onCalibrationNeeded(
          calibrationPoints
        );
      }
    }

    return;
  }


  // ----------------------------------------------
  // Waiting for calibration distance
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

  if (!Number.isFinite(realMeters) || realMeters <= 0) {
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

  ctx.lineWidth = 1;

  ctx.stroke();
}


// --------------------------------------------------
// Get corners
// --------------------------------------------------

export function getCorners() {
  return corners;
}


// --------------------------------------------------
// Calculate wall lengths
// --------------------------------------------------

export function getComputedWallLengths() {
  const lengths = [];

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

    const dist =
      Math.hypot(
        b.meterX - a.meterX,
        b.meterZ - a.meterZ
      );

    lengths.push({
      from: i,
      to: (i + 1) % corners.length,
      meters: dist.toFixed(2),
    });
  }

  return lengths;
}


// --------------------------------------------------
// Draw wall length overlay
// --------------------------------------------------

export function drawWallLengthOverlay() {

  // Start from a completely clean image.
  redrawImage();


  // ----------------------------------------------
  // Redraw corner markers
  // ----------------------------------------------

  for (const c of corners) {

    drawMarker(
      c.pixelX,
      c.pixelY,
      '#ff4444'
    );
  }


  // ----------------------------------------------
  // Draw walls
  // ----------------------------------------------

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

    ctx.lineWidth = 3;

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

    ctx.lineWidth = 3;

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
// FULL RESET / START OVER
// --------------------------------------------------

export function startRecalibration() {

  // Clear calibration points
  calibrationPoints = [];

  // Remove the current scale
  pixelsPerMeter = null;

  // IMPORTANT:
  // Delete ALL existing corners.
  // This means the previous room/trace is completely
  // discarded and we start V1 again from zero.
  corners = [];

  // Remove all visual overlays:
  // - green calibration points
  // - red corner points
  // - blue wall lines
  // - wall-length labels
  //
  // Only the original image remains.
  redrawImage();
}


// --------------------------------------------------
// Full trace reset
// --------------------------------------------------

export function resetTrace() {
  startRecalibration();
}