/**
 * High-Fidelity 3D Anatomical Volumetric DICOM Generator for MerilView Cloud & Shareable Links.
 *
 * Generates Part-10 compliant DICOM slices with realistic multi-planar human anatomy:
 * - True 3D Vertebral Column / Spine with vertebral bodies, spinal canal, and disc spaces
 * - Realistic thoracic rib cage (upper slices) and pelvic iliac crests (lower slices)
 * - Contrast-enhanced Liver, Spleen, Kidneys (with renal pelvis), Aorta, IVC, and Bladder
 * - Natural anatomical body contouring along Z (no artificial solid cylindrical borders)
 *
 * This ensures that Axial, Coronal, and Sagittal orthogonal reformats in MPR, as well
 * as 3D Volume Raymarching (VR), render with clinical realism and proportional human geometry.
 */

const encoder = new TextEncoder();

export interface SyntheticSliceOptions {
  studyUid?: string;
  seriesUid?: string;
  sopUid?: string;
  patientName?: string;
  patientId?: string;
  instanceNumber: number;
  sliceIndex: number;
  sliceCount: number;
  sliceZ: number;
  rows?: number;
  columns?: number;
  sliceThickness?: number;
  pixelSpacing?: string;
  windowCenter?: number;
  windowWidth?: number;
  rescaleIntercept?: number;
  rescaleSlope?: number;
}

/**
 * Calculates the Hounsfield Unit (HU) for any voxel in 3D patient space.
 * tz ranges from 0.0 (Inferior / Pelvis) to 1.0 (Superior / Lower Thorax).
 */
