import {
  initCanvas,
  loadImageFile,
  getCanvas,
  onCanvasClick,
  setCalibrationDistance,
  isCalibrated,
  getCorners,
  getCompletedRoomCount,
  drawWallLengthOverlay,
  commitCurrentRoom,
  saveAllRoomsForPreview,
  startRecalibration,
  resetCurrentRoomCorners,
  redrawImage,
  startTracing,
  stopTracing,
} from './traceCanvas.js';


// --------------------------------------------------
// Initialize
// --------------------------------------------------

initCanvas();


// --------------------------------------------------
// DOM elements
// --------------------------------------------------

const imageInput =
  document.getElementById(
    'image-input'
  );

const status =
  document.getElementById(
    'status'
  );

const addRoomBtn =
  document.getElementById(
    'add-room-btn'
  );

const finishRoomBtn =
  document.getElementById(
    'finish-room-btn'
  );

const cancelVerifyBtn =
  document.getElementById(
    'cancel-verify-btn'
  );

const recalibrateBtn =
  document.getElementById(
    'recalibrate-btn'
  );

const preview3dBtn =
  document.getElementById(
    'preview-3d-btn'
  );


// --------------------------------------------------
// Numeric distance input
// --------------------------------------------------

function askForDistance() {

  while (true) {

    const input =
      prompt(
        'Enter the real-world distance between those two points in meters (e.g. 3.5):'
      );


    // User cancelled
    if (input === null) {
      return null;
    }


    const value =
      input.trim();


    // Only allow numbers like:
    //
    // 3
    // 3.5
    // 3.50
    // 10
    // 10.25

    const validNumber =
      /^\d+(?:\.\d+)?$/.test(
        value
      );


    if (!validNumber) {

      alert(
        'Invalid number.\n\n' +
        'Please enter numbers only, using a dot for decimals.\n' +
        'Example: 3.5'
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

        // ------------------------------------------
        // Image loaded successfully.
        //
        // Tracing MUST remain inactive until the
        // user explicitly presses "Add Room".
        // ------------------------------------------

        status.textContent =
          'Image loaded. Click "Add Room" to begin.';

        addRoomBtn.textContent =
          'Add Room';

        stopTracing();

        resetVerificationState();
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
      event.clientX -
      rect.left;


    const pixelY =
      event.clientY -
      rect.top;


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
          'Calibrated. Click room corners in order.';
      },


      // ------------------------------------------
      // Corner callback
      // ------------------------------------------

      (corners) => {

        status.textContent =
          `${corners.length} corner(s) placed.`;
      },


      // ------------------------------------------
      // Suspicious corner order callback
      // ------------------------------------------

      (angleDeg) => {

        return confirm(
          `This corner doesn't line up horizontally or vertically with the previous one ` +
          `(off by about ${angleDeg.toFixed(0)}°).\n\n` +
          `Real room corners are usually connected by straight horizontal or vertical walls.\n\n` +
          `Click OK to place it anyway, or Cancel to undo this click.`
        );
      }
    );
  }
);


// --------------------------------------------------
// Room verification state
// --------------------------------------------------

let pendingVerification = false;


function resetVerificationState() {

  pendingVerification =
    false;


  finishRoomBtn.textContent =
    'Finish This Room';


  cancelVerifyBtn.style.display =
    'none';
}


// --------------------------------------------------
// Add Room / Add Another Room
// --------------------------------------------------

