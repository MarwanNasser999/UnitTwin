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
  startNewFloor,
  hasCurrentStoreyWork,
  getStoreyCount,
  isAwaitingRefPoint,
  setRoomModeAllowsNewPoints,
  setLengthSnapEnabled,
  isLengthSnapEnabled,
  getPreviousRefPoint,
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
const defineBalconyBtn = document.getElementById('define-balcony-btn');
const cancelRoomBtn = document.getElementById('cancel-room-btn');

const undoBtn = document.getElementById('undo-btn');
const newFloorBtn = document.getElementById('new-floor-btn');

/*
 * Two ways a building arrives:
 *
 *   one drawing holding several floors  → New Floor moves to the next
 *   one drawing per floor               → Choose File adds the next
 *
 * Asked once, at the first load. The button only appears in the first
 * case, since in the second it would mean nothing.
 */
let multiFloorSheet = false;

// Balconies are traced like rooms; the sides left without a wall
// become open air with a railing.
let pendingRoomKind = 'room';
const snapLengthBtn = document.getElementById('snap-length-btn');
const zoomInBtn = document.getElementById('zoom-in-btn');
const zoomOutBtn = document.getElementById('zoom-out-btn');
const zoomResetBtn = document.getElementById('zoom-reset-btn');
const zoomLabel = document.getElementById('zoom-label');
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
  defineBalconyBtn.style.display = stage === 'ready' ? 'inline-block' : 'none';
  newFloorBtn.style.display =
    multiFloorSheet && stage === 'ready' ? 'inline-block' : 'none';
  finishRoomBtn.style.display = stage === 'room' ? 'inline-block' : 'none';
  cancelRoomBtn.style.display = stage === 'room' ? 'inline-block' : 'none';

  undoBtn.style.display =
    stage === 'walls' || stage === 'doors' || stage === 'room' ? 'inline-block' : 'none';
}

/**
 * A small modal with real, labelled buttons. confirm() only offers
 * OK and Cancel, which forces the reader to work out which choice is
 * which — bad for anything that discards work.
 *
 * options: [{ label, detail, value }]
 */
function askChoice(title, options) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:100;' +
      'display:flex;align-items:center;justify-content:center;';

    const box = document.createElement('div');
    box.style.cssText =
      'background:#222;color:#fff;border:1px solid #555;border-radius:6px;' +
      'padding:20px;max-width:460px;font-family:sans-serif;';

    const headRow = document.createElement('div');
    headRow.style.cssText =
      'display:flex;align-items:flex-start;gap:12px;margin-bottom:16px;';

    const heading = document.createElement('div');
    heading.textContent = title;
    heading.style.cssText = 'font-size:15px;line-height:1.4;flex:1;';
    headRow.appendChild(heading);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '\u00d7';
    closeBtn.title = 'Cancel';
    closeBtn.style.cssText =
      'background:none;border:none;color:#aaa;font-size:22px;line-height:1;' +
      'cursor:pointer;padding:0 4px;';

    closeBtn.addEventListener('click', () => {
      document.body.removeChild(overlay);
      resolve(null);
    });

    headRow.appendChild(closeBtn);
    box.appendChild(headRow);

    options.forEach((opt) => {
      const btn = document.createElement('button');
      btn.style.cssText =
        'display:block;width:100%;text-align:left;margin-bottom:8px;' +
        'padding:10px 12px;background:#2d3a48;color:#fff;border:1px solid #4a6a8a;' +
        'border-radius:4px;cursor:pointer;font-size:14px;';

      const label = document.createElement('div');
      label.textContent = opt.label;
      label.style.fontWeight = 'bold';
      btn.appendChild(label);

      if (opt.detail) {
        const detail = document.createElement('div');
        detail.textContent = opt.detail;
        detail.style.cssText = 'opacity:0.75;font-size:12px;margin-top:3px;';
        btn.appendChild(detail);
      }

      btn.addEventListener('click', () => {
        document.body.removeChild(overlay);
        resolve(opt.value);
      });

      box.appendChild(btn);
    });

    overlay.appendChild(box);
    document.body.appendChild(overlay);
  });
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

