import {
  initCanvas,
  loadImageFile,
  getCanvas,
  onCanvasClick,
  setCalibrationDistance,
  getCorners,
  drawWallLengthOverlay,
  startRecalibration,
} from './traceCanvas.js';


// --------------------------------------------------
// Initialize
// --------------------------------------------------

initCanvas();


// --------------------------------------------------
// DOM elements
// --------------------------------------------------

const imageInput =
  document.getElementById('image-input');

const status =
  document.getElementById('status');

const finishRoomBtn =
  document.getElementById('finish-room-btn');

const recalibrateBtn =
  document.getElementById('recalibrate-btn');


// --------------------------------------------------
// Numeric distance input
// --------------------------------------------------

function askForDistance() {

  while (true) {

    const input =
      prompt(
        'Enter the real-world distance between those two points in meters (e.g. 3.5):'
      );


    // User pressed Cancel
    if (input === null) {
      return null;
    }


    const value =
      input.trim();


    // Only allow:
    // 3
    // 3.5
    // 3.50
    // 10
    // 10.25
    //
    // NOT:
    // 3ز5
    // 3,5
    // abc
    // 3m

    const validNumber =
      /^\d+(?:\.\d+)?$/.test(value);


    if (!validNumber) {

      alert(
        'Invalid number.\n\nPlease enter numbers only, using a dot for decimals.\nExample: 3.5'
      );

      continue;
    }


    const parsed =
      Number(value);


    if (
      !Number.isFinite(parsed) ||
      parsed <= 0
    ) {

      alert(
        'Distance must be greater than 0.'
      );

      continue;
    }


    return parsed;
  }
}


// --------------------------------------------------
// Image loading
// --------------------------------------------------

imageInput.addEventListener(
  'change',
  (event) => {

    const file =
      event.target.files[0];

    if (!file) {
      return;
    }

    status.textContent =
      'Loading image...';

    loadImageFile(
      file,
      () => {

        status.textContent =
          'Click two points a known distance apart to calibrate (e.g. both ends of a labeled wall).';
      }
    );
  }
);


// --------------------------------------------------
// Canvas click handling
// --------------------------------------------------

const canvas =
  getCanvas();

canvas.addEventListener(
  'click',
  (event) => {

    const rect =
      canvas.getBoundingClientRect();

    const pixelX =
      event.clientX - rect.left;

    const pixelY =
      event.clientY - rect.top;


    onCanvasClick(

      pixelX,

      pixelY,


      // ------------------------------------------
      // Calibration callback
      // ------------------------------------------

      (calibrationPoints) => {

        const parsed =
          askForDistance();


        // User cancelled
        if (parsed === null) {

          status.textContent =
            'Calibration cancelled. Click two points again.';

          return;
        }


        const success =
          setCalibrationDistance(
            parsed
          );


        if (!success) {

          status.textContent =
            'Calibration failed. Please try again.';

          return;
        }


        status.textContent =
          'Calibrated. Now click room corners in order.';
      },


      // ------------------------------------------
      // Corner callback
      // ------------------------------------------

      (corners) => {

        status.textContent =
          `${corners.length} corner(s) placed.`;
      }
    );
  }
);


// --------------------------------------------------
// Finish Room
// --------------------------------------------------

finishRoomBtn.addEventListener(
  'click',
  () => {

    const corners =
      getCorners();


    if (corners.length < 2) {

      alert(
        'You need at least 2 corners before finishing the room.'
      );

      return;
    }


    // Draw:
    // - red corners
    // - blue wall lines
    // - computed wall lengths

    drawWallLengthOverlay();


    status.textContent =
      "Compare the blue labels against the image's printed dimensions. Click Recalibrate to start over, or continue tracing if everything looks right.";
  }
);


// --------------------------------------------------
// Recalibrate / Start Over
// --------------------------------------------------

recalibrateBtn.addEventListener(
  'click',
  () => {

    // Completely delete the current trace.
    //
    // This removes:
    // - green calibration points
    // - red corners
    // - blue wall lines
    // - wall labels
    // - old calibration
    // - old corner data

    startRecalibration();


    status.textContent =
      'Trace cleared. Click two points a known distance apart to start a new calibration.';
  }
);