# CLAUDE.md

Guidance for coding agents working in this repo. The Next.js app lives in `web/`; read `web/AGENTS.md` before touching Next.js code (this Next version has breaking changes).

## Commits

- Conventional Commits: `feat(device): …`, `fix(screen): …`, `docs: …`, `chore(web): …`.
- No `Co-Authored-By` lines.
- Small, focused commits. Push only when asked.

## 3D device (`web/components/device/`)

### Measurements

- Every number (sizes, positions, timings, colors, camera limits) lives in `device.config.ts`. Units are centimeters (1 scene unit ≈ 1 cm). Don't hard-code measurements in components; add a field to the config instead.
- Frames: the hinge axis is vertical at x = 0. The **controls half** (right, `BaseHalf.tsx`) is fixed and spans x ∈ [0, 6]. The **screen half** (left, `LidHalf.tsx`) is the lid: it pivots on the hinge and opens to the left like a book cover. Each half's inner face is at local z = 0 with the body going to -z. The pivot sits `GAP / 2` in front of the inner faces so the closed halves end up `GAP` apart.
- Derived positions (`SCREEN_CENTER`, `SECONDARY_CENTER`, `PILL_Y`) are computed at the bottom of the config.

### Pieces

`Device.tsx` (root: lid spring, idle float/sway, cover click) → `BaseHalf.tsx`, `LidHalf.tsx`, `Hinge.tsx`, `MainScreen.tsx`, `SecondaryScreen.tsx`, `DPad.tsx`, `ActionButton.tsx`, `PillButton.tsx`, `SpeakerGrill.tsx` (+ `CryEmitter.tsx`), `StatusLed.tsx`, `Cover.tsx`. Shared: `materials.tsx`, `geometry.ts`, `PressableButton.tsx`, `CameraRig.tsx`, `DeviceScene.tsx` (Canvas, lazy-loaded by `DeviceExperience.tsx`).

### Layouts

- `hooks/useDeviceLayout.ts` decides between the **split** layout (desktop: controls on the right half) and the **compact** one (touch + portrait: controls under the screen on the left half, lid flat, camera on that half, rotation off). `?layout=compact|split` forces one.
- Control positions for both live in `device.config.ts` (`SPLIT_CONTROLS`, `COMPACT_CONTROLS`) and are rendered by `Controls.tsx`.

### Swapping in a Blender .glb

- Set `DEVICE_GLB_URL` in `ModelPart.tsx` (e.g. `"/models/device.glb"`, file in `web/public/models/`).
- Every visual is wrapped in `<ModelPart name="…">`. When the .glb has a node with that name, the node replaces the procedural fallback; logic (events, animation, screen anchor) stays in the parent groups.
- Expected node names: `lid_body`, `base_body`, `hinge`, `cover`, `screen_bezel`, `screen_secondary`, `speaker`, `status_led`, `dpad`, `button_a`, `button_b`, `button_menu`, `button_zoom`.
- Model each node in its half's inner frame with its origin where the procedural part's origin is (e.g. `button_a` centered on its button position, base of the cap at z = 0). Click detection uses the wrapping groups (`userData.part`), so the nodes need no custom properties.

### State and input

- `stores/deviceState.ts` is the phase machine: `CLOSED → OPENING → OPEN → ZOOMING_IN → ZOOMED → ZOOMING_OUT → OPEN → CLOSING → CLOSED`. Transitional phases end when their animation calls `finish(phase)`: the lid spring in `Device.tsx` finishes OPENING/CLOSING, `CameraRig.tsx` finishes ZOOMING_IN/ZOOMING_OUT.
- `stores/deviceInput.ts` emits `UP, DOWN, LEFT, RIGHT, A, B, MENU, ZOOM`. 3D buttons, keyboard (`hooks/useKeyboardInput.ts`) and gamepad (`hooks/useGamepadInput.ts`) all call `press`/`release`. Held directions repeat (300 ms, then every 90 ms); OS key repeat is ignored.
- Handlers subscribe with a priority and return `true` to consume: observers at 1000 (sound, LED) never consume, the screen at 10, the device controller (`hooks/useDeviceController.ts`) at 0 as the fallback. The screen only receives events in OPEN or ZOOMED with the screen powered on.

### Adding a button event

1. Add the name to `DEVICE_BUTTONS` in `stores/deviceInput.ts`.
2. Map a key in `KEY_MAP` (`useKeyboardInput.ts`) and, if useful, a gamepad index in `BUTTON_MAP` (`useGamepadInput.ts`).
3. Add a 3D button: a `<PressableButton button="NEW">` around its visual (or a new piece component), positioned from `device.config.ts`.
4. Handle it in `DeviceScreen.tsx` (UI) or `useDeviceController.ts` (device-level), and pick a sound in `useSoundEffects.ts`.

### Rules of thumb

- Respect `prefers-reduced-motion` (`hooks/useReducedMotion.ts`): no float, instant hinge/camera, no boot animation.
- The main screen is a drei `<Html transform occlude="blending">`. Keep any mesh behind it well separated in z (the blending "hole" must win the depth test) and don't add a scene background (the canvas is transparent; the page provides the light/dark background).
- Sounds go through `lib/sfx.ts` / `audioEnabled()`; audio unlocks on the first user gesture.
- After changes: `npx tsc --noEmit` and `npx eslint .` in `web/` must be clean.
