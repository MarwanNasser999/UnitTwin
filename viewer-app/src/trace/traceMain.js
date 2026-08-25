import {
  initCanvas,
  loadImageFile,
  getCanvas,
  isCalibrated,
  enterCalibrateMode,
  setCalibrationDistance,
  onCanvasClick,
  setPreviewCursor,
  clearPreviewCursor,
  startOver,
  enterWallMode,
  breakWallChain,
  exitWallMode,
  undoLastWallPoint,
  enterDoorMarkMode,
  exitDoorMarkMode,
  getMarkedDoorCount,
  undoLastMarkedDoor,
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
window.debugDumpNetwork = debugDumpNetwork;

const imageInput = document.getElementById('image-input');
const status = document.getElementById('status');

const calibrateBtn = document.getElementById('calibrate-btn');

const traceWallsBtn = document.getElementById('trace-walls-btn');
const newWallChainBtn = document.getElementById('new-wall-chain-btn');
const finishWallsBtn = document.getElementById('finish-walls-btn');

const markDoorsBtn = document.getElementById('mark-doors-btn');
const doneDoorsBtn = document.getElementById('done-doors-btn');

const defineRoomBtn = document.getElementById('define-room-btn');
const finishRoomBtn = document.getElementById('finish-room-btn');

const undoBtn = document.getElementById('undo-btn');
const startOverBtn = document.getElementById('start-over-btn');
const preview3dBtn = document.getElementById('preview-3d-btn');

// --------------------------------------------------
// Stage / button visibility
// --------------------------------------------------
// 'start' -> only Calibrate
// 'walls' -> New Wall Chain, Undo, Finish Walls
// 'ready' -> Trace Walls, Mark Doors, Define Room
// 'doors' -> Undo, Done Adding Doors
// 'room'  -> Undo, Finish This Room
function setStage(stage) {
  calibrateBtn.style.display = stage === 'start' ? 'inline-block' : 'none';

  traceWallsBtn.style.display = stage === 'ready' ? 'inline-block' : 'none';
  newWallChainBtn.style.display = stage === 'walls' ? 'inline-block' : 'none';
  finishWallsBtn.style.display = stage === 'walls' ? 'inline-block' : 'none';

  markDoorsBtn.style.display = stage === 'ready' ? 'inline-block' : 'none';
  doneDoorsBtn.style.display = stage === 'doors' ? 'inline-block' : 'none';

  defineRoomBtn.style.display = stage === 'ready' ? 'inline-block' : 'none';
  finishRoomBtn.style.display = stage === 'room' ? 'inline-block' : 'none';

  undoBtn.style.display =
    stage === 'walls' || stage === 'doors' || stage === 'room' ? 'inline-block' : 'none';
}

function askForDistance() {
  while (true) {
    const input = prompt('Enter the real-world distance between those two points in meters (e.g. 3.5):');
    if (input === null) return null;

    const value = input.trim();
    if (!/^\d+(?:\.\d+)?$/.test(value)) {
      alert('Invalid number.\n\nPlease enter numbers only, using a dot for decimals.\nExample: 3.5');
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
        status.textContent = 'Calibration cancelled. Click "Calibrate" to try again.';
        setStage('start');
        return;
      }
      const success = setCalibrationDistance(parsed);
      if (!success) {
        status.textContent = 'Calibration failed. Click "Calibrate" to try again.';
        setStage('start');
        return;
      }
      status.textContent = 'Calibrated. Click "Trace Walls" to start tracing.';
      setStage('ready');
    },

    onNoPointNearby: () => {
      status.textContent = 'Click an existing wall corner (white dot) — this action needs an already-traced point.';
    },

    onWallSelected: (lengthM) => {
      status.textContent = `Wall selected (${lengthM.toFixed(2)}m). Click two points along it to set the doorway.`;
    },

    onNoWallNearby: () => {
      status.textContent = 'Click on a wall line to select it, then click two points along that wall.';
    },

    onDoorMarked: (count, width) => {
      status.textContent = `Door added (${width.toFixed(2)}m). ${count} total. Click another wall, or "Done Adding Doors".`;
    },
  }, event.shiftKey);

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
// Live preview while tracing walls
// --------------------------------------------------

