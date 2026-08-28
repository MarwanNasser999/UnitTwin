import { finishes } from './materialsData.js';
import { furnitureCatalog, placedFurniture, addFurnitureInstance } from './furnitureData.js';
import {
  applyWallColor,
  applyFloorColor,
  applyWallTexture,
  applyFloorTexture,
  applyCeilingColor,
  applyCeilingTexture,
} from './floorplan.js';

// The real, active floor plan is passed in from main.js.
let floorPlan = null;
let panelEl = null;
let roomsGroupRef = null;
let onFurnitureChanged = null;
let getSpawnPointCallback = null;
let exitEditModeCallback = null;
let setDragModeCallback = null;
let setWindowPlacementCallback = null;
let windowPlacing = false;

export function buildUI(
  activeFloorPlan,
  roomsGroup,
  furnitureChangeCallback,
  getSpawnPoint,
  exitEditMode,
  setDragMode,
  setWindowPlacement
) {
  floorPlan = activeFloorPlan;
  selectedRoomId = floorPlan.rooms[0]?.id || null;

  const panel = document.createElement('div');
  panel.id = 'ui-panel';
  document.body.appendChild(panel);

  panelEl = panel;
  roomsGroupRef = roomsGroup;
  onFurnitureChanged = furnitureChangeCallback;
  getSpawnPointCallback = getSpawnPoint;
  exitEditModeCallback = exitEditMode;
  setDragModeCallback = setDragMode;
  setWindowPlacementCallback = setWindowPlacement;

  renderPanel(panel, roomsGroup);
}

/**
 * Point the panel at a different storey. Rooms and walls belong to a
 * storey, so switching floors has to repoint the panel or it keeps
 * listing the previous storey's rooms.
 */
export function setActiveStoreyInUI(activeFloorPlan, roomsGroup) {
  floorPlan = activeFloorPlan;
  roomsGroupRef = roomsGroup;

  selectedRoomId = floorPlan.rooms[0] ? floorPlan.rooms[0].id : null;
  selectedWallId = null;
  selectedFurnitureId = null;
  panelMode = null;

  if (panelEl) renderPanel(panelEl, roomsGroupRef);
}

export function togglePanel() {
  if (!panelEl) return;
  panelEl.classList.toggle('visible');
}

function showPanel() {
  if (panelEl) panelEl.classList.add('visible');
} 

let selectedRoomId = null;
let selectedWallId = null;
let selectedFaceIndex = 4; // add this line — default to one main side
let selectedFurnitureId = null;
let panelMode = null;


export function selectWallFromScene(wallId, faceIndex) {
  const owningRoom = floorPlan.rooms.find((r) => r.wallIds.includes(wallId));
  if (!owningRoom) return;

  selectedRoomId = owningRoom.id;
  selectedWallId = wallId;
  // Only faces 4/5 (the two main sides) get per-side treatment; any
  // other face (top/bottom/end) falls back to face 4 as a sane default.
  selectedFaceIndex = (faceIndex === 4 || faceIndex === 5) ? faceIndex : 4;
  panelMode = 'wall';

  renderPanel(panelEl, roomsGroupRef);
  showPanel();
}

export function selectRoomFromScene(roomId) {
  selectedRoomId = roomId;
  panelMode = 'wall';

  renderPanel(panelEl, roomsGroupRef);
  showPanel();
}

export function selectFurnitureFromScene(instanceId) {
  selectedFurnitureId = instanceId;
  panelMode = 'furniture';

  renderPanel(panelEl, roomsGroupRef);
  showPanel();
}

export function getSelectedFurnitureId() {
  return selectedFurnitureId;
}

export function deselectAll() {
  selectedWallId = null;
  selectedFurnitureId = null;
  panelMode = null;
}

function renderPanel(panel, roomsGroup) {
  panel.innerHTML = '';

  if (panelMode === 'furniture') {
    renderFurniturePanel(panel);
  } else {
    renderWallPanel(panel, roomsGroup);
  }
}

