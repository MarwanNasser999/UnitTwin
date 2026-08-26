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
            verification/recalibration), corner tracing, multi-room
            support, duplicate-ID prevention, direct "Preview in 3D"
            connection via localStorage
      - [x] V2 — Doors. Went through several designs before landing on
            the right one: a door is an **opening on a specific wall**
            (`{offset, width}` in metres along that wall), not a gap
            inferred between walls. Mark Doors selects a wall, then two
            clicks along it set the opening; both clicks project onto
            that wall's own line, so the door is always exactly on the
            wall regardless of click precision. `buildWall` splits the
            wall around its openings — solid wall, door, solid wall —
            all from one wall's coordinates. A shared wall is one wall,
            so a shared doorway is one opening: no duplicates, no
            proximity matching, no filler geometry. The door itself is
            procedural (frame posts, lintel, panel on a hinge-ready
            pivot, handles both sides) and scales to its opening.
      - [x] V3 — Shared wall network + reliable tracing:
            - Walls are traced once into a shared point/wall network;
              rooms are defined by selecting existing points, so shared
              walls are structurally impossible to duplicate
            - **Ortho snap** (segments within 8° of horizontal/vertical
              snap to exact) and **coordinate snap** (a new point's X/Y
              snaps onto an existing point's X/Y) — clicks are never
              pixel-perfect, and without these walls lean by a few
              centimetres and corners drift apart. Shift bypasses both
              for genuinely angled walls.
            - **Live preview**: green line from the last point to the
              cursor with its length, showing the snapped result before
              committing
            - **T-junctions**: clicking an existing wall's line splits
              it and inserts a point there. The split is checked at the
              raw click, *before* snapping, since snapping would
              otherwise nudge the click off the wall it was aimed at.
            - Self-intersection validation on room definition
            - Room boundaries collect every wall lying along each
              segment, so a side traced in several pieces still selects
              and paints correctly
            - Calibration behaves like wall tracing: a live rubber-band
              line, and the second point snapping square to the first
              (Shift to override), since CAD dimension lines are
              horizontal or vertical
            - Marking a door takes a third click for the side it swings
              into. Two arrows are drawn perpendicular to the wall —
              the only directions a door on that wall can open — and a
              click too near the wall line is refused as ambiguous
            - Cancel Room; committing a room returns to the ready stage
              instead of forcing wall-tracing mode
      - [x] V4 — Windows. Picked from the panel and placed in the
            viewer: the pointer unlocks, a ghost follows the mouse and
            reads green where it fits, red over a door, another window,
            or too near a corner. Placement writes `{offset, width,
            sillHeight, headHeight, interiorSide}` onto the wall and
            rebuilds just that wall.
            - `createWallSegment` gained a height range, so a wall can
              be cut partway up — solid below the sill and above the
              head. Doors are still full-height; this is the same
              capability a short door will need to have wall built
              above it.
            - Whichever side of the wall you stand on when placing is
              recorded as the interior, and E only opens the window
              from that side.
            - Making the viewer place windows made it an editor rather
              than a pure reader. Placements live in memory only —
              persisting them means the viewer writing back to the
              saved plan, which is really a backend question.
      - [ ] V5 — Automated CAD/DXF/vector-PDF parsing; VLM-based
            parsing for scanned/rasterised plans as a further stretch
            tier. Phase 4 closes once this ships.
- [x] Wall/floor/ceiling selection verified against real multi-room
      traced data, including walls traced in multiple pieces
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
- Furniture rotates freely and pushes itself clear of walls when a turn
  would collide. It works, but the honest fix is proper placement
  behaviour in the visual pass.
- Window placements live in memory only. Reloading loses them, since
  the trace tool owns the saved plan and rewrites it wholesale.
- Calibration accuracy is unverified — reported as slightly off away
  from the calibrated distance, not yet measured.
- Wall thickness is a single global constant; real plans have varying
  thicknesses (exterior vs. partition).

## Tech Stack

- Three.js for 3D rendering (WebGL)
- Vanilla JS, ES modules — no framework
- Vite for dev server/bundling
- GLTFLoader + SkeletonUtils for real furniture models
- Canvas 2D API for the trace tool (separate from the 3D scene)
- localStorage as the bridge between the trace tool and the 3D viewer