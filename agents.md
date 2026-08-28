# Agents.md

Current-state guide for Workbench Studio. Use this as the working plan for the next implementation steps.

## 1. Product Summary

Workbench Studio is a frontend-only browser app for building a live composition from camera, microphone, and screen sources, arranging them on a canvas, and starting/stopping a live preview stream.

The app currently supports:
- Device discovery for cameras and microphones
- Adding multiple media sources as layers
- Capturing the screen as a source
- Dragging and resizing visual layers
- Switching between Create and Live modes
- Rendering the composition into an offscreen canvas
- Mixing audio into a single output stream
- Previewing the live output in a video element

## 2. Current Architecture

### Entry Files
- `index.html` defines the UI structure.
- `styles.css` defines the layout and visual styling.
- `script.js` contains all application logic.

### Runtime Model
- The app runs as a static browser page.
- No framework, build step, or backend is currently used.
- State lives in top-level JavaScript variables.
- Media is handled through browser APIs:
  - `navigator.mediaDevices.getUserMedia`
  - `navigator.mediaDevices.getDisplayMedia`
  - `navigator.mediaDevices.enumerateDevices`
  - `CanvasCaptureMediaStream`
  - `MediaRecorder`
  - `AudioContext`

### Main Data Structures
- `scene`: array of active layers/items.
- Each item tracks:
  - `id`
  - `type`
  - `label`
  - `stream`
  - `video`
  - `deviceId`
  - `x`, `y`
  - `width`, `height`
  - `shape`
  - `mirrored`
  - `zIndex`
  - `focused`
- Live state is tracked with globals such as:
  - `finalStream`
  - `liveRecorder`
  - `pendingChunks`
  - `isLiveActive`
  - `isStoppingLive`

## 3. Frontend Scope

### Responsibility
The frontend owns all user interaction, layout, composition, and local media processing.

### Responsibilities
- Render the full UI and responsive layout
- Discover available media devices
- Request camera, microphone, and screen permissions
- Build and manage scene items
- Drag, resize, focus, center, and reorder layers
- Render the composition into a canvas
- Mix local audio streams
- Control live start/stop state
- Preview the composed output locally

### Frontend Files
- `index.html`
- `styles.css`
- `script.js`

### Frontend Gaps
- `script.js` is still doing too much in one place.
- State is managed through mutable globals.
- The UI is not yet split into reusable modules.
- There is no persistence for scene layout or source settings.
- There are no automated tests for UI or media flows.

## 4. Backend Scope

### Current State
There is no backend implementation yet.

### Backend Responsibilities Planned
- Receive live chunks or stream data from the frontend
- Persist compositions and source metadata
- Store project/session state
- Support live transport or upload delivery
- Provide a future API for playback, history, or export

### Backend Gaps
- No upload endpoint exists yet
- No persistence layer exists yet
- No session or auth model exists yet
- No storage format has been defined yet

## 5. UI Structure

### Sidebar
The sidebar contains:
- Global mode tabs: `Create` and `Live`
- Device refresh button
- Camera list
- Microphone list
- Screen capture button
- Stop all button
- Workbench sizing controls
- Layer panel
- Live controls and status

### Main Stage
The right side contains two views:
- Workbench view for composition editing
- Live view for preview playback

### Canvas/Preview Areas
- `#workbench` is the visible composition surface.
- `#editor` is the DOM container for draggable tiles.
- `hiddenStreamCanvas` is the offscreen rendering surface used for live capture.
- `#previewVideo` renders the final composed stream.

## 6. Behavior Map

### Frontend Behavior
- The global tabs toggle between Create and Live panels.
- Create mode shows the workbench.
- Live mode shows the live preview area.
- `refreshDevices()` enumerates available media devices.
- Camera buttons call `startCamera(deviceId)`.
- Microphone buttons call `startMicrophone(deviceId, label)`.
- Cameras are added with video only.
- Microphones are added with audio only.
- Screen capture uses `getDisplayMedia({ video: true, audio: true })`.
- `render()` runs continuously with `requestAnimationFrame`.
- It draws visible non-audio layers into the hidden canvas.
- Audio sources are attached to a shared `AudioContext`.
- Each audio track is routed through a gain node into `audioDestination`.
- Start uses the hidden canvas track plus mixed audio tracks.
- `MediaRecorder` captures the combined stream.
- Recorded chunks are buffered in `pendingChunks`.
- Stop tears down the recorder and tracks, then clears the preview.

