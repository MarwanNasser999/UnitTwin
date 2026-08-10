# UnitTwin

Walkable, interactive 3D digital twins of apartment units, generated from
architectural floor plans — built for real estate developers to let buyers
experience off-plan units before construction, instead of static renders
and brochures.

## Status

Early prototype. Currently in Phase 1: proving that a procedurally generated,
walkable 3D unit (from simple floor plan data) is a compelling experience
before adding finishes, furniture, or real CAD import.

## Current Structure

viewer-app/
  index.html
  package.json
  src/
    main.js              # Scene, camera, controls, click/raycasting, render loop
    floorplan.js          # Wall/floor geometry generation, floor plan data lookups
    floorplanData.js       # Hand-authored test floor plan (rooms, walls, openings)
    materialsData.js        # Available finish colors (walls, floors)
    furniture.js              # Furniture mesh generation from catalog + placed instances
    furnitureData.js           # Furniture catalog + placed furniture state
    ui.js                       # UI panel: wall/floor editing, furniture catalog, selection

## Roadmap

- [x] Phase 1 — Static walkable single-unit viewer
      (Known limitation: no wall collision yet — you can walk through walls.
      Expected to be resolved naturally in Phase 3, which needs raycasting
      for furniture selection anyway — collision will reuse that same logic.)
- [ ] Phase 2 — Live finish/material swapping (floors, paint, cabinets)
- [ ] Phase 3 — Furniture placement (catalog assets) + AI layout suggestions
      (LLM/rules-based: suggest furniture arrangement given room dims + style)
- [ ] Phase 4 — Floor plan → 3D shell automation
      (clean CAD/DXF parsing first; VLM-based parsing of messier scanned/
      hand-drawn plans as a stretch option)
- [ ] Phase 5 — Multi-unit / developer dashboard
- [ ] Phase 6 — Sales tool features: lead capture, analytics, and buyer
      preference prediction (real applied ML on behavioral data — which
      finishes/layouts correlate with which buyer profiles)
- [ ] Phase 7 — Natural language scene editing ("move the sofa near the
      window") — intent extraction → scene resolution → validated transform
- [ ] Phase 8 — User's own furniture integration (photo → 3D asset, real CV)
- [ ] Phase 9 — Multi-developer platform

## Where AI/ML Actually Shows Up

Phases 1-2 are pure 3D/web engineering, no AI. Real AI/ML value is
concentrated in Phase 3 (LLM layout suggestions), Phase 4 (optional VLM
plan parsing), Phase 6 (applied ML on buyer behavior — the most genuinely
"DS" phase), Phase 7 (LLM-driven scene editing), and Phase 8 (real CV).

## Tech Stack

- Three.js for 3D rendering
- Vanilla JS for now (no framework yet — kept minimal on purpose for Phase 1)