export function computeAnatomicalVoxelHU(
  x: number,
  y: number,
  tz: number,
  cols: number = 256,
  rows: number = 256
): number {
  const cx = cols / 2;
  const cy = rows / 2;

  // Natural anatomical body contour varying with height tz
  const rx = cols * (0.37 + 0.04 * Math.sin(tz * Math.PI) + 0.02 * (1 - tz));
  const ry = rows * (0.28 + 0.03 * Math.sin(tz * Math.PI));

  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  const bodyDist = Math.hypot(dx, dy);

  // 1. Outside body: Air (-1000 HU)
  if (bodyDist >= 1.0) return -1000;

  // 2. Skin layer (0.97 <= bodyDist < 1.0)
  if (bodyDist >= 0.97) return -40 + Math.sin(x * 0.1) * 8;

  // 3. Subcutaneous fat (0.91 <= bodyDist < 0.97)
  if (bodyDist >= 0.91) return -90 + (x % 5);

  // 4. Abdominal muscle wall & peripheral skeleton (0.86 <= bodyDist < 0.91)
  if (bodyDist >= 0.86) {
    // Discrete Ribs in upper thorax (tz > 0.55)
    if (tz > 0.55) {
      const angle = Math.atan2(dy, dx);
      const ribPhase = Math.sin(angle * 7 + tz * 16);
      if (ribPhase > 0.55 && bodyDist > 0.87) {
        return 880; // Cortical bone of rib
      }
    }
    // Iliac crest bone in pelvis (tz < 0.32)
    if (tz < 0.32 && Math.abs(dx) > 0.65 && dy > -0.2) {
      return 920; // Iliac bone
    }
    return 42; // Abdominal wall musculature
  }

  // --- INTERNAL SKELETAL SYSTEM ---

  // 5. Vertebral Column / Spine (posterior midline, runs continuously through entire height tz)
  const spineCx = cx;
  const spineCy = cy + ry * 0.42;
  const sDx = (x - spineCx) / (cols * 0.075);
  const sDy = (y - spineCy) / (rows * 0.07);
  const spineDist = Math.hypot(sDx, sDy);

  if (spineDist < 1.0) {
    // Intervertebral disc space vs vertebral body bone
    const discCycle = Math.sin(tz * 32);
    if (discCycle > 0.75) {
      return 65; // Intervertebral disc
    }
    // Spinal canal / Thecal sac (CSF)
    const canalDy = (y - (spineCy + 6)) / 6;
    const canalDx = (x - spineCx) / 6;
    if (Math.hypot(canalDx, canalDy) < 1.0) {
      return 15; // CSF density in thecal sac
    }
    // Vertebral body cortical rim vs cancellous trabecular bone
    if (spineDist > 0.8) return 920; // Dense vertebral cortex
    return 280; // Cancellous marrow
  }

  // Spinous process (posterior bony projection)
  if (Math.abs(x - spineCx) < 4 && y >= spineCy + ry * 0.15 && y <= spineCy + ry * 0.35) {
    return 800; // Posterior spinous process
  }

  // --- MAJOR VASCULATURE ---

  // 6. Abdominal Aorta & Inferior Vena Cava (anterior to spine)
  const aortaDx = (x - (spineCx - 10)) / 6;
  const aortaDy = (y - (spineCy - 12)) / 6;
  if (Math.hypot(aortaDx, aortaDy) < 1.0) return 140; // Contrast-enhanced aorta

  const ivcDx = (x - (spineCx + 10)) / 7;
  const ivcDy = (y - (spineCy - 11)) / 7;
  if (Math.hypot(ivcDx, ivcDy) < 1.0) return 110; // IVC

  // --- VISCERAL ORGANS ---

  // 7. Lower chest / Lung bases (tz > 0.82)
  if (tz > 0.82) {
    const lungL_dx = (x - (cx - rx * 0.45)) / (rx * 0.32);
    const lungL_dy = (y - (cy - ry * 0.05)) / (ry * 0.55);
    const lungR_dx = (x - (cx + rx * 0.45)) / (rx * 0.32);
    const lungR_dy = (y - (cy - ry * 0.05)) / (ry * 0.55);
    if (Math.hypot(lungL_dx, lungL_dy) < 1.0 || Math.hypot(lungR_dx, lungR_dy) < 1.0) {
      return -780; // Lung parenchyma
    }
  }

  // 8. Liver (Right upper quadrant: tz 0.38 to 0.88, patient right: x < cx + 5)
  if (tz >= 0.38 && tz <= 0.88 && x < cx + rx * 0.15) {
    const liverDx = (x - (cx - rx * 0.42)) / (rx * 0.48);
    const liverDy = (y - (cy - ry * 0.05)) / (ry * 0.70);
    if (Math.hypot(liverDx, liverDy) < 1.0 && y < spineCy - 5) {
      return 58; // Liver parenchyma
    }
  }

  // 9. Spleen (Left upper quadrant: tz 0.55 to 0.88, patient left posterior: x > cx + 0.32*rx)
  if (tz >= 0.55 && tz <= 0.88 && x > cx + rx * 0.32 && y > cy - ry * 0.1) {
    const spleenDx = (x - (cx + rx * 0.58)) / (rx * 0.28);
    const spleenDy = (y - (cy + ry * 0.15)) / (ry * 0.40);
    if (Math.hypot(spleenDx, spleenDy) < 1.0) {
      return 48; // Spleen parenchyma
    }
  }

  // 10. Kidneys (Bilateral retroperitoneal: tz 0.32 to 0.62)
  if (tz >= 0.32 && tz <= 0.62) {
    // Right kidney (tz 0.32 - 0.56)
    if (tz <= 0.56) {
      const rkDx = (x - (cx - rx * 0.48)) / (rx * 0.22);
      const rkDy = (y - (cy + ry * 0.22)) / (ry * 0.30);
      const rkDist = Math.hypot(rkDx, rkDy);
      if (rkDist < 1.0) {
        if (rkDist < 0.35) return 15; // Renal pelvis / collecting system
        return 120; // Contrast-enhanced renal parenchyma
      }
    }
    // Left kidney (tz 0.38 - 0.62)
    if (tz >= 0.38) {
      const lkDx = (x - (cx + rx * 0.48)) / (rx * 0.22);
      const lkDy = (y - (cy + ry * 0.18)) / (ry * 0.30);
      const lkDist = Math.hypot(lkDx, lkDy);
      if (lkDist < 1.0) {
        if (lkDist < 0.35) return 15; // Renal pelvis
        return 120; // Contrast-enhanced parenchyma
      }
    }
  }

  // 11. Urinary Bladder (Pelvic midline: tz 0.05 to 0.22)
  if (tz >= 0.05 && tz <= 0.22) {
    const bDx = (x - cx) / (rx * 0.30);
    const bDy = (y - (cy - ry * 0.20)) / (ry * 0.32);
    if (Math.hypot(bDx, bDy) < 1.0) {
      return 12; // Fluid / Urine
    }
  }

  // 12. Mesenteric background: fat base with mottled bowel loops
  const noise = Math.sin(x * 0.3) * Math.cos(y * 0.3) * Math.sin(tz * 10);
  if (noise > 0.4) return 25; // Bowel wall
  if (noise > 0.85) return -1000; // Bowel intraluminal gas
  return -95; // Mesenteric / Retroperitoneal fat
}

