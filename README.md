# UnitTwin

Walkable, interactive 3D digital twins of apartment units, generated from
architectural floor plans — built for real estate developers to let buyers
experience off-plan units before construction, instead of static renders
and brochures.

## Status

Core 3D engine is solid and feature-complete for single/simple multi-room
layouts. Manual floor-plan trace tool (V1) is complete and connected to the
3D viewer end-to-end: trace a real floor plan image → walk through it in 3D.

## Current Structure

```
viewer-app/
  index.html              # 3D viewer entry point
  trace.html                # Trace tool entry point (separate page)
  package.json
  generate-textures.js         # Scans public/textures/, auto-generates texture catalog
  public/
    textures/                    # Real PBR texture sets (color/normal/roughness per folder)
    models/                        # Real .glb furniture models (one folder per item)
  src/
    main.js                          # Scene, camera, controls, raycasting, render loop
    floorplan.js                       # Wall/floor/ceiling geometry (arbitrary polygon shapes)
    floorplanData.js                     # Hand-typed fallback floor plan (used if no trace data saved)
    materialsData.js                       # Finish options: flat colors + auto-discovered textures
    texturesGenerated.js                     # AUTO-GENERATED — do not edit, run gen-textures instead
    textures.js                                # PBR texture loading (color+normal+roughness)
    furniture.js                                 # Real 3D model loading, wrapper/normalization, placeholders
    furnitureData.js                               # Furniture catalog + placed instances (app state)
    models.js                                        # GLTFLoader + model normalization/scaling
    collision.js                                       # OBB/SAT collision detection (walls + furniture)
    ui.js                                                # Wall/floor/ceiling panel, furniture panel, mode switching
    trace/
      traceMain.js                                        # Trace tool UI logic, button wiring
      traceCanvas.js                                         # Calibration, corner tracing, validation, room commit
```

## Roadmap

- [x] Phase 1 — Static walkable multi-room viewer (data-driven floor plan)
- [x] Phase 2 — Real PBR texture support (auto-discovered), click-to-select
      walls/floors/ceilings
- [x] Phase 3 — Furniture: real 3D models (GLTF), move/rotate via custom
      drag + gizmo, full OBB-based collision (walls + furniture, tunneling-safe)
- [x] Engine hardening — arbitrary polygon room shapes (not just rectangles),
      ceiling generation, proper UV mapping for non-rectangular surfaces
- [ ] Phase 4 — Floor plan input pipeline (in progress):
      - [x] V1 — Manual trace tool: image upload, calibration (with
            verification/recalibration), corner tracing with order/angle
            validation, multi-room support, duplicate-ID prevention,
            direct "Preview in 3D" connection via localStorage
      - [ ] V2 — Doors/openings placement in the trace tool
      - [ ] V3 — Multiple rooms with properly shared walls (avoid duplicate
            wall generation, connect adjacent rooms correctly)
      - [ ] V4 — Automated CAD/DXF/vector-PDF parsing; VLM-based parsing for
            scanned/rasterized plans as a further stretch tier
- [ ] Wall/floor/ceiling selection needs re-verification once V2/V3 (real
      shared walls, multiple traced rooms) exist — flagged as not yet
      tested against real multi-room traced data
- [ ] Phase 5 — Multi-unit / developer dashboard
- [ ] Phase 6 — Sales tool features: lead capture, analytics, buyer
      preference prediction (real applied ML on behavioral data)
- [ ] Phase 7 — Natural language scene editing ("move the sofa near the
      window") — intent extraction → scene resolution → validated transform
- [ ] Phase 8 — User's own furniture integration (photo → 3D asset, real CV)
- [ ] Phase 9 — Multi-developer platform
- [ ] **Visual quality overhaul (required before this is a sellable
      product)** — current furniture/materials prove the mechanism, not
      the final look. Needs: high-quality furniture assets with real
      materials/detail (not free low-poly packs), improved lighting/shadows,
      and overall photorealism — explicitly deferred until V1-V4 are done,
      but not optional long-term.
- [ ] **Product app frontend (the real entry point users see)** — right
      now there is no actual product: `index.html` and `trace.html` are
      bare, unstyled, developer-only pages with no navigation, accounts,
      or way to browse between units. A real user (a developer's sales
      team, eventually a buyer) needs an actual application: a modern,
      polished dashboard where a developer logs in, sees their
      units/developments listed, manages floor plans, and launches the
      3D viewer for a specific unit — with the 3D viewer becoming one
      screen *inside* this app, not a standalone page. This is a
      substantial, separate frontend build (likely still needs a backend
      for accounts/data, see below) and is where "where do people actually
      use this" gets answered.
- [ ] **Backend** — everything currently runs client-side only (no server,
      no database, no accounts). A real backend becomes necessary once
      the product needs: saving/loading floor plans across sessions and
      devices, multi-user/developer accounts, storing uploaded CAD files,
      serving data to Phase 5's multi-unit dashboard, and eventually
      Phase 6's analytics. Not needed for further engine/trace-tool work —
      this is its own, separate infrastructure phase.
- [ ] **Security phase** — hardening once real user uploads and a backend
      exist: malicious file upload protection (validating/sanitizing CAD,
      image, and model files, not trusting file extensions or client-side
      checks alone), injection prevention (once there's a database/API
      surface), auth/access control, and a general threat review. This
      phase only makes sense once Backend exists — can't secure
      infrastructure that isn't built yet.
- [ ] **QA / testing phase** — systematic testing pass across every unit
      of the app (collision, selection, texture/model loading, the trace
      tool's calibration and validation logic, cross-browser checks, edge
      cases like degenerate/self-intersecting traced shapes) — distinct
      from the ad-hoc bug-fixing that's happened organically throughout
      development so far. Worth revisiting after each major phase, not
      just once at the very end.

## Known Limitations (tracked, not forgotten)

- No wall collision for the *player* was an early gap — now fixed
  (raycasting-based, with sliding).
- Flat colors + real textures both work; textures only tested on
  rectangular/simple shapes so far — arbitrary shape UV mapping is built
  but not stress-tested on complex traced geometry yet.
- Furniture catalog is small (4 items) with free/placeholder-quality
  models — real asset quality is part of the future visual overhaul.
- Trace tool assumes axis-aligned (horizontal/vertical) walls — angled
  walls will trigger a (skippable) warning, not a hard block.
- Trace tool's shared-wall handling between rooms is not yet built (V3).

## Tech Stack

- Three.js for 3D rendering (WebGL)
- Vanilla JS, ES modules — no framework
- Vite for dev server/bundling
- GLTFLoader + SkeletonUtils for real furniture models
- Canvas 2D API for the trace tool (separate from the 3D scene)
- localStorage as the bridge between the trace tool and the 3D viewer