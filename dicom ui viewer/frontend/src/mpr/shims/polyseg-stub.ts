/**
 * Stub for @icr/polyseg-wasm.
 *
 * @cornerstonejs/tools statically imports the polygon-segmentation WebAssembly
 * module. This phase implements 2D MPR only — there is no segmentation, no
 * surface extraction and no volume rendering — so the wasm binary is replaced
 * with a stub. It is deliberately loud: if any future code path actually tries
 * to use segmentation, it fails immediately instead of silently pulling a 3D
 * feature into the MPR build.
 */
export default class ICRPolySegStub {
  initialize(): Promise<void> {
    return Promise.reject(
      new Error(
        'Segmentation (polyseg) is intentionally excluded from the MPR module.',
      ),
    );
  }
}
