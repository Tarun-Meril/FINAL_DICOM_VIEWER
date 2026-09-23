// Node-side stub for @cornerstonejs/core. The geometry pipeline only touches
// metaData.addProvider at module scope; nothing else is exercised off-browser.
export const metaData = { addProvider: (_p: unknown, _pri?: number) => {} };
export const Enums = {
  BlendModes: {
    COMPOSITE: 0,
    MAXIMUM_INTENSITY_BLEND: 1,
    MINIMUM_INTENSITY_BLEND: 2,
    AVERAGE_INTENSITY_BLEND: 3,
  },
  InterpolationType: { NEAREST: 0, LINEAR: 1 },
  ViewportType: { ORTHOGRAPHIC: 'orthographic' },
  Events: {
    IMAGE_VOLUME_LOADING_COMPLETED: 'IMAGE_VOLUME_LOADING_COMPLETED',
    CAMERA_MODIFIED: 'CAMERA_MODIFIED',
    IMAGE_RENDERED: 'IMAGE_RENDERED',
    VOI_MODIFIED: 'VOI_MODIFIED',
  },
};
export const cache = { getVolume: (_id: string) => undefined, removeVolumeLoadObject: (_id: string) => {} };
export const eventTarget = { addEventListener: () => {}, removeEventListener: () => {} };
export const volumeLoader = { createAndCacheVolume: async () => ({ load: () => {} }) };
export const imageLoader = { registerImageLoader: () => {} };
export const setVolumesForViewports = async () => {};
export class RenderingEngine { destroy() {} render() {} }
export const init = async () => {};
