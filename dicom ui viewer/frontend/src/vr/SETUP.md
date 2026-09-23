# Integrated 3D VR — setup

The VR rendering engine was already in this project at `src/3d/`. This adds the
UI + DICOM-ingest layer (`src/vr/`) and wires the VR toolbar button to render it
directly, replacing the iframe to localhost:5173.

## 1. Install the four new packages

    npm i @kitware/vtk.js@36.14.2 zustand@5.0.15 fflate@0.8.3 jpeg-lossless-decoder-js@2.1.2

The three @cornerstonejs/codec-* packages VR needs are already installed.

## 2. Stage the codec WASM  (REQUIRED — VR cannot decode without it)

Add to package.json scripts:

    "prepare:wasm": "node copy-vr-wasm.mjs",
    "dev":   "npm run prepare:wasm && vite",
    "build": "npm run prepare:wasm && tsc && vite build"

Then run `npm run prepare:wasm` once. It copies the .wasm binaries into
public/wasm/ and appends ESM exports to the codec glue files.

## 3. Aliases

vite.config.ts now defines @3d -> src/3d and @vr -> src/vr. If you use
tsconfig paths for editor resolution, mirror them there:

    "paths": { "@3d/*": ["./src/3d/*"], "@vr/*": ["./src/vr/*"] }

## Verify

- Open a CT study, click VR -> the MedView VR workstation renders in place.
- Presets, A/P/L/R/S/I, perspective/ortho, Fit, Hide Volume all work.
- "Back to 2D" returns to the 2D viewer.
- /vr?studyUID=...&seriesUID=... still works standalone.
- MPR and 2D are unaffected.

## Notes

- theme.css is scoped to `.medview-vr` so it cannot restyle the main viewer.
- VR uses VTK.js and its own decoders; it does not touch the Cornerstone
  decoder used by 2D/MPR, so it cannot regress them.
- MedViewVRWorkspace.tsx is left in place but no longer used.
