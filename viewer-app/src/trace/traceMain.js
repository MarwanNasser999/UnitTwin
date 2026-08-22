import {
  initCanvas,
  loadImageFile,
  getCanvas,
  isCalibrated,
  enterCalibrateMode,
  setCalibrationDistance,
  onCanvasClick,
  redrawAll,
  startOver,
  enterWallMode,
  breakWallChain,
  exitWallMode,
  undoLastWallPoint,
  enterRoomMode,
  exitRoomMode,
  getCurrentRoomPointCount,
  undoLastRoomPoint,
  commitCurrentRoom,
  getMode,
  getCompletedRoomCount,
  getNetworkWallCount,
  saveAllRoomsForPreview,
  debugDumpNetwork,
} from './traceCanvas.js';

initCanvas();

window.debugDumpNetwork = debugDumpNetwork; // temporary, for console debugging

const imageInput = document.getElementById('image-input');
const status = document.getElementById('status');
const calibrateBtn = document.getElementById('calibrate-btn');
const traceWallsBtn = document.getElementById('trace-walls-btn');
const newWallChainBtn = document.getElementById('new-wall-chain-btn');
const undoBtn = document.getElementById('undo-btn');
const finishWallsBtn = document.getElementById('finish-walls-btn');
const defineRoomBtn = document.getElementById('define-room-btn');
const finishRoomBtn = document.getElementById('finish-room-btn');
const startOverBtn = document.getElementById('start-over-btn');
const preview3dBtn = document.getElementById('preview-3d-btn');
const cancelRoomBtn = document.getElementById('cancel-room-btn');

// --------------------------------------------------
// Stage / button visibility
// --------------------------------------------------

// 'start' -> only Calibrate visible
// 'walls' -> New Wall Chain, Undo, Finish Walls
// 'ready' -> Trace Walls, Define Room (network exists, nothing active)
// 'room'  -> Undo, Finish This Room

function setStage(stage) {
  calibrateBtn.style.display = stage === 'start' ? 'inline-block' : 'none';
  traceWallsBtn.style.display = stage === 'ready' ? 'inline-block' : 'none';
  newWallChainBtn.style.display = stage === 'walls' ? 'inline-block' : 'none';
  finishWallsBtn.style.display = stage === 'walls' ? 'inline-block' : 'none';
  defineRoomBtn.style.display = stage === 'ready' ? 'inline-block' : 'none';
  finishRoomBtn.style.display = stage === 'room' ? 'inline-block' : 'none';
  cancelRoomBtn.style.display = stage === 'room' ? 'inline-block' : 'none';

  undoBtn.style.display =
    stage === 'walls' || stage === 'room' ? 'inline-block' : 'none';
}

function askForDistance() {
  while (true) {
    const input = prompt(
      'Enter the real-world distance between those two points in meters (e.g. 3.5):'
    );

    if (input === null) return null;

    const value = input.trim();

    if (!/^\d+(?:\.\d+)?$/.test(value)) {
      alert(
        'Invalid number.\n\nPlease enter numbers only, using a dot for decimals.\nExample: 3.5'
      );
      continue;
    }

    const parsed = Number(value);

    if (!Number.isFinite(parsed) || parsed <= 0) {
      alert('Distance must be greater than 0.');
      continue;
    }

    return parsed;
  }
}

// --------------------------------------------------
// Image loading
// --------------------------------------------------

imageInput.addEventListener('change', (event) => {
  const file = event.target.files[0];

  if (!file) return;

  status.textContent = 'Loading image...';

  loadImageFile(file, () => {
    status.textContent = 'Image loaded. Click "Calibrate" to begin.';
    setStage('start');
  });
});

// --------------------------------------------------
// Canvas clicks
// --------------------------------------------------

const canvas = getCanvas();

canvas.addEventListener('click', (event) => {
  const rect = canvas.getBoundingClientRect();

  const pixelX = event.clientX - rect.left;
  const pixelY = event.clientY - rect.top;

  onCanvasClick(pixelX, pixelY, {
    onCalibrationNeeded: () => {
      const parsed = askForDistance();

      if (parsed === null) {
        status.textContent =
          'Calibration cancelled. Click "Calibrate" to try again.';
        setStage('start');
        return;
      }

      const success = setCalibrationDistance(parsed);

      if (!success) {
        status.textContent =
          'Calibration failed. Click "Calibrate" to try again.';
        setStage('start');
        return;
      }

      status.textContent =
        'Calibrated. Click "Trace Walls" to start tracing.';

      setStage('ready');
    },

    onNoPointNearby: () => {
      status.textContent =
        'Click an existing wall corner (white dot) — rooms are built from already-traced walls only.';
    },
  });

  if (getMode() === 'walls') {
    status.textContent = `Tracing walls (${getNetworkWallCount()} so far). Click the next corner, "New Wall Chain" to start a separate wall, or "Finish Walls" when done.`;
  }

  if (getMode() === 'room') {
    const count = getCurrentRoomPointCount();

    if (count > 0) {
      status.textContent = `${count} point(s) selected for this room, in order. Click "Finish This Room" once you've selected every corner.`;
    }
  }
});

