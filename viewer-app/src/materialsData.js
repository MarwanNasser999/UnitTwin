// Available finish options for rooms.
// Hand-authored for now — later this could be extended with real
// texture images instead of flat colors, or loaded from a product catalog.

export const finishes = {
  floor: [
    { id: 'light_oak', label: 'Light Oak', color: 0xc9a876 },
    { id: 'dark_walnut', label: 'Dark Walnut', color: 0x4a3728 },
    { id: 'grey_concrete', label: 'Grey Concrete', color: 0x999999 },
  ],
  wall: [
    { id: 'warm_white', label: 'Warm White', color: 0xf2ede4 },
    { id: 'soft_grey', label: 'Soft Grey', color: 0xd8d8d0 },
    { id: 'sage_green', label: 'Sage Green', color: 0xa8b89c },
  ],
};