// Node-side stub: the geometry pipeline never calls the loader, but
// loadStudy.ts imports it at module scope for the browser file path.
export const wadouri = { fileManager: { add: (_f: unknown) => 'stub:imageId' } };
export default { wadouri };
