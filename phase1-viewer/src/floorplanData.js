export const floorPlan = {
  rooms: [
    {
      id: 'living_room',
      corners: [
        { x: -2.5, z: -2 },
        { x: 2.5, z: -2 },
        { x: 2.5, z: 2 },
        { x: -2.5, z: 2 },
      ],
      openings: [
        // Doorway in the wall from corner 1 (2.5,-2) to corner 2 (2.5,2)
        // — the wall shared with the bedroom.
        { wallStart: 1, wallEnd: 2, offset: 1.5, width: 1.0 },
      ],
    },
    {
      id: 'bedroom',
      corners: [
        { x: 2.5, z: -2 },
        { x: 5.5, z: -2 },
        { x: 5.5, z: 2 },
        { x: 2.5, z: 2 },
      ],
      openings: [
        // Same physical doorway, described from the bedroom's side —
        // this wall runs the opposite direction (corner 3 -> corner 0),
        // so the offset is measured from its own start point.
        { wallStart: 3, wallEnd: 0, offset: 1.5, width: 1.0 },
      ],
    },
  ],
};