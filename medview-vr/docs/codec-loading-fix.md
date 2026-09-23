# Codec Loading Fixes — MedView VR

## Problem Summary

Users encountered a "factory is not a function" error with code "INTERNAL" at "slice id 1" during DICOM frame decoding. This error occurred when the application attempted to decode the first frame of a CT dataset using the Cornerstone.js codec modules.

## Root Cause Analysis

The error indicated that the codec factory function (from `@cornerstonejs/codec-openjpeg`, `@cornerstonejs/codec-charls`, or `@cornerstonejs/codec-libjpeg-turbo-8bit`) was not being properly loaded or exported in the Worker context.

### Investigation Steps

1. **Module Import Testing**: Verified that codec modules export callable factory functions when imported via Node.js
2. **Factory Instantiation Testing**: Confirmed that calling the factory with the QUIET config works correctly in Node.js
3. **Fallback Mechanism Testing**: Verified that the WASM→JavaScript fallback mechanism works in Node.js

### Key Findings

- In Node.js, all codec modules correctly export their factory functions via `module.exports.default`
- The factory functions correctly instantiate with the QUIET configuration object
- Both WASM and JavaScript variants load and instantiate correctly
- In browser Worker context, there may be differences in how Vite bundles and resolves these UMD modules

## Fixes Applied

### 1. Improved `instantiate()` Function Error Handling

**File**: `src/dicom/decode/codecs.ts`

Added comprehensive validation of the factory function with detailed error logging:

```typescript
// Handle different module export styles:
// 1. ES module default export: m.default is the factory
// 2. CommonJS/UMD: m itself is the factory
let factory = m.default;

// If no default export, try the module itself
if (typeof factory !== 'function') {
  factory = m;
}

// Validate and log detailed information
if (typeof factory !== 'function') {
  console.error('[codecs] Module did not export a factory function', {
    moduleKeys: Object.keys(m),
    defaultType: typeof m?.default,
    moduleType: typeof m,
    factoryType: typeof factory,
    moduleValue: m,
  });
  throw new Error(`Codec factory is not a function: got ${typeof factory}`);
}
```

**Benefits**:
- Provides detailed diagnostic information when module export is unexpected
- Handles both ES and CommonJS/UMD export patterns
- Helps identify which export pattern failed

### 2. Improved `baseUrl()` Function for Worker Context

**File**: `src/dicom/decode/codecs.ts`

Enhanced `baseUrl()` to handle Worker context where `import.meta` might not be available:

```typescript
function baseUrl(): string {
  // In a Worker, import.meta.env might not be available or might be different
  try {
    const base = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL;
    if (base) {
      return base.endsWith('/') ? base : `${base}/`;
    }
  } catch (e) {
    // import.meta might not be available in Worker
  }
  
  // Fallback: try to get the base from self.location in Worker context
  try {
    if (typeof self !== 'undefined' && (self as any).location) {
      const origin = (self as any).location.origin;
      return origin ? `${origin}/` : '/';
    }
  } catch (e) {
    // Not in Worker or location not available
  }
  
  return '/';
}
```

**Benefits**:
- Correctly determines base URL in Worker context
- WASM files are located at the correct path: `${origin}/wasm/filename.wasm`
- Gracefully falls back to `/` if location cannot be determined

### 3. Explicit Fallback Mechanism with Logging

**File**: `src/dicom/decode/codecs.ts`

Changed from promise `.catch()` chaining to explicit try-catch with detailed logging:

```typescript
async function loadOpenJpeg(): Promise<AnyModule> {
  if (!openjpegPromise) {
    openjpegPromise = (async () => {
      try {
        return await instantiate(() => import('@cornerstonejs/codec-openjpeg/decodewasmjs'));
      } catch (wasmError) {
        console.warn('[codecs] WASM OpenJPEG failed, trying JS fallback', wasmError);
        try {
          return await instantiate(() => import('@cornerstonejs/codec-openjpeg/decode'));
        } catch (jsError) {
          console.error('[codecs] Both OpenJPEG variants failed', { wasmError, jsError });
          throw jsError;
        }
      }
    })();
  }
  return openjpegPromise;
}
```

**Benefits**:
- Clear console logging shows which codec version is being attempted
- Helps identify whether WASM or JavaScript variant is failing
- Provides both error messages for debugging
- Caching prevents repeated load attempts

## Testing Recommendations

### Manual Testing

1. **Load a DICOM Study**: Test with the included test dataset to ensure normal frame decoding works
2. **Check Console Logs**: Monitor browser console for `[codecs]` prefix messages to understand codec loading
3. **Inspect Network Tab**: Verify WASM files are being loaded from `/wasm/` directory

### Automated Testing

Run the included test scripts:
- `test-codec-import.mjs`: Verifies module imports work correctly
- `test-codec-factory.mjs`: Tests factory instantiation
- `test-codec-fallback.mjs`: Simulates the fallback mechanism

## Known Limitations

- Tests run in Node.js; browser Worker behavior may differ
- WASM files must be served with correct MIME type (`application/wasm`)
- Cornerstone.js codec versions must match (all 1.x series should be compatible)

## Future Improvements

1. Add automatic codec version detection and reporting
2. Implement codec performance monitoring
3. Add fallback to pure JavaScript if both WASM and JS variants fail
4. Consider pre-loading codecs during application startup rather than on-demand

## Files Modified

- `src/dicom/decode/codecs.ts` — Main codec loading logic
- `vite.config.ts` — (no changes required; configuration already correct)

## Test Files Created

- `test-codec-import.mjs` — Tests module imports
- `test-codec-factory.mjs` — Tests factory instantiation
- `test-codec-fallback.mjs` — Tests fallback mechanism

## Related Issues

- #1: Original "factory is not a function" error at slice id 1
- Codec module loading in Worker context
- WASM file path resolution in various execution contexts