canvas.addEventListener('mousemove', (event) => {
  const rect = canvas.getBoundingClientRect();
  setPreviewCursor(event.clientX - rect.left, event.clientY - rect.top, event.shiftKey);
});

canvas.addEventListener('mouseleave', () => {
  clearPreviewCursor();
});

// --------------------------------------------------
// Calibrate
// --------------------------------------------------

calibrateBtn.addEventListener('click', () => {
  enterCalibrateMode();
  status.textContent = 'Click two points a known distance apart (e.g. both ends of a labeled wall).';
});

// --------------------------------------------------
// Trace Walls
// --------------------------------------------------

traceWallsBtn.addEventListener('click', () => {
  enterWallMode();
  setStage('walls');
  status.textContent = 'Click along walls to trace them. Segments snap to horizontal/vertical — hold Shift for a free angle. Click an existing wall line to split it and start a T-junction there.';
});

newWallChainBtn.addEventListener('click', () => {
  breakWallChain();
  status.textContent = 'Started a new wall chain — your next click begins a fresh, disconnected wall.';
});

finishWallsBtn.addEventListener('click', () => {
  exitWallMode();
  setStage('ready');
  status.textContent = `${getNetworkWallCount()} wall(s) traced. Click "Mark Doors" to cut doorways into walls, or "Define Room" to select a room's boundary.`;
});

// --------------------------------------------------
// Mark Doors — a door is an opening on a wall
// --------------------------------------------------

markDoorsBtn.addEventListener('click', () => {
  enterDoorMarkMode();
  setStage('doors');
  status.textContent = 'Click a wall to select it, then click two points along that wall to mark the doorway.';
});

doneDoorsBtn.addEventListener('click', () => {
  exitDoorMarkMode();
  setStage('ready');
  status.textContent = `${getMarkedDoorCount()} door(s) total. Click "Define Room" to select a room's boundary.`;
});

// --------------------------------------------------
// Define Room
// --------------------------------------------------

defineRoomBtn.addEventListener('click', () => {
  enterRoomMode();
  setStage('room');
  status.textContent = "Click the room's corners (white dots), in order, to define its floor and ceiling.";
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
    status.textContent = 'Room not saved — enter a display label to confirm.';
    return;
  }

  const result = commitCurrentRoom(roomId.trim(), roomLabel.trim());

  if (!result.success) {
    if (result.reason === 'duplicate_id') {
      alert(`Room ID "${roomId.trim()}" is already used. Choose a different, unique ID.`);
    } else if (result.reason === 'self_intersecting') {
      alert(
        `The points you selected create a crossing shape (edges ${result.i + 1} and ${result.j + 1} intersect).\n\n` +
        `Click points in order around the room's perimeter.`
      );
    } else {
      alert('Select at least 3 existing points to define a room.');
    }
    status.textContent = 'Room not saved.';
    return;
  }

  exitRoomMode();

  // Resume wall tracing so the existing points stay clickable for
  // the next room.
  enterWallMode();
  setStage('walls');

  status.textContent = `${getCompletedRoomCount()} room(s) defined. Continue tracing walls, or "Finish Walls" then "Define Room" for the next one.`;
});

// --------------------------------------------------
// Undo (context-aware)
// --------------------------------------------------

undoBtn.addEventListener('click', () => {
  const currentMode = getMode();

  if (currentMode === 'walls') {
    undoLastWallPoint();
    status.textContent = `Undid last point. ${getNetworkWallCount()} wall(s) remain.`;
  } else if (currentMode === 'doors') {
    undoLastMarkedDoor();
    status.textContent = `${getMarkedDoorCount()} door(s) total.`;
  } else if (currentMode === 'room') {
    undoLastRoomPoint();
    status.textContent = `${getCurrentRoomPointCount()} point(s) selected for this room.`;
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
  exitDoorMarkMode();
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