function renderWallPanel(panel, roomsGroup) {
  const roomLabel = document.createElement('div');
  roomLabel.textContent = 'Room';
  roomLabel.className = 'ui-section-label';
  panel.appendChild(roomLabel);

  const roomSelect = document.createElement('select');

  for (const room of floorPlan.rooms) {
    const option = document.createElement('option');
    option.value = room.id;
    option.textContent = room.label;

    if (room.id === selectedRoomId) {
      option.selected = true;
    }

    roomSelect.appendChild(option);
  }

  roomSelect.addEventListener('change', (e) => {
    selectedRoomId = e.target.value;
    selectedWallId = null;
    renderPanel(panel, roomsGroup);
  });

  panel.appendChild(roomSelect);

  const currentRoom = floorPlan.rooms.find(
    (r) => r.id === selectedRoomId
  );

  const wallLabel = document.createElement('div');
  wallLabel.textContent = 'Wall';
  wallLabel.className = 'ui-section-label';
  panel.appendChild(wallLabel);

  const wallButtons = document.createElement('div');
  wallButtons.className = 'ui-button-row';

  for (const wallId of currentRoom.wallIds) {
    const wallData = floorPlan.walls.find((w) => w.id === wallId);

    const btn = document.createElement('button');
    btn.textContent = wallData.label;
    btn.className =
      wallId === selectedWallId ? 'ui-btn selected' : 'ui-btn';

    btn.addEventListener('click', () => {
      selectedWallId = wallId;
      renderPanel(panel, roomsGroup);
    });

    wallButtons.appendChild(btn);
  }

  panel.appendChild(wallButtons);

  const wallColorLabel = document.createElement('div');
  wallColorLabel.textContent = selectedWallId
    ? `Wall Finish — ${
        floorPlan.walls.find((w) => w.id === selectedWallId).label
      }`
    : 'Select a wall above (or click one in the scene) to change its finish';

  wallColorLabel.className = 'ui-section-label';
  panel.appendChild(wallColorLabel);

  const wallSwatches = document.createElement('div');
  wallSwatches.className = 'ui-button-row';

  for (const finish of finishes.wall) {
    const swatch = document.createElement('button');
    swatch.className = 'ui-swatch';
    swatch.title = finish.label;
    swatch.disabled = !selectedWallId;

    if (finish.textureFolder) {
      swatch.style.backgroundImage = `url(/textures/${finish.textureFolder}/color.jpg)`;
      swatch.style.backgroundSize = 'cover';
    } else {
      swatch.style.backgroundColor = `#${finish.color
        .toString(16)
        .padStart(6, '0')}`;
    }

    swatch.addEventListener('click', () => {
  if (finish.textureFolder) {
    applyWallTexture(roomsGroup, selectedWallId, finish.textureFolder, selectedFaceIndex);
  } else {
    applyWallColor(roomsGroup, selectedWallId, finish.color, selectedFaceIndex);
  }
});

    wallSwatches.appendChild(swatch);
  }

  panel.appendChild(wallSwatches);

  const floorColorLabel = document.createElement('div');
  floorColorLabel.textContent = `Floor Finish — ${currentRoom.label}`;
  floorColorLabel.className = 'ui-section-label';
  panel.appendChild(floorColorLabel);

  const floorSwatches = document.createElement('div');
  floorSwatches.className = 'ui-button-row';

  for (const finish of finishes.floor) {
    const swatch = document.createElement('button');
    swatch.className = 'ui-swatch';
    swatch.title = finish.label;

    if (finish.textureFolder) {
      swatch.style.backgroundImage = `url(/textures/${finish.textureFolder}/color.jpg)`;
      swatch.style.backgroundSize = 'cover';
    } else {
      swatch.style.backgroundColor = `#${finish.color
        .toString(16)
        .padStart(6, '0')}`;
    }

    swatch.addEventListener('click', () => {
      if (finish.textureFolder) {
        applyFloorTexture(
          roomsGroup,
          selectedRoomId,
          finish.textureFolder
        );
      } else {
        applyFloorColor(
          roomsGroup,
          selectedRoomId,
          finish.color
        );
      }
    });

    floorSwatches.appendChild(swatch);
  }

  panel.appendChild(floorSwatches);

  const ceilingColorLabel = document.createElement('div');
  ceilingColorLabel.textContent = `Ceiling Finish — ${currentRoom.label}`;
  ceilingColorLabel.className = 'ui-section-label';
  panel.appendChild(ceilingColorLabel);

  const ceilingSwatches = document.createElement('div');
  ceilingSwatches.className = 'ui-button-row';

  for (const finish of finishes.floor) {
    const swatch = document.createElement('button');
    swatch.className = 'ui-swatch';
    swatch.title = finish.label;

    if (finish.textureFolder) {
      swatch.style.backgroundImage = `url(/textures/${finish.textureFolder}/color.jpg)`;
      swatch.style.backgroundSize = 'cover';
    } else {
      swatch.style.backgroundColor = `#${finish.color
        .toString(16)
        .padStart(6, '0')}`;
    }

    swatch.addEventListener('click', () => {
      if (finish.textureFolder) {
        applyCeilingTexture(
          roomsGroup,
          selectedRoomId,
          finish.textureFolder
        );
      } else {
        applyCeilingColor(
          roomsGroup,
          selectedRoomId,
          finish.color
        );
      }
    });

    ceilingSwatches.appendChild(swatch);
  }

  panel.appendChild(ceilingSwatches);

  const addLabel = document.createElement('div');
  addLabel.textContent = 'Add Furniture';
  addLabel.className = 'ui-section-label';
  panel.appendChild(addLabel);

  const addButtons = document.createElement('div');
  addButtons.className = 'ui-button-row';

  for (const item of furnitureCatalog) {
    const btn = document.createElement('button');
    btn.textContent = item.label;
    btn.className = 'ui-btn';

    btn.addEventListener('click', () => {
      const spawnPoint = getSpawnPointCallback(item);

      // null means nothing within reach is clear — better to say so
      // than to drop the item through a wall.
      if (!spawnPoint) {
        alert('No clear space for that here — move somewhere with more room.');
        return;
      }

      addFurnitureInstance(
        item.id,
        selectedRoomId,
        spawnPoint
      );

      if (onFurnitureChanged) {
        onFurnitureChanged();
      }
    });

    addButtons.appendChild(btn);
  }

  panel.appendChild(addButtons);

  const windowLabel = document.createElement('div');
  windowLabel.textContent = 'Add Window';
  windowLabel.className = 'ui-section-label';
  panel.appendChild(windowLabel);

  const windowRow = document.createElement('div');
  windowRow.className = 'ui-button-row';

  const windowBtn = document.createElement('button');
  windowBtn.textContent = windowPlacing ? 'Cancel (Esc)' : 'Place Window';
  windowBtn.className = 'ui-btn';

  windowBtn.addEventListener('click', () => {
    windowPlacing = !windowPlacing;
    if (setWindowPlacementCallback) setWindowPlacementCallback(windowPlacing);
    renderPanel(panel, roomsGroupRef);
  });

  windowRow.appendChild(windowBtn);
  panel.appendChild(windowRow);
}

