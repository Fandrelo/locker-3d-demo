# Interactive 3D Demo — Handoff Notes

Interactive WebGL showcase of the self-service locker facility. This document captures the architecture, asset quirks, interaction rules, and known limitations so a future session can continue without re-discovering them.

---

## 1. Quick Start

### Requirements

- Node.js 22.x (Vite 8 requires Node `^20.19.0` or `>=22.12.0`)
- npm

### Commands

```bash
cd web
npm install        # first time only
npm run dev        # http://localhost:5173/
```

Production build:

```bash
npm run build      # typecheck + vite build -> web/dist
npm run preview    # serves web/dist, default http://localhost:4173/
```

The model-sync script runs automatically before both `dev` and `build`:

```bash
npm run sync:models
```

---

## 2. Stack

| Package | Version | Purpose |
| --- | --- | --- |
| `three` | `^0.186.1` | Renderer, GLTF loading, raycasting, controls |
| `gsap` | `^3.15.0` | Door, camera, and luggage animations |
| `vite` | `^8.3.4` | Dev server and static build |
| `typescript` | `^5.9.3` | Strict TypeScript |
| `@types/three` | `^0.186.0` | Three.js typings |

No framework (no React). The UI is plain HTML/CSS with TypeScript event wiring.

---

## 3. File Map

```text
web/
├── index.html                 # HUD markup, loading overlay, camera/action buttons
├── package.json
├── package-lock.json
├── tsconfig.json
├── vite.config.ts             # base: './', ES2022 target
├── public/
│   ├── favicon.svg
│   └── models/                # generated, git-ignored
├── scripts/
│   └── sync-models.mjs        # copies GLBs from ../../blueprints
└── src/
    ├── main.ts                # app boot, loading, debug API
    ├── scene.ts               # renderer, camera, lights, presets, OrbitControls
    ├── assets.ts              # GLB loading, cleanup, tower/door discovery, labels
    ├── interactions.ts        # door + luggage state machine, picking, animations
    ├── kiosk-screen.ts        # procedural CanvasTexture kiosk touchscreen
    ├── ui.ts                  # HUD API: status, toast, tooltip, loading, buttons
    ├── style.css              # desktop/mobile HUD and loading styles
    └── types.ts               # TowerRecord, DoorRecord, RoomAssets, LuggageMode
```

---

## 4. Asset Pipeline — Read This First

### Source of truth

All models live in the repository-level `blueprints/` directory. Do not hand-edit generated files in `web/public/models/`; they are overwritten on every `dev`/`build`.

`web/scripts/sync-models.mjs` copies:

| Source | Destination |
| --- | --- |
| `blueprints/room_4x3-lockers.glb` | `web/public/models/room.glb` |
| `blueprints/hardware/luggage/samsonite_spinner.glb` | `web/public/models/luggage.glb` |

If the Blender models are regenerated, rerun `npm run sync:models` (or any `dev`/`build` command) and visually re-check the scene.

### Critical GLB facts

1. **`room_4x3-lockers.glb` already contains the room, six locker towers, and the kiosk.** Do not follow the Three.js boilerplate in `blueprints/interactive_3d_engine_guide.md` that instances `winnsen_e04a.glb` seven times. That would duplicate the entire facility.
2. The room GLB contains leftover solid proxy meshes named `Master_Mesh_WINNSEN_E04A`, `E06B`, `E08A`, and `E12A` at the origin. `assets.ts` removes those. Note that `GLTFLoader` names the loaded `Object3D` after the glTF *node* (`WINNSEN_E04A_03`, `WINNSEN_E12A_07`, ...), not after the mesh, so `isProxyMesh()` resolves the original mesh name through `gltf.parser.associations`. Matching only `object.name` against the `Master_Mesh_*` names leaves six coincident locker-sized boxes at the origin (visible as one block beside `LKR-A01`).
3. The console mesh is also named `Master_Mesh_WINNSEN_MAIN_CONSOLE`, but it is the actual kiosk geometry. It is intentionally **kept**.
4. The standalone luggage GLB contains a helper `Floor` node. `assets.ts` removes it.
5. There are no animation clips in the GLBs. All door, camera, and luggage motion is procedural with GSAP.
6. Asset sizes are small (room ~60 KB, locker ~24 KB, luggage ~142 KB). No Draco/KTX2 setup is needed.

### GLTFLoader duplicate-name behavior

Several nodes share identical names across the six towers (`E04A_Door_01`, `E04A_Door_01_LED`, etc.). Three.js' `GLTFLoader` makes duplicate names unique by appending suffixes, for example:

