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
      - [x] V1 — Manual trace tool. Upload a plan image, calibrate
            against a known dimension, trace rooms, preview in 3D.
      - [x] V2 — Doors. A door is an opening on a specific wall, with
            a swing side chosen while tracing.
      - [x] V3 — Shared wall network. Walls traced once and shared
            between rooms; snapping to square angles and to existing
            points; T-junctions; live preview while tracing.
      - [x] V4 — Windows. Placed in the 3D viewer with a ghost that
            shows where it fits, cutting a partial-height hole. Opens
            from inside only.
      - [~] V5 — Multiple floors. Storeys stack at their own heights,
            with a floor selector and a show-all view. Floors are
            traced from one sheet or from separate images, aligned on a
            corner marked on each. Canvas zoom and 5cm length snapping
            for accuracy.
            - [x] Balconies — floor slab, railings on every side left
                  without a wall, and an overhang above: flush with the
                  building, pulled back from the open edges
            - [ ] Staircases — traced when the plan shows one, placed
                  by hand in the viewer when it does not
      - [ ] V6 — Automation. Read CAD, DXF and vector PDF directly
            instead of tracing by hand. Scanned plans via a vision
            model as a later tier. Phase 4 closes once this ships.
- [ ] Phase 5 — Multi-unit / developer dashboard
- [ ] Phase 6 — Sales tool features: lead capture, analytics, buyer
      preference prediction (real applied ML on behavioral data)
