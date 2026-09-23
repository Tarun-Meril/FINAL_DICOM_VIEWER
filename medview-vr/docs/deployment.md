# Running, building and deploying

## Local development

```bash
npm install
npm run dev
```

`npm run dev` first stages the WASM codec binaries into `public/wasm/` (see below), then
starts Vite on <http://localhost:5173> with hot module replacement.

## Production build

```bash
npm run build      # stage WASM → typecheck (strict) → vite build
npm run preview    # serve dist/ on http://localhost:4173
```

The build fails on any TypeScript error. Output is a static bundle in `dist/`:

```
dist/
  index.html
  assets/        hashed JS, CSS, source maps, worker bundles, emscripten glue
  wasm/          openjpegwasm_decode.wasm, charlswasm_decode.wasm, libjpegturbowasm_decode.wasm
```

### Why `public/wasm`

The emscripten glue for each codec resolves its `.wasm` binary relative to its own script
URL. Vite content-hashes and relocates the glue, which breaks that lookup.
`tools/copy-wasm.mjs` stages the three binaries under `public/wasm/` and
`codecs.ts` passes a `locateFile` callback that points at `${BASE_URL}wasm/<file>`. This
runs automatically before `dev` and `build`; run it by hand with `npm run prepare:wasm`.

## Deploying

`dist/` is a static site. Any static host works — nginx, Apache, S3 + CloudFront, GitHub
Pages, an intranet file share served over HTTP.

**Serve `.wasm` as `application/wasm`.** Without the correct MIME type the browser falls
back from streaming instantiation and, on some configurations, refuses the module
outright. For nginx:

```nginx
types { application/wasm wasm; }

server {
  root /srv/medview-vr;
  index index.html;

  location / { try_files $uri $uri/ /index.html; }

  # Hashed assets are immutable; the entry document is not.
  location /assets/ { add_header Cache-Control "public, max-age=31536000, immutable"; }
  location /wasm/   { add_header Cache-Control "public, max-age=31536000, immutable"; }
  location = /index.html { add_header Cache-Control "no-cache"; }
}
```

### Sub-path deployment

To serve from `https://host/medview/`, build with a base path:

```bash
npm run prepare:wasm && npx vite build --base=/medview/
```

`locateFile` reads `import.meta.env.BASE_URL`, so the codec binaries resolve correctly.

### HTTPS

Not required by the application — there is no cross-origin isolation, no
`SharedArrayBuffer` and no service worker — but deploy over HTTPS anyway: this is a tool
that opens patient data.

### Content Security Policy

The application loads no third-party code at runtime. A strict policy works, with one
allowance for WASM:

```
default-src 'self';
script-src 'self' 'wasm-unsafe-eval';
worker-src 'self' blob:;
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
connect-src 'self';
```

`connect-src 'self'` is deliberate: it makes the "DICOM never leaves the machine"
guarantee enforceable by the browser rather than only by code review.

## Environment variables

| Variable | Used by | Purpose |
|---|---|---|
| `MEDVIEW_TEST_DATASET` | vitest, playwright | Directory or archive of DICOM files for the integration and E2E suites |
| `MEDVIEW_E2E_SLICES` | playwright | Slice cap for the E2E run (default 48) |
| `CHROME_PATH` | playwright, `validate-render` | Chromium binary to drive |

## Verification before release

```bash
npm run typecheck
npm test
MEDVIEW_TEST_DATASET=/path/to/study npm test
npm run build
CHROME_PATH=/path/to/chrome npm run e2e
CHROME_PATH=/path/to/chrome npm run validate:render -- /path/to/study ./validation-output
```