// --------------------------------------------------
// Calibrate
// --------------------------------------------------

calibrateBtn.addEventListener('click', () => {
  enterCalibrateMode();

  status.textContent =
    'Click two points a known distance apart (e.g. both ends of a labeled wall).';
});

// --------------------------------------------------
// Trace Walls
// --------------------------------------------------

traceWallsBtn.addEventListener('click', () => {
  enterWallMode();

  setStage('walls');

  status.textContent =
    'Click along walls to trace them. Click near an existing white dot to reuse it (shared corners). "New Wall Chain" starts a separate, disconnected wall.';
});

newWallChainBtn.addEventListener('click', () => {
  breakWallChain();

  status.textContent =
    'Started a new wall chain — your next click begins a fresh, disconnected wall.';
});

finishWallsBtn.addEventListener('click', () => {
  exitWallMode();

  setStage('ready');

  status.textContent = `${getNetworkWallCount()} wall(s) traced. Click "Define Room" to select a room's boundary, or "Trace Walls" to add more.`;
});

// --------------------------------------------------
// Define Room
// --------------------------------------------------

defineRoomBtn.addEventListener('click', () => {
  enterRoomMode();

  setStage('room');

  status.textContent =
    'Click existing wall corners (white dots), in order, around the room. A gap with no wall becomes an intentional opening (e.g. a doorway).';
});

finishRoomBtn.addEventListener('click', () => {
  if (getCurrentRoomPointCount() < 3) {
    alert('Select at least 3 existing points to define a room.');
    return;
  }

  const roomId = prompt('Enter a room ID (e.g. "bedroom"):');

  if (!roomId || !roomId.trim()) {
    status.textContent = 'Room not saved — enter an ID to confirm.';
    return;
  }

  const roomLabel = prompt('Enter a display label (e.g. "Bedroom"):');

  if (!roomLabel || !roomLabel.trim()) {
    status.textContent =
      'Room not saved — enter a display label to confirm.';
    return;
  }

  const result = commitCurrentRoom(
    roomId.trim(),
    roomLabel.trim()
  );

  // --------------------------------------------------
  // Updated error handling
  // --------------------------------------------------

  if (!result.success) {
  if (result.reason === 'duplicate_id') {
    alert(`Room ID "${roomId.trim()}" is already used. Choose a different, unique ID.`);
  } else if (result.reason === 'self_intersecting') {
    alert(
      `The points you selected create a crossing shape (edges ${result.i + 1} and ${result.j + 1} intersect).\n\n` +
      `Click points in a clean order walking around the room's actual perimeter, not jumping between sides.`
    );
  } else {
    alert('Select at least 3 existing points to define a room.');
  }
  status.textContent = 'Room not saved.';
  return;
}

  exitRoomMode();

  // Auto-resume wall tracing so the just-used points stay immediately
  // clickable to keep extending the network (e.g. into a hallway).

  enterWallMode();

  setStage('walls');

  const openMsg =
    result.openSegments.length > 0
      ? ` ${result.openSegments.length} side(s) left open (no wall traced there — treated as an opening).`
      : '';

  status.textContent =
    `${getCompletedRoomCount()} room(s) defined.${openMsg} Continue tracing walls to connect the next room, or click "Finish Walls" then "Define Room" when ready.`;
});

cancelRoomBtn.addEventListener('click', () => {
  exitRoomMode();

  enterWallMode();

  setStage('walls');

  status.textContent =
    'Room definition cancelled — back to tracing walls.';
});

// --------------------------------------------------
// Undo (context-aware: wall mode vs room mode)
// --------------------------------------------------

undoBtn.addEventListener('click', () => {
  if (getMode() === 'walls') {
    undoLastWallPoint();

    status.textContent =
      `Undid last point. ${getNetworkWallCount()} wall(s) remain.`;
  } else if (getMode() === 'room') {
    undoLastRoomPoint();

    status.textContent =
      `${getCurrentRoomPointCount()} point(s) selected for this room.`;
  }
});

// --------------------------------------------------
// Preview in 3D
// --------------------------------------------------

preview3dBtn.addEventListener('click', () => {
  if (getCompletedRoomCount() === 0) {
    alert('Define at least one room before previewing.');
    return;
  }

  exitWallMode();
  exitRoomMode();

  setStage('ready');

  saveAllRoomsForPreview();

  window.open(`/index.html?t=${Date.now()}`, '_blank');
});

// --------------------------------------------------
// Start Over
// --------------------------------------------------

startOverBtn.addEventListener('click', () => {
  startOver();

  setStage('start');

  status.textContent = 'Cleared. Click "Calibrate" to begin.';
});