imageInput.addEventListener('change', async (event) => {
  const file = event.target.files[0];

  // Selecting the same file twice fires no change event unless the
  // input is cleared.
  event.target.value = '';

  if (!file) return;

  let keepStoreys = false;

  if (getStoreyCount() > 0) {
    const answer = await askChoice('You already have traced floors. What is this drawing?', [
      {
        label: 'Another floor of the same building',
        detail: 'Keeps everything traced so far and adds this as the next floor.',
        value: true,
      },
      {
        label: 'A new project',
        detail: 'Discards every floor traced so far.',
        value: false,
      },
    ]);

    // Dismissed — leave everything as it was.
    if (answer === null) {
      status.textContent = 'Cancelled. Nothing was changed.';
      return;
    }

    keepStoreys = answer;

    // Floors arriving as separate drawings are added by loading each
    // one, so New Floor has no role here.
    if (keepStoreys) multiFloorSheet = false;
  } else {
    const answer = await askChoice('How many floors are in this drawing?', [
      {
        label: 'Several floors on one sheet',
        detail: 'A "New Floor" button appears for moving to the next one.',
        value: true,
      },
      {
        label: 'Just one floor',
        detail: 'Load another image later to add the next floor.',
        value: false,
      },
    ]);

    if (answer === null) {
      status.textContent = 'Cancelled. No image loaded.';
      return;
    }

    multiFloorSheet = answer;
  }

  status.textContent = 'Loading image...';

  loadImageFile(file, () => {
    setCanvasZoom(1);
    status.textContent =
      'Image loaded. Zoom in before tracing — precision here is what ' +
      'decides how well the floors line up. Click "Calibrate" to begin.';
    setStage('start');
  }, keepStoreys);
});

// --------------------------------------------------
// Canvas clicks
// --------------------------------------------------

const canvas = getCanvas();

/*
 * Two plans on one sheet means each is small on screen, and a few
 * pixels of click error becomes tens of centimetres of wall. Zooming
 * is what makes precise tracing possible.
 *
 * The canvas keeps its full image resolution and is only stretched
 * visually, so every stored coordinate stays in image space no matter
 * the zoom.
 */
let canvasZoom = 1;

function applyCanvasZoom() {
  if (!canvas.width) return;
  canvas.style.width = Math.round(canvas.width * canvasZoom) + 'px';
  canvas.style.height = Math.round(canvas.height * canvasZoom) + 'px';
}

function setCanvasZoom(z) {
  canvasZoom = Math.max(0.25, Math.min(8, z));
  applyCanvasZoom();
  if (zoomLabel) zoomLabel.textContent = Math.round(canvasZoom * 100) + '%';
}

/**
 * Screen coordinates to image coordinates. Reading the scale from the
 * element's own size means this holds however the canvas is stretched.
 */
function toCanvasCoords(event) {
  const rect = canvas.getBoundingClientRect();
  const sx = canvas.width / rect.width;
  const sy = canvas.height / rect.height;
  return {
    x: (event.clientX - rect.left) * sx,
    y: (event.clientY - rect.top) * sy,
  };
}