export function createSyntheticDicomSliceBuffer(opts: SyntheticSliceOptions): ArrayBuffer {
  const {
    studyUid = '1.3.46.670589.33.1.63920615320101214800001.4780975902838153948',
    seriesUid = '1.3.46.670589.33.1.63921214987770565400001.5402961532441009156',
    sopUid = `${seriesUid}.${opts.instanceNumber}`,
    patientName = 'LAXMI RATHOD 61Y/F',
    patientId = 'CT JULY 6-01',
    instanceNumber,
    sliceIndex,
    sliceCount,
    sliceZ,
    rows = 256,
    columns = 256,
    sliceThickness = 1.8,
    pixelSpacing = '0.80\\0.80',
    windowCenter = 40,
    windowWidth = 400,
    rescaleIntercept = -1024,
    rescaleSlope = 1,
  } = opts;

  const tz = sliceCount > 1 ? sliceIndex / (sliceCount - 1) : 0.5;

  const pixelCount = rows * columns;
  const pixels = new Uint16Array(pixelCount);

  // Generate 3D anatomical voxels
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const idx = y * columns + x;
      const hu = computeAnatomicalVoxelHU(x, y, tz, columns, rows);
      const rawStored = Math.round((hu - rescaleIntercept) / rescaleSlope);
      pixels[idx] = Math.max(0, Math.min(65535, rawStored));
    }
  }

  const pixelByteLength = pixels.byteLength;
  const estimatedSize = 1024 + pixelByteLength;
  const buffer = new ArrayBuffer(estimatedSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  let offset = 0;

  // 1. Preamble (128 bytes 0)
  for (let i = 0; i < 128; i++) bytes[i] = 0;
  offset = 128;

  // 2. Magic 'DICM'
  bytes[offset++] = 0x44; // 'D'
  bytes[offset++] = 0x49; // 'I'
  bytes[offset++] = 0x43; // 'C'
  bytes[offset++] = 0x4d; // 'M'

  // Helper to add explicit VR string element
  const writeStr = (group: number, elem: number, vr: string, val: string, isMeta = false) => {
    const raw = encoder.encode(val);
    const pad = raw.length % 2 === 1 ? 1 : 0;
    const len = raw.length + pad;

    view.setUint16(offset, group, true);
    view.setUint16(offset + 2, elem, true);
    view.setUint8(offset + 4, vr.charCodeAt(0));
    view.setUint8(offset + 5, vr.charCodeAt(1));
    view.setUint16(offset + 6, len, true);
    offset += 8;

    bytes.set(raw, offset);
    offset += raw.length;
    if (pad) {
      bytes[offset++] = isMeta ? 0x00 : 0x20;
    }
  };

  // Helper to add explicit VR uint16 element
  const writeU16 = (group: number, elem: number, vr: string, val: number) => {
    view.setUint16(offset, group, true);
    view.setUint16(offset + 2, elem, true);
    view.setUint8(offset + 4, vr.charCodeAt(0));
    view.setUint8(offset + 5, vr.charCodeAt(1));
    view.setUint16(offset + 6, 2, true);
    view.setUint16(offset + 8, val, true);
    offset += 10;
  };

  // 3. Meta Group Header placeholder (0002, 0000)
  const metaGroupLenPos = offset;
  view.setUint16(offset, 0x0002, true);
  view.setUint16(offset + 2, 0x0000, true);
  view.setUint8(offset + 4, 0x55); // 'U'
  view.setUint8(offset + 5, 0x4c); // 'L'
  view.setUint16(offset + 6, 4, true);
  view.setUint32(offset + 8, 0, true);
  offset += 12;

  const metaStart = offset;
  writeStr(0x0002, 0x0002, 'UI', '1.2.840.10008.5.1.4.1.1.2', true); // Media Storage SOP Class (CT)
  writeStr(0x0002, 0x0003, 'UI', sopUid, true); // Media Storage SOP Instance
  writeStr(0x0002, 0x0010, 'UI', '1.2.840.10008.1.2.1', true); // Explicit VR Little Endian
  const metaLen = offset - metaStart;
  view.setUint32(metaGroupLenPos + 8, metaLen, true);

  // 4. Main Dataset Elements
  writeStr(0x0008, 0x0016, 'UI', '1.2.840.10008.5.1.4.1.1.2'); // SOP Class UID
  writeStr(0x0008, 0x0018, 'UI', sopUid); // SOP Instance UID
  writeStr(0x0008, 0x0060, 'CS', 'CT'); // Modality
  writeStr(0x0008, 0x1030, 'LO', 'CT KUB PLAIN'); // Study Description
  writeStr(0x0008, 0x103E, 'LO', 'CT KUB Axial Plain'); // Series Description
  writeStr(0x0010, 0x0010, 'PN', patientName);
  writeStr(0x0010, 0x0020, 'LO', patientId);
  writeStr(0x0020, 0x000D, 'UI', studyUid);
  writeStr(0x0020, 0x000E, 'UI', seriesUid);
  writeStr(0x0020, 0x0011, 'IS', '201');
  writeStr(0x0020, 0x0013, 'IS', String(instanceNumber));
  writeStr(0x0020, 0x0032, 'DS', `0.00\\0.00\\${sliceZ.toFixed(2)}`); // Image Position Patient
  writeStr(0x0020, 0x0037, 'DS', '1.00\\0.00\\0.00\\0.00\\1.00\\0.00'); // Image Orientation Patient
  writeStr(0x0020, 0x0052, 'UI', `${studyUid}.frame`); // Frame of Reference UID
  writeStr(0x0028, 0x0004, 'CS', 'MONOCHROME2');
  writeU16(0x0028, 0x0002, 'US', 1); // Samples per Pixel
  writeU16(0x0028, 0x0010, 'US', rows);
  writeU16(0x0028, 0x0011, 'US', columns);
  writeStr(0x0028, 0x0030, 'DS', pixelSpacing);
  writeStr(0x0018, 0x0050, 'DS', String(sliceThickness));
  writeStr(0x0018, 0x0088, 'DS', String(sliceThickness));
  writeU16(0x0028, 0x0100, 'US', 16); // Bits Allocated
  writeU16(0x0028, 0x0101, 'US', 16); // Bits Stored
  writeU16(0x0028, 0x0102, 'US', 15); // High Bit
  writeU16(0x0028, 0x0103, 'US', 0); // Pixel Representation
  writeStr(0x0028, 0x1050, 'DS', String(windowCenter));
  writeStr(0x0028, 0x1051, 'DS', String(windowWidth));
  writeStr(0x0028, 0x1052, 'DS', String(rescaleIntercept));
  writeStr(0x0028, 0x1053, 'DS', String(rescaleSlope));

  // 5. Pixel Data Header (7FE0, 0010) - OW format with 32-bit length
  view.setUint16(offset, 0x7fe0, true);
  view.setUint16(offset + 2, 0x0010, true);
  view.setUint8(offset + 4, 0x4f); // 'O'
  view.setUint8(offset + 5, 0x57); // 'W'
  view.setUint16(offset + 6, 0x0000, true); // Reserved 2 bytes
  view.setUint32(offset + 8, pixelByteLength, true); // 32-bit length
  offset += 12;

  // 6. Copy Pixel Bytes
  bytes.set(new Uint8Array(pixels.buffer), offset);
  offset += pixelByteLength;

  return buffer.slice(0, offset);
}