### Layer Controls
Each layer can be:
- Focused
- Moved in Z-order
- Centered
- Resized
- Mirrored for cameras
- Muted for audio sources
- Removed

## 7. Key Code Areas

### Frontend Files
- `index.html`
- `styles.css`
- `script.js`

### `script.js`
Important sections:
- DOM references and global state
- Tab switching
- Scaling and sizing logic
- Audio setup
- Canvas rendering
- Layer panel generation
- Scene item creation/removal
- Tile drag/resize behavior
- Live recording lifecycle
- Device refresh and source creation

### `styles.css`
Important sections:
- Two-column app layout
- Sidebar styling
- Workbench and live preview sizing
- Tile styles
- Layer panel styles
- Live status/preview styles

### `index.html`
Important sections:
- Sidebar controls
- Workbench view
- Live preview view
- Script and stylesheet inclusion

## 8. Current Strengths

- The app is simple to run and inspect.
- Media handling is already separated into reasonably clear phases:
  - input discovery
  - scene creation
  - render loop
  - live output
- The live composition uses an offscreen canvas, which is the right foundation for streaming.
- Layer control exists both visually and structurally.

## 9. Current Gaps / Risks

- `script.js` contains a lot of responsibilities in one file.
- Some DOM references appear stale or unused, which suggests partial refactors or old UI remnants.
- The live start/stop flow is complex and mixes UI state, recorder state, and cleanup logic.
- Backend delivery is not implemented yet.
- The composition model currently relies heavily on mutable globals.
- There is no persistence for layouts or source configurations.
- There are no automated tests.
- Some UI text and file comments still look like prototype language.

## 10. Proposed Next Steps

### Frontend Phase 1: Stabilize the Current App
- Remove dead DOM references and stale code paths.
- Normalize naming and clean up inconsistent UI text.
- Separate live state transitions into explicit helper functions.
- Add guardrails for recorder start/stop sequencing.
- Make the workbench sizing flow easier to reason about.

### Frontend Phase 2: Refactor for Maintainability
- Split `script.js` into modules:
  - `state`
  - `media`
  - `render`
  - `layers`
  - `live`
  - `ui`
- Move scene-item logic into a dedicated model.
- Reduce direct DOM mutation where possible.
- Add a small event or store layer for scene updates.

### Backend Phase 1: Define the API
- Decide how live chunks should be received.
- Define storage for compositions and source metadata.
- Specify session/project identifiers.
- Decide whether export, replay, or history is needed.

### Backend Phase 2: Implement Transport and Persistence
- Add an upload or streaming endpoint.
- Persist layouts and source settings.
- Store chunk data if the backend is responsible for recording.
- Add basic error handling and retry behavior.

### Backend Phase 3: Expand Product Behavior
- Support playback or archive views.
- Add project history.
- Add authentication if the app becomes shared or collaborative.

### Quality and Testing
- Add smoke tests for:
  - device refresh
  - adding/removing sources
  - live start/stop state transitions
  - resize and shape updates
- Add a browser-compatible dev workflow.
- Validate performance with multiple sources.

## 11. Working Notes for Future Agents

- Treat `script.js` as the source of truth unless the app is split into modules.
- Avoid breaking the live capture loop when changing rendering or tile logic.
- Be careful with cleanup:
  - stop media tracks
  - remove listeners
  - clear intervals
  - release recorder state
- If you change canvas size behavior, verify both visible layout and captured output.
- If you change audio behavior, verify volume, mute, and mixed output still work.
- If you add a backend, keep the frontend capture pipeline working independently until the transport is proven.

## 12. Suggested Implementation Order

1. Clean up stale references and dead branches.
2. Make live start/stop deterministic.
3. Extract scene-item and layer-panel logic.
4. Split frontend media/render/live concerns into modules.
5. Define the backend API and persistence model.
6. Add backend transport for live chunks.
7. Add persistence.
8. Add tests.