/**
 * Called from main.js when placement is cancelled outside the panel
 * (Escape), so the button label stays truthful.
 */
export function setWindowPlacingState(active) {
  windowPlacing = active;
  if (panelEl && panelMode === null) renderPanel(panelEl, roomsGroupRef);
}

function renderFurniturePanel(panel) {
  const instance = placedFurniture.find(
    (f) => f.instanceId === selectedFurnitureId
  );

  if (!instance) {
    panelMode = null;
    renderPanel(panel, roomsGroupRef);
    return;
  }

  const catalogItem = furnitureCatalog.find(
    (c) => c.id === instance.catalogId
  );

  const label = document.createElement('div');
  label.textContent = `Selected: ${catalogItem.label}`;
  label.className = 'ui-section-label';
  panel.appendChild(label);

  const hint = document.createElement('div');
  hint.textContent =
    'Move: drag the object. Rotate: use the ring. Press R to switch.';
  hint.style.opacity = '0.7';
  hint.style.fontSize = '12px';
  panel.appendChild(hint);

  const modeRow = document.createElement('div');
  modeRow.className = 'ui-button-row';
  modeRow.style.marginTop = '6px';

  const moveModeBtn = document.createElement('button');
  moveModeBtn.textContent = 'Move';
  moveModeBtn.className = 'ui-btn';

  moveModeBtn.addEventListener('click', () => {
    if (setDragModeCallback) {
      setDragModeCallback('move');
    }
  });

  modeRow.appendChild(moveModeBtn);

  const rotateModeBtn = document.createElement('button');
  rotateModeBtn.textContent = 'Rotate';
  rotateModeBtn.className = 'ui-btn';

  rotateModeBtn.addEventListener('click', () => {
    if (setDragModeCallback) {
      setDragModeCallback('rotate');
    }
  });

  modeRow.appendChild(rotateModeBtn);

  panel.appendChild(modeRow);

  const doneBtn = document.createElement('button');
  doneBtn.textContent = 'Done Editing';
  doneBtn.className = 'ui-btn';
  doneBtn.style.marginTop = '10px';

  doneBtn.addEventListener('click', () => {
    if (exitEditModeCallback) {
      exitEditModeCallback();
    }

    deselectAll();
    panelMode = null;
    renderPanel(panelEl, roomsGroupRef);
  });

  panel.appendChild(doneBtn);

  const deleteBtn = document.createElement('button');
  deleteBtn.textContent = 'Delete';
  deleteBtn.className = 'ui-btn';
  deleteBtn.style.marginTop = '6px';

  deleteBtn.addEventListener('click', () => {
    if (exitEditModeCallback) {
      exitEditModeCallback();
    }

    const index = placedFurniture.findIndex(
      (f) => f.instanceId === selectedFurnitureId
    );

    if (index !== -1) {
      placedFurniture.splice(index, 1);
    }

    selectedFurnitureId = null;
    panelMode = null;

    if (onFurnitureChanged) {
      onFurnitureChanged();
    }

    renderPanel(panel, roomsGroupRef);
  });

  panel.appendChild(deleteBtn);
}