- [ ] Phase 7 — Natural language scene editing ("move the sofa near the
      window") — intent extraction → scene resolution → validated transform
- [ ] Phase 8 — User's own furniture integration (photo → 3D asset, real CV)
- [ ] Phase 9 — Multi-developer platform
- [ ] **Phase 10 — Pricing structure.** One unified plan for all users
      (developers, architects, designers alike) — no separate pricing
      pages per customer type. Each tier bundles BOTH unit/project count
      AND feature access together (texture library size, real furniture
      models, export options, analytics, white-labeling) — a higher tier
      means more units AND more features, not a choice between the two.
      The tier *structure* is a decided, finished-product requirement,
      not an afterthought — designed before Phase 5's backend is built,
      so accounts/data model support it correctly from day one. Exact
      dollar amounts and tier boundaries still need real market research
      (what developers pay for model units/renders, what architects pay
      for SketchUp/Revit licenses) before finalizing numbers. Rough shape
      to refine: Free (1-2 units, flat colors only, no export) → Mid
      (moderate units, full textures, real furniture, save/export) →
      Higher (large/unlimited units, priority support, white-label,
      analytics). Enforcement depends on Phase 5 existing; the structure
      itself does not.
- [ ] **Visual quality overhaul (required before this is a sellable
      product).** Everything currently in the scene is a placeholder
      that proves the mechanism, not the finished look:
      - Doors are procedural boxes. The real product ships a library of
        real door models the user picks from, with the frame sizing
        itself to the chosen door — and if a door is shorter than the
        opening, wall is built above it rather than the door stretching
        to fit.
      - Furniture is a handful of models. The real catalogue is large.
      - Materials, lighting and shadows are flat. Target is
        photorealistic, since a buyer deciding on an unbuilt flat is
        judging how it *looks*, not whether the geometry is correct.
      - The default building itself should read as real, not as a
        diagram.
      - **Mitred wall geometry (the corner problem).** Walls are
        currently one box per wall, centred on its centreline. Two
        perpendicular boxes necessarily intersect inside the corner
        square — that overlap is what a corner *is* under this model —
        so their faces pass through each other and flicker, and from
        outside you can see interior paint through the seam. No offset,
        depth bias or ownership rule removes it; several were tried.
        The fix is to stop building walls as independent boxes and
        generate the whole wall network as a single offset outline with
        mitred joins, extruded to wall height. It has to cover the
        entire network rather than per room, or two rooms sharing a
        wall each extrude their own slab — the duplication the wall
        network exists to prevent. Deferred here rather than done
        earlier because doors, windows and per-side painting all have
        to be reworked on top of it, and doing that against geometry
        that this phase rebuilds anyway would mean doing it twice.
      - Per-side wall painting must survive the rewrite. It works today
        because each wall box carries separate materials per face; a
        single extruded mesh needs vertex groups or split faces to keep
        it.

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

## Design Decisions Worth Knowing

- **Corner extension.** Every wall extends half a wall-thickness past
  each end. Two walls meeting at a shared corner point each *stop* at
  that point, which leaves the corner square unfilled — a notch inside,
  a seam outside, on every corner of every room. Extending closes it.
  The overlap it creates is handled with `polygonOffset` on wall
  materials; a proper mitre is deferred to the visual-quality pass.

- **Z-fighting is the recurring 3D failure mode here.** Any two
  surfaces at the same position flicker as the camera moves, and it
  cost real time before being recognised. Frame depth is inset below
  wall thickness, and wall segments stop short of an opening by exactly
  the frame thickness so the posts *fill* that space rather than
  sitting in front of it. Surfaces meeting end-to-end are fine;
  surfaces meeting face-to-face are not.

- **Doors belong to walls, not to rooms.** Every earlier design tried
  to infer a door's position from gaps, room boundaries, or proximity,
  and each one produced doors that landed in empty space or at the
  wrong width. Anchoring the door to a wall removed four layers of
  inference and most of the bug surface with them.


- **Presentation scale (1.1x) + FOV=90.** First-person 3D on a flat monitor
  lacks real peripheral vision and depth cues, so mathematically accurate
  rooms can feel smaller/more cramped than they really are — a known,
  documented effect, not unique to this project. After verifying (multiple
  ways: measured mesh bounding boxes, a 1-meter reference cube, top-down
  view) that traced room dimensions are 100% accurate, we tuned FOV to 90°
  (wider FOV compensates for missing peripheral vision) and apply a small
  1.1x visual-only scale factor to rendered geometry (walls, rooms,
  furniture) for comfort. **The underlying stored data (what would be
  reported to a buyer as the real room size) is never altered** — only
  what's rendered. This is a deliberate, documented product decision, not
  a bug workaround — if revisited, change `PRESENTATION_SCALE` in
  `main.js` and `furniture.js` (currently duplicated — should move to a
  shared constant if touched again) and the camera FOV in `main.js`.

## Target Customers

- **Real estate developers** (primary, original target) — selling off-plan
  units, want buyers to walk through a unit before it's built.
- **Architects / Interior Designers** (secondary, identified later) — use
  this instead of/alongside AutoCAD-style tools for client-facing design
  iteration and walkthroughs, not technical drafting. Different priorities
  than developers: fast layout variants, before/after comparison, precise
  measurement, style/furniture swapping, accurate CAD import (Phase 4 V4)
  matters more for this audience specifically. This changes competitive
  positioning too — less "vs. Matterport," more "vs. presenting a
  SketchUp/Revit model to a client," which is a less crowded wedge.

## Known Limitations (tracked, not forgotten)

- Flat colours and real textures both work; arbitrary-shape UV mapping
  is built but not stress-tested on complex traced geometry.
- Furniture catalogue is small (4 items) with placeholder-quality
  models — see the visual quality overhaul.
- Wall corners overlap where two perpendicular wall boxes intersect.
  Visible as a flickering seam, and interior paint shows through from
  outside. Each corner is owned by exactly one wall so only one
  extends into it, which removed the worst of it, but the thickness
  overlap itself is inherent to boxes-on-centrelines and needs the
  mitred rewrite scheduled in the visual quality overhaul.
- No collision on doors or windows: you can walk through a closed one.
- Storey height is a module constant (`WALL_HEIGHT`), not read from
  `storey.height`. Both are 2.5m so they agree today, but a storey with
  a different height would build walls at the wrong height while its
  base offset assumed otherwise. Threading the height through walls,
  doors and windows is the fix.
- Stacked storeys leave a 2cm void between a ceiling and the floor
  above. Deliberate — it separates two otherwise coincident surfaces
  and keeps both paintable. Hidden behind the walls; a real slab with
  thickness belongs with the mitred wall rewrite.
- Furniture rotates freely and pushes itself clear of walls when a turn
  would collide. It works, but the honest fix is proper placement
  behaviour in the visual pass.
- Window placements live in memory only. Reloading loses them, since
  the trace tool owns the saved plan and rewrites it wholesale.
- Tracing precision is bounded by the drawing. Two floors on one sheet
  means each is small, so a pixel of click error is worth centimetres
  rather than millimetres. Zoom and length snapping help; a
  higher-resolution source, or V6's vector parsing, is the real answer.
- `ALIGN_STOREY_FOOTPRINTS` stretches upper storeys to match the ground
  floor's extents. Right for floors that share a footprint, wrong for a
  genuine setback — and it cannot fix two traces that disagree about
  the shape itself, only their overall size.
- Window placements and any storey switching live in memory. The trace
  tool owns the saved plan and rewrites it wholesale.
- Wall thickness is a single global constant; real plans have varying
  thicknesses (exterior vs. partition).

## Tech Stack

- Three.js for 3D rendering (WebGL)
- Vanilla JS, ES modules — no framework
- Vite for dev server/bundling
- GLTFLoader + SkeletonUtils for real furniture models
- Canvas 2D API for the trace tool (separate from the 3D scene)
- localStorage as the bridge between the trace tool and the 3D viewer