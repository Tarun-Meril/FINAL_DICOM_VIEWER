#!/usr/bin/env node
/**
 * Synthetic CT/MR phantom generator (DICOM P10, Explicit VR Little Endian).
 *
 * Writes a volumetric series containing a geometric phantom with EXACTLY known
 * dimensions, so reformats can be validated end to end rather than by eye:
 *
 *   - a 50.0 mm bar along patient X  (measure it in axial and coronal)
 *   - a 50.0 mm bar along patient Y  (measure it in axial and sagittal)
 *   - a 50.0 mm bar along patient Z  (measure it in coronal and sagittal)
 *   - a high-density marker placed only on the patient's LEFT, so a mirrored
 *     coronal or sagittal reformat is immediately obvious
 *
 * Usage:
 *   node tools/make-phantom.mjs out-dir [--spacing 0.7,0.7,2.5] [--slices 80]
 *                                       [--tilt 15] [--oblique 20]
 *                                       [--missing 40] [--modality MR]
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const outDir = args[0] ?? 'phantom';
const opt = (name, fallback) => {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const [sx, sy, sz] = opt('spacing', '0.7,0.7,2.5').split(',').map(Number);
const slices = Number(opt('slices', '80'));
const tiltDeg = Number(opt('tilt', '0'));
const obliqueDeg = Number(opt('oblique', '0'));
const missingAt = opt('missing', '') === '' ? -1 : Number(opt('missing', ''));
const modality = opt('modality', 'CT');
const rows = 256;
const columns = 256;

const BACKSLASH = String.fromCharCode(92);
const te = new TextEncoder();

const SHORT_VR = new Set([
  'AE', 'AS', 'AT', 'CS', 'DA', 'DS', 'DT', 'FL', 'FD', 'IS', 'LO', 'LT',
  'PN', 'SH', 'SL', 'SS', 'ST', 'TM', 'UI', 'UL', 'US',
]);

function padText(s) {
  return s.length % 2 ? s + ' ' : s;
}

function element(group, el, vr, value) {
  const bytes = typeof value === 'string' ? te.encode(padText(value)) : value;
  const isShort = SHORT_VR.has(vr);
  const header = Buffer.alloc(isShort ? 8 : 12);
  header.writeUInt16LE(group, 0);
  header.writeUInt16LE(el, 2);
  header.write(vr, 4, 'latin1');
  if (isShort) {
    header.writeUInt16LE(bytes.length, 6);
  } else {
    header.writeUInt16LE(0, 6);
    header.writeUInt32LE(bytes.length, 8);
  }
  return Buffer.concat([header, Buffer.from(bytes)]);
}

function u16(v) {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(v, 0);
  return b;
}

function u32(v) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(v, 0);
  return b;
}

function normalize(v) {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
}

function rotateY(v, deg) {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
}

const rowDirection = normalize(rotateY([1, 0, 0], obliqueDeg));
const columnDirection = normalize(rotateY([0, 1, 0], obliqueDeg));
const sliceNormal = normalize([
  rowDirection[1] * columnDirection[2] - rowDirection[2] * columnDirection[1],
  rowDirection[2] * columnDirection[0] - rowDirection[0] * columnDirection[2],
  rowDirection[0] * columnDirection[1] - rowDirection[1] * columnDirection[0],
]);

// Gantry tilt: slice origins march obliquely while the slices stay parallel.
const tiltShift = Math.tan((tiltDeg * Math.PI) / 180) * sz;

const originX = (-(columns - 1) * sx) / 2;
const originY = (-(rows - 1) * sy) / 2;
const originZ = (-(slices - 1) * sz) / 2;

const AIR = 0;        // -1024 HU with intercept -1024
const WATER = 1024;   // 0 HU
const BAR = 1124;     // 100 HU
const MARKER = 2024;  // 1000 HU

function buildSlice(k) {
  const data = new Uint16Array(rows * columns);
  const z = originZ + k * sz;
  for (let j = 0; j < rows; j++) {
    const y = originY + j * sy;
    for (let i = 0; i < columns; i++) {
      const x = originX + i * sx;
      let value = AIR;

      if ((x / 80) ** 2 + (y / 60) ** 2 <= 1) value = WATER;

      if (Math.abs(x) <= 25 && Math.abs(y) <= 3 && Math.abs(z) <= 3) value = BAR;
      if (Math.abs(y) <= 25 && Math.abs(x) <= 3 && Math.abs(z) <= 3) value = BAR;
      if (Math.abs(z) <= 25 && Math.abs(x - 40) <= 3 && Math.abs(y) <= 3) value = BAR;

      if (x > 55 && x < 70 && Math.abs(y + 35) < 8 && Math.abs(z) < 15) value = MARKER;

      data[j * columns + i] = value;
    }
  }
  return data;
}

mkdirSync(outDir, { recursive: true });

const studyUID = '1.2.826.0.1.3680043.8.498.1';
const seriesUID = '1.2.826.0.1.3680043.8.498.2';
const forUID = '1.2.826.0.1.3680043.8.498.3';
const sopClass =
  modality === 'CT' ? '1.2.840.10008.5.1.4.1.1.2' : '1.2.840.10008.5.1.4.1.1.4';

let written = 0;
for (let k = 0; k < slices; k++) {
  if (k === missingAt) continue;

  const sopUID = '1.2.826.0.1.3680043.8.498.4.' + (k + 1);
  const position = [
    originX + sliceNormal[0] * k * sz,
    originY + sliceNormal[1] * k * sz + tiltShift * k,
    originZ + sliceNormal[2] * k * sz,
  ];

  const pixels = buildSlice(k);
  const pixelBytes = Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength);

  const dataset = Buffer.concat([
    element(0x0008, 0x0008, 'CS', ['ORIGINAL', 'PRIMARY', 'AXIAL'].join(BACKSLASH)),
    element(0x0008, 0x0016, 'UI', sopClass),
    element(0x0008, 0x0018, 'UI', sopUID),
    element(0x0008, 0x0020, 'DA', '20260101'),
    element(0x0008, 0x0030, 'TM', '120000'),
    element(0x0008, 0x0060, 'CS', modality),
    element(0x0008, 0x1030, 'LO', 'MPR Geometry Phantom'),
    element(0x0008, 0x103e, 'LO', 'Phantom ' + sx + 'x' + sy + 'x' + sz),
    element(0x0010, 0x0010, 'PN', 'PHANTOM^GEOMETRY'),
    element(0x0010, 0x0020, 'LO', 'MPR-TEST-001'),
    element(0x0010, 0x0040, 'CS', 'O'),
    element(0x0018, 0x0050, 'DS', String(sz)),
    element(0x0018, 0x0088, 'DS', String(sz)),
    element(0x0018, 0x5100, 'CS', 'HFS'),
    element(0x0020, 0x000d, 'UI', studyUID),
    element(0x0020, 0x000e, 'UI', seriesUID),
    element(0x0020, 0x0011, 'IS', '1'),
    element(0x0020, 0x0013, 'IS', String(k + 1)),
    element(0x0020, 0x0032, 'DS', position.map((v) => v.toFixed(6)).join(BACKSLASH)),
    element(
      0x0020,
      0x0037,
      'DS',
      rowDirection
        .concat(columnDirection)
        .map((v) => v.toFixed(8))
        .join(BACKSLASH),
    ),
    element(0x0020, 0x0052, 'UI', forUID),
    element(0x0020, 0x1041, 'DS', position[2].toFixed(6)),
    element(0x0028, 0x0002, 'US', u16(1)),
    element(0x0028, 0x0004, 'CS', 'MONOCHROME2'),
    element(0x0028, 0x0010, 'US', u16(rows)),
    element(0x0028, 0x0011, 'US', u16(columns)),
    // Pixel Spacing is [between rows, between columns].
    element(0x0028, 0x0030, 'DS', String(sy) + BACKSLASH + String(sx)),
    element(0x0028, 0x0100, 'US', u16(16)),
    element(0x0028, 0x0101, 'US', u16(16)),
    element(0x0028, 0x0102, 'US', u16(15)),
    element(0x0028, 0x0103, 'US', u16(0)),
    element(0x0028, 0x1050, 'DS', '40'),
    element(0x0028, 0x1051, 'DS', '400'),
    element(0x0028, 0x1052, 'DS', '-1024'),
    element(0x0028, 0x1053, 'DS', '1'),
    element(0x7fe0, 0x0010, 'OW', pixelBytes),
  ]);

  const metaElements = Buffer.concat([
    element(0x0002, 0x0001, 'OB', Buffer.from([0x00, 0x01])),
    element(0x0002, 0x0002, 'UI', sopClass),
    element(0x0002, 0x0003, 'UI', sopUID),
    element(0x0002, 0x0010, 'UI', '1.2.840.10008.1.2.1'),
    element(0x0002, 0x0012, 'UI', '1.2.826.0.1.3680043.8.498.99'),
    element(0x0002, 0x0013, 'SH', 'MERILVIEW-PHANTOM'),
  ]);

  const meta = Buffer.concat([
    element(0x0002, 0x0000, 'UL', u32(metaElements.length)),
    metaElements,
  ]);

  const file = Buffer.concat([
    Buffer.alloc(128),
    Buffer.from('DICM'),
    meta,
    dataset,
  ]);

  writeFileSync(join(outDir, 'slice-' + String(k).padStart(4, '0') + '.dcm'), file);
  written++;
}

console.log(
  'Wrote ' + written + ' ' + modality + ' slices to ' + outDir + '\n' +
    '  matrix      ' + columns + ' x ' + rows + ' x ' + written + '\n' +
    '  spacing     ' + sx + ' x ' + sy + ' x ' + sz + ' mm\n' +
    '  oblique     ' + obliqueDeg + ' deg   gantry tilt ' + tiltDeg + ' deg\n' +
    (missingAt >= 0 ? '  missing     slice index ' + missingAt + '\n' : '') +
    '  phantom     three 50.00 mm bars (X, Y, Z) + left-side high-density marker',
);