```text
E04A_Door_01
E04A_Door_01_1
E04A_Door_01_2
...
```

Door discovery therefore uses:

```ts
/^E04A_Door_0([1-4])(?:_\d+)?$/
```

Do not tighten this back to an exact name match. The LED lookup uses a name fragment (`_LED`) for the same reason.

### Locker sizing data

`MODEL_SPECS` in `assets.ts` mirrors section 2 of the repository-level [`lockers-physical-infra/winnsen.md`](../lockers-physical-infra/winnsen.md):

| Model | Tier | Doors / tower | Compartment (H × W × D) | Volume / door |
| --- | --- | --- | --- | --- |
| `E04A` | XXXL | 4 | 907 × 432 × 485 mm | 190 L |
| `E06B` | XL | 6 | 602 × 432 × 485 mm | 126.1 L |
| `E08A` | L | 8 | 450 × 432 × 485 mm | 94.3 L |
| `E12A` | M | 12 | 297 × 432 × 485 mm | 62.2 L |

The values are typed constants, not parsed from the Markdown at runtime. If the spec document changes, update `MODEL_SPECS` and re-check the UI.

Sizing is surfaced in three places:

- The **Locker sizing** HUD card (top right) defaults to `LKR-D01` and follows the hovered tower.
- Door tooltips include the tier and compartment dimensions.
- `LKR-D01` carries an always-visible sizing placard under its ID label. It is the featured tower because the GLB renders every tower with E04A geometry, so `LKR-D01` (mapped to E04A) is the only tower whose visible geometry matches its published spec.

### Right-door badge / LED correction

The source room GLB has incorrect local offsets for the right-column hardware:

- `Door_02` and `Door_04` badge/LED x-offset is `-0.941` instead of the intended `-0.422` / `-0.410`.
- `Door_04` badge/LED y-offset is `-0.5535` instead of `0.43125` / `0.43875`, which places the top-right hardware on the bottom-right door.

`assets.ts` corrects this at load time in `fixDoorHardware()`. This also makes hover boxes and debug projections line up with the actual door leaf. If the GLB is regenerated, compare the new offsets; the fix may need to be removed or adjusted.

---

## 5. Scene and Coordinates

Three.js is Y-up. The room is 4.00 m × 3.00 m with a 2.50 m wall height. Origin `(0, 0, 0)` is the south-west floor corner; the room extends to `x = 4`, `z = -3`.

The room file already places everything at the correct coordinates. The active tower mapping is in `assets.ts` (`TOWER_META`):

| Label | Instance node | Wall |
| --- | --- | --- |
| `LKR-A01` | `WINNSEN_E12A_07_Instance` | South |
| `LKR-B01` | `WINNSEN_E06B_05_Instance` | East |
| `LKR-B02` | `WINNSEN_E12A_06_Instance` | East |
| `LKR-C01` | `WINNSEN_E08A_01_Instance` | North |
| `LKR-D01` | `WINNSEN_E04A_03_Instance` | West |
| `LKR-D02` | `WINNSEN_E06B_04_Instance` | West |

There are 6 towers × 4 doors = **24 compartments**. The kiosk is a separate mesh at the north wall.

### Cutaway

The south wall, south entry leaf, lintels, and jamb posts are collected in `CUTAWAY_NAMES` and hidden by default so the room can be viewed from the south. The HUD `Cutaway` button toggles them. `Reset` re-enables the cutaway.

Hidden cutaway objects are filtered out of raycasting by `isVisibleInScene()`.

### Camera presets

Defined in `scene.ts`:

| Preset | Position | Target |
| --- | --- | --- |
| `overview` | `[2.7, 2.9, 4.7]` | `[1.95, 1.0, -1.6]` |
| `entry` | `[2.45, 1.55, -0.25]` | `[2.15, 1.15, -2.4]` |
| `kiosk` | `[2.5, 1.58, -1.1]` | `[2.5, 1.2, -2.45]` |
| `lockers` | `[2.25, 1.7, -2.15]` | `[0.5, 1.15, -1.15]` |
| `suitcase` | `[2.65, 1.3, -0.4]` | `[1.55, 0.42, -1.15]` |

Presets are animated with GSAP. User interaction cancels an active camera tween. Camera FOV is `45°` on landscape and `58°` on portrait (`aspect < 1`).

### Free movement

The camera is not locked to the presets. `createFreeMoveControls()` in `scene.ts` is driven every frame from `main.ts` before `controls.update()`:

| Input | Action |
| --- | --- |
| `W` `A` `S` `D` / arrow keys | Move horizontally relative to the current view |
| `Q` / `E` | Lower / raise the camera |
| `Shift` | Sprint |
| Drag / right-drag / scroll | Orbit / pan / zoom around the orbit target |

Movement translates both `camera.position` and `controls.target`, so the view direction is preserved while walking/flying through the room. Pressing a movement key cancels preset tweens and clears the active preset button. Position is clamped to `MOVE_BOUNDS` so the camera cannot get lost. Keyboard input is ignored while an input, textarea, select, or contenteditable element has focus.

### Lighting / material tuning

- ACES Filmic tone mapping, exposure `0.82`.
- `PCFShadowMap` (note: `PCFSoftShadowMap` was removed in Three r186).
- Procedural `RoomEnvironment` PMREM, environment intensity `0.24`.
- Key directional light + fill + warm interior point light.
- `tuneMaterials()` darkens the floor and adjusts wall/door values for better contrast. This is a runtime tweak, not a Blender change.

### Generated visuals

- Locker ID labels are CanvasTexture sprites added above each tower (`createTowerLabel()`).
- The kiosk touchscreen is a procedural CanvasTexture plane (`kiosk-screen.ts`) placed at `x=2.5, y=1.3, z=-2.443`.
- The green floor-ring highlight under the suitcase is created in `DemoController`.

---

## 6. Interaction Model

### Picking

`DemoController` raycasts against the room and luggage. It resolves the first visible hit, then walks up the parent chain looking for `userData.__door` or the luggage root.

Clicks are distinguished from orbit drags:

- pointer movement greater than 6 px → drag, no click
- press held longer than 650 ms → no click

The canvas context menu is disabled so right-drag panning works cleanly.

### Doors

- Left column (`Door_01`, `Door_03`) opens `-90°` around local Y.
- Right column (`Door_02`, `Door_04`) opens `+90°` around local Y.
- Each `DoorRecord` stores `closedAngle`, `openAngle`, `isOpen`, `isOccupied`, and a cloned LED material.
- LED materials are cloned per door so one compartment can turn red without changing every LED.
- Hover uses a `BoxHelper`; the tooltip reports tower, door number, side, and state.

### Luggage state machine

`LuggageMode` is one of:

```text
free -> selected -> moving -> stowed
         ^                     |
         +------- retrieve ----+
```

Rules:

- Click the suitcase in `free` to select it.
- With the suitcase selected, click a **bottom** door (`01` or `02`):
  - closed door: open it, then stow after the opening tween
  - open door: stow immediately
- Top doors (`03`, `04`) are rejected with a toast.
- Stow path: current position → staging point in front of the tower → tower-local slot.
- On stow completion, the door is marked occupied, its LED turns red, and the door closes.
- Clicking the occupied door reopens it; clicking the suitcase or **Remove suitcase** retrieves it.
- On retrieval, the suitcase returns to `HOME` and the door closes.

Important values in `interactions.ts`:

```ts
HOME = (1.55, 0, -1.15)
SUITCASE_SLOT = {
  leftX: 0.2525,
  rightX: 0.7475,
  y: 0.06,
  z: -0.2425,
  approachZ: 0.68,
}
```

The target world position is obtained via `tower.localToWorld(...)`, so it works for every wall orientation.

### `pendingStow` guard

When a closed door is clicked with luggage selected, `pendingStow` is set until the open tween finishes. This prevents double clicks from starting two stows. If that flow is ever refactored, keep the clear-on-deselect and reset behavior; otherwise door clicks can become permanently blocked.

### Reset

`DemoController.reset()`:

- kills luggage/door tweens
- closes all doors instantly
- clears occupancy and LED state
- returns the suitcase to `HOME`
- clears selection/tooltips
- restores the cutaway (from `main.ts` reset handler)
- switches the camera back to `overview`

---

## 7. UI

Markup lives in `index.html`; behavior in `ui.ts`; styling in `style.css`.

Main UI surfaces:

- top bar: title and live status
- help panel: orbit/zoom/door/suitcase instructions
- bottom toolbar: camera presets, cutaway, remove suitcase, reset
- tooltip: follows pointer, clamped to viewport
- toast: transient feedback
- loading overlay: progress bar and error state

Notes:

- The help panel has `pointer-events: none` so it never blocks 3D clicks behind it.
- On screens narrower than 820 px, the help panel is hidden and the toolbar stacks. A one-time hint toast appears after load.
- The `Remove suitcase` button is hidden until a suitcase is stowed (`onOccupancyChange`).

---

## 8. Debug Mode