/**
 * Generates an array of contiguous, anatomically coherent DICOM Files for the MPR engine.
 * Defaults to 96 slices with 1.8mm spacing for proportional human torso geometry.
 */
export function generateSyntheticVolumeFiles(
  studyUid?: string,
  seriesUid?: string,
  sliceCount = 96
): File[] {
  const files: File[] = [];
  const spacing = 1.8;

  for (let i = 0; i < sliceCount; i++) {
    const sliceZ = i * spacing;
    const buf = createSyntheticDicomSliceBuffer({
      studyUid,
      seriesUid,
      instanceNumber: i + 1,
      sliceIndex: i,
      sliceCount,
      sliceZ,
      rows: 256,
      columns: 256,
      sliceThickness: spacing,
      pixelSpacing: '0.80\\0.80',
    });

    const file = new File([buf], `slice_${i + 1}.dcm`, { type: 'application/dicom' });
    files.push(file);
  }

  return files;
}

/**
 * Generates an array of buffer objects for the 3D VR engine.
 */
export function generateSyntheticVolumeBuffers(
  studyUid?: string,
  seriesUid?: string,
  sliceCount = 96
): Array<{ path: string; buffer: ArrayBuffer }> {
  const items: Array<{ path: string; buffer: ArrayBuffer }> = [];
  const spacing = 1.8;

  for (let i = 0; i < sliceCount; i++) {
    const sliceZ = i * spacing;
    const buf = createSyntheticDicomSliceBuffer({
      studyUid,
      seriesUid,
      instanceNumber: i + 1,
      sliceIndex: i,
      sliceCount,
      sliceZ,
      rows: 256,
      columns: 256,
      sliceThickness: spacing,
      pixelSpacing: '0.80\\0.80',
    });

    items.push({
      path: `slice_${i + 1}.dcm`,
      buffer: buf,
    });
  }

  return items;
}
