export const floorPlan = {
  walls: [
    { id: 'wall_lr_south', label: 'South Wall', start: { x: -2.5, z: -2 }, end: { x: 2.5, z: -2 } },
    {
      id: 'wall_shared',
      label: 'Shared Wall (Living Room / Bedroom)',
      start: { x: 2.5, z: -2 },
      end: { x: 2.5, z: 2 },
      openings: [{ offset: 1.5, width: 1.0 }],
    },
    { id: 'wall_lr_north', label: 'North Wall', start: { x: 2.5, z: 2 }, end: { x: -2.5, z: 2 } },
    { id: 'wall_lr_west', label: 'West Wall', start: { x: -2.5, z: 2 }, end: { x: -2.5, z: -2 } },
    { id: 'wall_br_south', label: 'South Wall', start: { x: 2.5, z: -2 }, end: { x: 5.5, z: -2 } },
    { id: 'wall_br_east', label: 'East Wall', start: { x: 5.5, z: -2 }, end: { x: 5.5, z: 2 } },
    { id: 'wall_br_north', label: 'North Wall', start: { x: 5.5, z: 2 }, end: { x: 2.5, z: 2 } },
  ],
  rooms: [
    {
      id: 'living_room',
      label: 'Living Room',
      wallIds: ['wall_lr_south', 'wall_shared', 'wall_lr_north', 'wall_lr_west'],
      corners: [
        { x: -2.5, z: -2 },
        { x: 2.5, z: -2 },
        { x: 2.5, z: 2 },
        { x: -2.5, z: 2 },
      ],
    },
    {
      id: 'bedroom',
      label: 'Bedroom',
      wallIds: ['wall_shared', 'wall_br_east', 'wall_br_north', 'wall_br_south'],
      corners: [
        { x: 2.5, z: -2 },
        { x: 5.5, z: -2 },
        { x: 5.5, z: 2 },
        { x: 2.5, z: 2 },
      ],
    },
  ],
};