Append `?debug=1` to the URL to expose:

```ts
window.__lockerDemo
```

Available methods:

| Method | Purpose |
| --- | --- |
| `getState()` | Luggage mode, occupied door, suitcase position, all door states |
| `getDoorScreen(label, number)` | Project a door's center to viewport coordinates |
| `getLuggageScreen()` | Project the suitcase center to viewport coordinates |
| `pickAt(x, y)` | Return the first visible raycast hits and ancestor names |

Example:

```js
const state = window.__lockerDemo.getState();
const point = window.__lockerDemo.getDoorScreen('LKR-D01', 1);
```

This API was used with headless Edge/Playwright to verify interactions. It is only attached when `debug` is present in the query string.

---

## 9. Validation Performed

- `npm run typecheck` — passes
- `npm run build` — passes
- Desktop 1440×900 and mobile 390×844 (touch emulation)
- Door open/close for left and right doors
- Top-door rejection while suitcase is selected
- Stow into `LKR-D01` left and right bottom doors
- Retrieval and reset
- Cutaway on/off
- WASD/QE free camera movement cancels preset tweens and clears the active preset
- Production build served from a `/locker-self-service/` subpath with zero console errors or 404s

There is currently **no committed automated test suite** for the web app. The Playwright scripts used during development live in a temp directory, not in the repository.

---

## 10. Deployment

The repository ships with `.github/workflows/deploy-pages.yml`, which builds the demo and publishes it with GitHub Pages. It assumes the repository root contains both `web/` and `blueprints/`, because `npm run build` runs `sync:models` and copies GLBs from `blueprints/` into `web/public/models/` (that directory is git-ignored).

### Why `blueprints/` must be included

`web/scripts/sync-models.mjs` resolves the repo root as `path.resolve(webDir, '..')` and expects:

- `blueprints/room_4x3-lockers.glb`
- `blueprints/hardware/luggage/samsonite_spinner.glb`

If the new repository contains only the contents of `web/` as its root, the sync step will fail in CI. Either include `blueprints/` alongside `web/`, or commit the generated GLBs and adapt/remove the `prebuild` script.

### Setup

1. Push the repository to GitHub (must be public for free Pages).
2. Open **Settings → Pages → Build and deployment** and set **Source** to **GitHub Actions**.
3. Push to `main` (or run the workflow manually from the Actions tab).

No branch deploy, `gh-pages` branch, or manual build artifact is needed — the workflow uploads `web/dist` as a Pages artifact.

### Why it works under a project subpath

- `vite.config.ts` uses `base: './'`
- model URLs use `new URL('models/...', document.baseURI)`
- the built `web/dist` was verified under a repository subpath

There is no client-side router, so no SPA/404 rewrite configuration is required. Hashed assets are immutable; `index.html` may be cached briefly after a deploy.

The workflow uses Node 22 because Vite 8 requires `^20.19.0` or `>=22.12.0`. `actions/setup-node` caches dependencies from `web/package-lock.json`.

---

## 11. Known Limitations / Next Steps

1. **All six towers visually reuse the same E04A 4-door geometry.** E06B/E08A/E12A exist only as instance names and removed proxy meshes. If accurate door tiers matter, regenerate those models in Blender. The sizing card/tooltips still report each tower's published spec, so non-E04A towers show dimensions that do not match their visible door layout.
2. The kiosk is a dark box with a decorative screen. There is no real booking, payment, QR, or door-unlock flow yet.
3. There is only one suitcase and one occupancy slot. Multiple bags/occupancy persistence would require extending `DemoController`.
4. The right-door badge/LED offsets are patched at runtime. Confirm this against any regenerated GLB.
5. The room is intentionally white/bright. Additional contrast, decals, or environment art can be added without changing interaction logic.
6. There is no loading fallback for browsers without WebGL beyond the error message in the loading overlay.
7. The debug API is client-side only and gated by `?debug=1`; remove it if the demo is used in a sensitive context.

---

## 12. Frequently Useful Facts

- `web/public/models/` is git-ignored and generated. Never edit it directly.
- The room GLB is the single source of lockers; the guide's instancing boilerplate is outdated.
- Door names can have `_1`, `_2`, etc. suffixes from `GLTFLoader`.
- Door 02/04 hardware must be fixed at load time.
- `pendingStow` must be cleared on deselect/reset.
- Hidden cutaway walls must be filtered from raycasts.
- Mobile FOV is wider than desktop automatically.
- `Reset` restores the cutaway and the overview camera.
- The preview server used during implementation runs at `http://localhost:4173/` when active.
