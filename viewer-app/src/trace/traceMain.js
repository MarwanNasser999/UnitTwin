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

  enterDoorMode,
  exitDoorMode,
  isDoorMode,
  onDoorModeClick,
  getRoomDoors,
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

const cancelRoomBtn =
  document.getElementById(
    'cancel-room-btn'
  );


// --------------------------------------------------
// Stage state
// --------------------------------------------------
//
// corners -> tracing room corners
// doors   -> marking doors
// verify  -> checking dimensions before saving
//

let stage = 'corners';


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

    // Only allow positive decimal numbers
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
// Reset stage
// --------------------------------------------------

function resetStage() {

  stage = 'corners';

  exitDoorMode();

  finishRoomBtn.textContent =
    'Finish This Room';

  cancelVerifyBtn.style.display =
    'none';
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

        // New image starts completely fresh

        stopTracing();

        resetStage();

        if (cancelRoomBtn) {
          cancelRoomBtn.style.display =
            'none';
        }

        addRoomBtn.textContent =
          'Add Room';

        status.textContent =
          'Image loaded. Click "Add Room" to begin.';
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


    // ----------------------------------------------
    // Door mode
    // ----------------------------------------------

    if (
      stage === 'doors' &&
      isDoorMode()
    ) {

      onDoorModeClick(
        pixelX,
        pixelY,
        (doors) => {

          status.textContent =
            `${doors.length} door(s) marked. Click more walls, or "Done Adding Doors" when finished.`;
        }
      );

      return;
    }


    // ----------------------------------------------
    // Normal corner/calibration mode
    // ----------------------------------------------

    onCanvasClick(

      pixelX,

      pixelY,


      // --------------------------------------------
      // Calibration callback
      // --------------------------------------------

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


      // --------------------------------------------
      // Corner callback
      // --------------------------------------------

      (corners) => {

        status.textContent =
          `${corners.length} corner(s) placed.`;
      },


      // --------------------------------------------
      // Suspicious corner order callback
      // --------------------------------------------

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
// Add Room / Add Another Room
// --------------------------------------------------

addRoomBtn.addEventListener(
  'click',
  () => {

    // --------------------------------------------
    // Start a completely fresh current room
    // --------------------------------------------

    resetCurrentRoomCorners();

    redrawImage();

    resetStage();

    // --------------------------------------------
    // Activate tracing
    // --------------------------------------------

    startTracing();

    // --------------------------------------------
    // Show Cancel Room
    // --------------------------------------------

    if (cancelRoomBtn) {
      cancelRoomBtn.style.display =
        'inline-block';
    }

    // --------------------------------------------
    // Calibration is shared across rooms
    // --------------------------------------------

    if (isCalibrated()) {

      status.textContent =
        'New room started. Click room corners in order.';

    } else {

      status.textContent =
        'Click two points a known distance apart to calibrate (e.g. both ends of a labeled wall).';
    }

    // --------------------------------------------
    // Button text
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
    // Stage: corners
    // --------------------------------------------

    if (stage === 'corners') {

      if (corners.length < 3) {

        alert(
          'You need at least 3 corners before adding doors.'
        );

        return;
      }

      // Move to door stage

      stage = 'doors';

      enterDoorMode();

      finishRoomBtn.textContent =
        'Done Adding Doors';

      status.textContent =
        'Click a wall, then click two points along it to mark a door. Repeat for more doors, or click "Done Adding Doors" if this room has none.';

      return;
    }


    // --------------------------------------------
    // Stage: doors
    // --------------------------------------------

    if (stage === 'doors') {

      exitDoorMode();

      stage = 'verify';

      drawWallLengthOverlay();

      status.textContent =
        'Compare the blue labels against the image\'s printed dimensions. Click "Confirm & Save Room" to save, or Cancel to keep editing.';

      finishRoomBtn.textContent =
        'Confirm & Save Room';

      cancelVerifyBtn.style.display =
        'inline-block';

      return;
    }


    // --------------------------------------------
    // Stage: verify
    // --------------------------------------------

    if (stage === 'verify') {

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


      // ------------------------------------------
      // Commit
      // ------------------------------------------

      const result =
        commitCurrentRoom(
          roomId.trim(),
          roomLabel.trim()
        );


      // ------------------------------------------
      // Commit failed
      // ------------------------------------------

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

        resetStage();

        return;
      }


      // ------------------------------------------
      // Successfully committed
      // ------------------------------------------

      resetStage();

      stopTracing();

      if (cancelRoomBtn) {
        cancelRoomBtn.style.display =
          'none';
      }

      addRoomBtn.textContent =
        'Add Another Room';

      status.textContent =
        `${getCompletedRoomCount()} room(s) traced. Click "Add Another Room" to continue, or "Preview in 3D" when done.`;
    }
  }
);


// --------------------------------------------------
// Cancel Room Verification
// --------------------------------------------------

cancelVerifyBtn.addEventListener(
  'click',
  () => {

    resetStage();

    redrawImage();

    const corners =
      getCorners();

    status.textContent =
      `Back to editing. ${corners.length} corner(s) placed — click more, or Finish This Room again when ready.`;
  }
);


// --------------------------------------------------
// Cancel current room
// --------------------------------------------------

if (cancelRoomBtn) {

  cancelRoomBtn.addEventListener(
    'click',
    () => {

      // ------------------------------------------
      // Abort ONLY the current room
      //
      // Completed rooms remain untouched.
      // Calibration remains untouched.
      // ------------------------------------------

      resetCurrentRoomCorners();

      resetStage();

      stopTracing();

      redrawImage();

      cancelRoomBtn.style.display =
        'none';

      addRoomBtn.textContent =
        getCompletedRoomCount() > 0
          ? 'Add Another Room'
          : 'Add Room';

      if (
        getCompletedRoomCount() > 0
      ) {

        status.textContent =
          `${getCompletedRoomCount()} room(s) traced. Current room cancelled. Click "Add Another Room" to continue.`;

      } else {

        status.textContent =
          'Current room cancelled. Click "Add Room" to begin.';
      }
    }
  );
}


// --------------------------------------------------
// Preview in 3D
// --------------------------------------------------

preview3dBtn.addEventListener(
  'click',
  () => {

    if (
      getCompletedRoomCount() === 0
    ) {

      alert(
        'Finish at least one room before previewing.'
      );

      return;
    }

    // Stop tracing
    stopTracing();

    resetStage();

    if (cancelRoomBtn) {
      cancelRoomBtn.style.display =
        'none';
    }

    // Save all completed rooms
    saveAllRoomsForPreview();

    // Open 3D viewer
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
    // COMPLETE reset
    //
    // This DOES remove:
    // - calibration
    // - current room
    // - completed rooms
    // --------------------------------------------

    startRecalibration();

    resetStage();

    stopTracing();

    if (cancelRoomBtn) {
      cancelRoomBtn.style.display =
        'none';
    }

    addRoomBtn.textContent =
      'Add Room';

    status.textContent =
      'Trace cleared. Click "Add Room" to start a new calibration.';
  }
);