addRoomBtn.addEventListener(
  'click',
  () => {

    // --------------------------------------------
    // Every click means:
    //
    // "Start a completely fresh room."
    //
    // Previous rooms remain safely stored in
    // completedRooms.
    // --------------------------------------------

    resetCurrentRoomCorners();

    redrawImage();

    resetVerificationState();


    // --------------------------------------------
    // IMPORTANT:
    //
    // This is the gate that activates canvas
    // interaction.
    // --------------------------------------------

    startTracing();


    // --------------------------------------------
    // Calibration is shared across all rooms
    // --------------------------------------------

    if (isCalibrated()) {

      status.textContent =
        'New room started. Click room corners in order.';

    } else {

      status.textContent =
        'Click two points a known distance apart to calibrate (e.g. both ends of a labeled wall).';
    }


    // --------------------------------------------
    // Keep button text consistent
    // --------------------------------------------

    addRoomBtn.textContent =
      getCompletedRoomCount() > 0
        ? 'Add Another Room'
        : 'Add Room';
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


    // --------------------------------------------
    // Need at least 3 corners
    // --------------------------------------------

    if (corners.length < 3) {

      alert(
        'You need at least 3 corners before finishing this room.'
      );

      return;
    }


    // --------------------------------------------
    // Stage 1:
    // Show wall length verification overlay
    // --------------------------------------------

    if (!pendingVerification) {

      drawWallLengthOverlay();


      status.textContent =
        "Compare the blue labels against the image's printed dimensions. Click \"Confirm & Save Room\" to save, or Cancel to keep editing corners.";


      finishRoomBtn.textContent =
        'Confirm & Save Room';


      cancelVerifyBtn.style.display =
        'inline-block';


      pendingVerification =
        true;


      return;
    }


    // --------------------------------------------
    // Stage 2:
    // Ask for room ID
    // --------------------------------------------

    const roomId =
      prompt(
        'Enter a room ID (e.g. "bedroom"):'
      );


    if (
      !roomId ||
      !roomId.trim()
    ) {

      status.textContent =
        'Room not saved — enter an ID to confirm.';

      return;
    }


    // --------------------------------------------
    // Ask for display label
    // --------------------------------------------

    const roomLabel =
      prompt(
        'Enter a display label (e.g. "Bedroom"):'
      );


    if (
      !roomLabel ||
      !roomLabel.trim()
    ) {

      status.textContent =
        'Room not saved — enter a display label to confirm.';

      return;
    }


    // --------------------------------------------
    // Commit room
    // --------------------------------------------

    const result =
      commitCurrentRoom(
        roomId.trim(),
        roomLabel.trim()
      );


    // --------------------------------------------
    // Commit failed
    // --------------------------------------------

    if (!result.success) {

      if (
        result.reason === 'duplicate_id'
      ) {

        alert(
          `Room ID "${roomId.trim()}" is already used. Please choose a different, unique ID.`
        );

      } else {

        alert(
          'You need at least 3 corners before finishing this room.'
        );
      }


      status.textContent =
        'Room not saved.';


      resetVerificationState();

      return;
    }


    // --------------------------------------------
    // Successfully committed room
    //
    // IMPORTANT:
    // Stop accepting canvas clicks until the
    // user explicitly presses "Add Another Room".
    // --------------------------------------------

    resetVerificationState();

    stopTracing();


    addRoomBtn.textContent =
      'Add Another Room';


    status.textContent =
      `${getCompletedRoomCount()} room(s) traced. Click "Add Another Room" to continue, or "Preview in 3D" when done.`;
  }
);


// --------------------------------------------------
// Cancel Room Verification
// --------------------------------------------------

cancelVerifyBtn.addEventListener(
  'click',
  () => {

    resetVerificationState();


    // --------------------------------------------
    // Remove blue measurement overlay and return
    // to normal corner-editing view.
    // --------------------------------------------

    redrawImage();


    const corners =
      getCorners();


    // --------------------------------------------
    // Tracing remains active here.
    //
    // User is still editing the current room,
    // so they can continue clicking corners.
    // --------------------------------------------

    status.textContent =
      `Back to editing. ${corners.length} corner(s) placed — click more, or Finish This Room again when ready.`;
  }
);


// --------------------------------------------------
// Preview in 3D
// --------------------------------------------------

preview3dBtn.addEventListener(
  'click',
  () => {

    // --------------------------------------------
    // Need at least one completed room
    // --------------------------------------------

    if (
      getCompletedRoomCount() === 0
    ) {

      alert(
        'Finish at least one room before previewing.'
      );

      return;
    }


    // --------------------------------------------
    // Stop tracing before leaving for 3D
    // --------------------------------------------

    stopTracing();


    // --------------------------------------------
    // Save ALL completed rooms
    // --------------------------------------------

    saveAllRoomsForPreview();


    // --------------------------------------------
    // Open 3D viewer
    // --------------------------------------------

    window.open(
      '/index.html',
      '_blank'
    );
  }
);


// --------------------------------------------------
// Recalibrate / Start Over
// --------------------------------------------------

recalibrateBtn.addEventListener(
  'click',
  () => {

    // --------------------------------------------
    // This is a COMPLETE reset:
    //
    // - calibration
    // - current room
    // - completed rooms
    // - visual overlays
    // - tracing state
    // --------------------------------------------

    startRecalibration();

    resetVerificationState();

    stopTracing();


    addRoomBtn.textContent =
      'Add Room';


    status.textContent =
      'Trace cleared. Click "Add Room" to start a new calibration.';
  }
);