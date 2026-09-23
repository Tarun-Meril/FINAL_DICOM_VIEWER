// Shim for the 'globalthis' npm package.
// The real package exports a FUNCTION that returns globalThis.
// Some code calls it: const g = require('globalthis')(); 
// Some code uses it directly: import globalThis from 'globalthis';
// This shim must handle both patterns.
const getGlobal = () => globalThis;
getGlobal.shim = () => globalThis;
export default getGlobal;
export { getGlobal as getPolyfill };
