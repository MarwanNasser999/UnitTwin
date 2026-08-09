import { floorPlan } from './floorplanData.js';
import { finishes } from './materialsData.js';
import { applyWallColor, applyFloorColor } from './floorplan.js';

// Simple UI state — which room and wall are currently selected.
let selectedRoomId = floorPlan.rooms[0].id;
let selectedWallId = null;

// Keep references so external code (main.js) can trigger a re-render
// after changing selection state from a 3D click, not just from the panel.
let panelEl = null;
let roomsGroupRef = null;

/**
 * Builds the panel DOM and wires up all interactions.
 * roomsGroup is the THREE.Group returned by buildFloorPlan(), needed
 * so button clicks can call applyWallColor/applyFloorColor on it.
 */
export function buildUI(roomsGroup) {
  const panel = document.createElement('div');
  panel.id = 'ui-panel';
  document.body.appendChild(panel);

  panelEl = panel;
  roomsGroupRef = roomsGroup;

  renderPanel(panel, roomsGroup);
}

/**
 * Called from main.js when the user clicks a wall directly in the 3D
 * scene. Finds which room owns that wall (so the room dropdown stays
 * in sync too), updates selection state, and re-renders the panel.
 */
export function selectWallFromScene(wallId) {
  const owningRoom = floorPlan.rooms.find((r) => r.wallIds.includes(wallId));
  if (!owningRoom) return;

  selectedRoomId = owningRoom.id;
  selectedWallId = wallId;

  if (panelEl && roomsGroupRef) {
    renderPanel(panelEl, roomsGroupRef);
  }
}

function renderPanel(panel, roomsGroup) {
  panel.innerHTML = ''; // clear and rebuild on every state change — simplest approach for now

  // --- Room selector ---
  const roomLabel = document.createElement('div');
  roomLabel.textContent = 'Room';
  roomLabel.className = 'ui-section-label';
  panel.appendChild(roomLabel);

  const roomSelect = document.createElement('select');
  for (const room of floorPlan.rooms) {
    const option = document.createElement('option');
    option.value = room.id;
    option.textContent = room.label;
    if (room.id === selectedRoomId) option.selected = true;
    roomSelect.appendChild(option);
  }
  roomSelect.addEventListener('change', (e) => {
    selectedRoomId = e.target.value;
    selectedWallId = null; // reset wall selection when room changes
    renderPanel(panel, roomsGroup);
  });
  panel.appendChild(roomSelect);

  // --- Wall selector (only walls belonging to the selected room) ---
  const currentRoom = floorPlan.rooms.find((r) => r.id === selectedRoomId);

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
    btn.className = wallId === selectedWallId ? 'ui-btn selected' : 'ui-btn';
    btn.addEventListener('click', () => {
      selectedWallId = wallId;
      renderPanel(panel, roomsGroup);
    });
    wallButtons.appendChild(btn);
  }
  panel.appendChild(wallButtons);

  // --- Wall color swatches (only usable once a wall is selected) ---
  const wallColorLabel = document.createElement('div');
  wallColorLabel.textContent = selectedWallId
    ? `Wall Color — ${floorPlan.walls.find((w) => w.id === selectedWallId).label}`
    : 'Select a wall above (or click one in the scene) to change its color';
  wallColorLabel.className = 'ui-section-label';
  panel.appendChild(wallColorLabel);

  const wallSwatches = document.createElement('div');
  wallSwatches.className = 'ui-button-row';
  for (const finish of finishes.wall) {
    const swatch = document.createElement('button');
    swatch.className = 'ui-swatch';
    swatch.style.backgroundColor = `#${finish.color.toString(16).padStart(6, '0')}`;
    swatch.title = finish.label;
    swatch.disabled = !selectedWallId;
    swatch.addEventListener('click', () => {
      applyWallColor(roomsGroup, selectedWallId, finish.color);
    });
    wallSwatches.appendChild(swatch);
  }
  panel.appendChild(wallSwatches);

  // --- Floor color swatches (applies directly to selected room) ---
  const floorColorLabel = document.createElement('div');
  floorColorLabel.textContent = `Floor Color — ${currentRoom.label}`;
  floorColorLabel.className = 'ui-section-label';
  panel.appendChild(floorColorLabel);

  const floorSwatches = document.createElement('div');
  floorSwatches.className = 'ui-button-row';
  for (const finish of finishes.floor) {
    const swatch = document.createElement('button');
    swatch.className = 'ui-swatch';
    swatch.style.backgroundColor = `#${finish.color.toString(16).padStart(6, '0')}`;
    swatch.title = finish.label;
    swatch.addEventListener('click', () => {
      applyFloorColor(roomsGroup, selectedRoomId, finish.color);
    });
    floorSwatches.appendChild(swatch);
  }
  panel.appendChild(floorSwatches);
}