canvas.addEventListener('click', (event) => {
  const pt = toCanvasCoords(event);
  const pixelX = pt.x;
  const pixelY = pt.y;

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
      if (isAwaitingRefPoint()) {
        status.textContent = getPreviousRefPoint()
          ? 'Calibrated. Now click the same corner you marked on the floor ' +
            'below — the dashed circle shows where it was.'
          : 'Calibrated. Click one outside corner of the building — the ' +
            'top-left is a good habit. Every floor is lined up against it.';
        setStage('ready');
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

    onDoorNeedsSide: (width) => {
      status.textContent = `Doorway ${width.toFixed(2)}m wide. Now click one of the two arrows to set which way it opens.`;
    },

    onRefPointSet: () => {
      status.textContent =
        'Alignment corner set. Trace this floor as usual — "Trace Walls" to begin.';
    },

    onDoorSideAmbiguous: () => {
      status.textContent = 'Too close to the wall to tell which side — click further out, toward one of the arrows.';
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
  const pt = toCanvasCoords(event);
  setPreviewCursor(pt.x, pt.y, event.shiftKey);
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
  status.textContent = 'Click a wall to select it, two points along it for the doorway, then the side it opens into.';
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
  pendingRoomKind = 'room';
  setRoomModeAllowsNewPoints(false);
  enterRoomMode();
  setStage('room');
  status.textContent = "Click the room's corners (white dots), in order, to define its floor and ceiling.";
});

defineBalconyBtn.addEventListener('click', () => {
  pendingRoomKind = 'balcony';
  setRoomModeAllowsNewPoints(true);
  enterRoomMode();
  setStage('room');
  status.textContent =
    "Click the balcony's corners in order — out over open air is fine, " +
    'corners there do not need a traced wall. Any side without one gets ' +
    'a railing.';
});

finishRoomBtn.addEventListener('click', () => {
  if (getCurrentRoomPointCount() < 3) {
    alert('Select at least 3 existing points to define a room.');
    return;
  }

  const isBalcony = pendingRoomKind === 'balcony';

  const roomId = prompt(
    isBalcony ? 'Enter a balcony ID (e.g. "balcony1"):' : 'Enter a room ID (e.g. "bedroom"):'
  );
  if (!roomId || !roomId.trim()) {
    status.textContent = 'Room not saved — enter an ID to confirm.';
    return;
  }

  const roomLabel = prompt(
    isBalcony ? 'Enter a display label (e.g. "Balcony"):' : 'Enter a display label (e.g. "Bedroom"):'
  );
  if (!roomLabel || !roomLabel.trim()) {
    status.textContent = 'Room not saved — enter a display label to confirm.';
    return;
  }

  const result = commitCurrentRoom(roomId.trim(), roomLabel.trim(), pendingRoomKind);

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

  pendingRoomKind = 'room';

  exitRoomMode();
  setStage('ready');

  status.textContent = `${getCompletedRoomCount()} room(s) defined. "Define Room" for the next one, "Mark Doors" to cut doorways, or "Trace Walls" to add more walls.`;
});

// Cancel out of room definition without committing anything.
cancelRoomBtn.addEventListener('click', () => {
  exitRoomMode();
  setStage('ready');
  status.textContent = 'Room cancelled. Nothing was saved.';
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

newFloorBtn.addEventListener('click', () => {
  if (!hasCurrentStoreyWork()) {
    alert('Trace some walls first — there is nothing to file as a floor yet.');
    return;
  }

  const label = prompt('Name for this floor (e.g. "First Floor"):', 'Floor ' + (getStoreyCount() + 1));
  if (label === null) return;

  const result = startNewFloor(label.trim());
  if (!result.success) {
    alert('Nothing traced yet.');
    return;
  }

  setStage('ready');
  status.textContent =
    'Floor filed. Click the same corner on this floor\'s drawing that you ' +
    'marked on the last one — the dashed circle shows where it was.';
});

function refreshSnapButton() {
  snapLengthBtn.textContent = isLengthSnapEnabled()
    ? 'Round lengths: on'
    : 'Round lengths: off';
}

snapLengthBtn.addEventListener('click', () => {
  setLengthSnapEnabled(!isLengthSnapEnabled());
  refreshSnapButton();
});

refreshSnapButton();

zoomInBtn.addEventListener('click', () => setCanvasZoom(canvasZoom * 1.25));
zoomOutBtn.addEventListener('click', () => setCanvasZoom(canvasZoom / 1.25));
zoomResetBtn.addEventListener('click', () => setCanvasZoom(1));

// Ctrl+wheel zooms, as it does anywhere else.
canvas.addEventListener('wheel', (event) => {
  if (!event.ctrlKey) return;
  event.preventDefault();
  setCanvasZoom(canvasZoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1));
}, { passive: false });

startOverBtn.addEventListener('click', () => {
  startOver();
  setStage('start');
  status.textContent = 'Cleared. Click "Calibrate" to begin.';
});