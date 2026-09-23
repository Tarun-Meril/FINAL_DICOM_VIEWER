/* Ambient declarations for WASM codec glue that ships without type definitions. */
declare module '@cornerstonejs/codec-openjpeg/decode' {
  const factory: () => Promise<Record<string, any>>;
  export default factory;
}
declare module '@cornerstonejs/codec-charls/decode' {
  const factory: () => Promise<Record<string, any>>;
  export default factory;
}
declare module '@cornerstonejs/codec-libjpeg-turbo-8bit/decode' {
  const factory: () => Promise<Record<string, any>>;
  export default factory;
}
declare module 'jpeg-lossless-decoder-js' {
  const mod: any;
  export default mod;
  export const Decoder: any;
}

/* vtk.js filters that ship without .d.ts files. */
declare module '@kitware/vtk.js/Filters/General/ImageMarchingCubes' {
  const vtkImageMarchingCubes: any;
  export default vtkImageMarchingCubes;
}
declare module '@kitware/vtk.js/Filters/General/WindowedSincPolyDataFilter' {
  const vtkWindowedSincPolyDataFilter: any;
  export default vtkWindowedSincPolyDataFilter;
}
declare module '@cornerstonejs/codec-openjpeg/decodewasmjs' {
  const factory: (cfg?: unknown) => Promise<Record<string, any>>;
  export default factory;
}
declare module '@cornerstonejs/codec-charls/decodewasmjs' {
  const factory: (cfg?: unknown) => Promise<Record<string, any>>;
  export default factory;
}
declare module '@cornerstonejs/codec-libjpeg-turbo-8bit/decodewasmjs' {
  const factory: (cfg?: unknown) => Promise<Record<string, any>>;
  export default factory;
}
