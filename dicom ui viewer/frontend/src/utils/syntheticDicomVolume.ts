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
  studyDescription?: string;
  seriesDescription?: string;
  seriesNumber?: number | string;
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

  // Natural anatomical body contour with realistic human waist and pelvic widening
  // tz ranges from 0.0 (inferior, pelvic floor / pubic symphysis) to 1.0 (superior, lower thorax / T11)
  const waistFactor = 0.04 * Math.sin((tz - 0.25) * Math.PI * 1.5);
  const rx = cols * (0.36 + waistFactor + (tz < 0.2 ? 0.03 * (1 - tz / 0.2) : 0));
  const ry = rows * (0.27 + 0.02 * Math.sin(tz * Math.PI));

  // Vertical closure at bottom (pelvic floor / perineum) and top (thoracic inlet)
  const zBottomDist = tz < 0.05 ? (0.05 - tz) / 0.05 : 0;
  const zTopDist = tz > 0.96 ? (tz - 0.96) / 0.04 : 0;

  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  const bodyDist = Math.hypot(dx, dy) + zBottomDist * 0.8 + zTopDist * 0.8;

  // 1. Outside body: Air (-1000 HU)
  if (bodyDist >= 1.0) return -1000;

  // 2. Skin layer (0.97 <= bodyDist < 1.0)
  if (bodyDist >= 0.97) return -40 + Math.sin(x * 0.1) * 8;

  // 3. Subcutaneous fat (0.90 <= bodyDist < 0.97)
  if (bodyDist >= 0.90) return -95 + (x % 5);

  // 4. Muscular abdominal wall & skeletal frame (0.83 <= bodyDist < 0.90)
  if (bodyDist >= 0.83) {
    // Rib cage: smooth helical bone rings wrapping around thorax (tz > 0.45)
    if (tz > 0.45) {
      const angle = Math.atan2(dy, dx);
      // Ribs slope obliquely downwards from posterior to anterior
      const ribPhase = Math.sin(angle * 6 + tz * 20 + dy * 2.5);
      if (ribPhase > 0.60 && bodyDist > 0.84) {
        return bodyDist > 0.88 ? 850 : 260; // Cortical rim vs marrow
      }
    }
    // Iliac crests / Pelvic bones in lower abdomen and pelvis (tz < 0.35)
    if (tz < 0.35 && Math.abs(dx) > 0.58 && dy > -0.25 && dy < 0.55) {
      const iliacDist = Math.hypot((Math.abs(dx) - 0.72) / 0.14, (dy - 0.15) / 0.30);
      if (iliacDist < 1.0) {
        return iliacDist > 0.7 ? 920 : 280;
      }
    }
    // Pubic symphysis anteriorly in lowest slices (tz < 0.12)
    if (tz < 0.12 && Math.abs(dx) < 0.22 && dy < -0.45) {
      return 880;
    }
    return 45; // Abdominal wall musculature (rectus abdominis, obliques)
  }

  // --- INTERNAL SKELETAL SYSTEM ---

  // 5. Vertebral Column / Spine (with anatomical lumbar lordosis curvature)
  const spineCx = cx;
  // Natural sagittal curvature: lumbar spine arches slightly anteriorly around tz = 0.45
  const lordosis = Math.sin(tz * Math.PI) * rows * 0.03;
  const spineCy = cy + ry * 0.42 - lordosis;

  const sDx = (x - spineCx) / (cols * 0.075);
  const sDy = (y - spineCy) / (rows * 0.07);
  const spineDist = Math.hypot(sDx, sDy);

  if (spineDist < 1.0) {
    // Vertebral bodies and intervertebral discs
    const discPhase = Math.sin(tz * Math.PI * 14); // ~7 vertebral segments
    if (discPhase > 0.70) {
      return 70; // Intervertebral disc (fibrocartilage)
    }
    // Spinal canal / Thecal sac with CSF
    const canalDx = (x - spineCx) / 6.5;
    const canalDy = (y - (spineCy + 6.5)) / 6.0;
    if (Math.hypot(canalDx, canalDy) < 1.0) {
      return 15; // CSF density in thecal sac
    }
    // Cortical bone rim vs cancellous trabecular bone
    if (spineDist > 0.78) return 920; // Dense vertebral cortex
    return 260; // Cancellous trabecular bone
  }

  // Posterior spinous process & transverse processes
  if (Math.abs(x - spineCx) < 4 && y >= spineCy + ry * 0.12 && y <= spineCy + ry * 0.32) {
    return 780; // Spinous process
  }
  if (Math.abs(y - (spineCy + 2)) < 5 && Math.abs(x - spineCx) > cols * 0.075 && Math.abs(x - spineCx) < cols * 0.16) {
    return 720; // Transverse processes
  }

  // Psoas major muscles (flanking lumbar spine, tapering inferior-laterally)
  const psoasWidth = cols * (0.07 + 0.03 * (1 - tz));
  const psoasL_dx = (x - (spineCx - psoasWidth * 1.1)) / psoasWidth;
  const psoasR_dx = (x - (spineCx + psoasWidth * 1.1)) / psoasWidth;
  const psoas_dy = (y - (spineCy - rows * 0.03)) / (rows * 0.12);
  if (tz >= 0.08 && tz <= 0.75 && (Math.hypot(psoasL_dx, psoas_dy) < 1.0 || Math.hypot(psoasR_dx, psoas_dy) < 1.0)) {
    return 46; // Psoas muscle
  }

  // --- MAJOR VASCULATURE ---

  // 6. Abdominal Aorta & Inferior Vena Cava (anterior to spine, bifurcating at tz ~ 0.28)
  if (tz >= 0.28) {
    const aortaDx = (x - (spineCx - 11)) / 6.5;
    const aortaDy = (y - (spineCy - 13)) / 6.5;
    if (Math.hypot(aortaDx, aortaDy) < 1.0) return 140; // Contrast-enhanced aorta

    const ivcDx = (x - (spineCx + 12)) / 7.5;
    const ivcDy = (y - (spineCy - 12)) / 7.5;
    if (Math.hypot(ivcDx, ivcDy) < 1.0) return 110; // IVC
  } else {
    // Common Iliac Vessels below bifurcation
    const iliacSpread = (0.28 - tz) * 60;
    const lIliac = Math.hypot((x - (spineCx - 11 - iliacSpread)) / 5.5, (y - (spineCy - 11)) / 5.5);
    const rIliac = Math.hypot((x - (spineCx + 12 + iliacSpread)) / 5.5, (y - (spineCy - 11)) / 5.5);
    if (lIliac < 1.0 || rIliac < 1.0) return 130;
  }

  // --- VISCERAL ORGANS WITH TRUE 3D CONTINUOUS SURFACES ---

  // 7. Lungs with Smooth Diaphragmatic Domes (NO flat rectangular cutouts!)
  // The diaphragm creates a smooth 3D convex dome curving up into the thorax
  const lungRx = rx * 0.36;
  const lungRy = ry * 0.58;
  const lungL_cx = cx - rx * 0.44;
  const lungR_cx = cx + rx * 0.44;
  const lungCy = cy - ry * 0.04;

  const lungL_normX = (x - lungL_cx) / lungRx;
  const lungL_normY = (y - lungCy) / lungRy;
  const lungL_r2 = lungL_normX * lungL_normX + lungL_normY * lungL_normY;

  const lungR_normX = (x - lungR_cx) / lungRx;
  const lungR_normY = (y - lungCy) / lungRy;
  const lungR_r2 = lungR_normX * lungR_normX + lungR_normY * lungR_normY;

  // Smooth diaphragmatic dome heights (Right is slightly higher than Left due to liver)
  const domeHeightR = 0.70 + 0.18 * Math.max(0, 1.0 - lungR_r2);
  const domeHeightL = 0.68 + 0.18 * Math.max(0, 1.0 - lungL_r2);

  // Check Right lung
  if (lungR_r2 < 1.0 && tz >= domeHeightR) {
    const tzLungRel = (tz - domeHeightR) / Math.max(0.01, 1.0 - domeHeightR);
    if (lungR_r2 + tzLungRel * tzLungRel * 0.5 < 1.0) {
      // Pulmonary vascular tree branching through lung parenchyma
      const vesselNoise = Math.sin(x * 0.4) * Math.cos(y * 0.4) * Math.sin(tz * 25);
      if (vesselNoise > 0.72) return 60; // Pulmonary vessel / bronchus
      return -780; // Lung parenchyma
    }
  }

  // Check Left lung
  if (lungL_r2 < 1.0 && tz >= domeHeightL) {
    const tzLungRel = (tz - domeHeightL) / Math.max(0.01, 1.0 - domeHeightL);
    if (lungL_r2 + tzLungRel * tzLungRel * 0.5 < 1.0) {
      const vesselNoise = Math.sin(x * 0.4) * Math.cos(y * 0.4) * Math.sin(tz * 25);
      if (vesselNoise > 0.72) return 60; // Pulmonary vessel / bronchus
      return -780; // Lung parenchyma
    }
  }

  // Diaphragm muscular dome lining immediately below the lungs
  if ((lungR_r2 < 1.0 && tz >= domeHeightR - 0.03 && tz < domeHeightR) ||
      (lungL_r2 < 1.0 && tz >= domeHeightL - 0.03 && tz < domeHeightL)) {
    return 48; // Diaphragm muscle
  }

  // 8. Liver (Right upper quadrant: smooth 3D convex anatomical organ)
  const liverCx = cx - rx * 0.36;
  const liverCy = cy - ry * 0.08;
  const liverDx = (x - liverCx) / (rx * 0.48);
  const liverDy = (y - liverCy) / (ry * 0.68);
  const liverDz = (tz - 0.64) / 0.24; // Spans tz ~ 0.40 to 0.88 smoothly
  const liverDist3D = Math.hypot(liverDx, liverDy, liverDz);

  if (liverDist3D < 1.0 && x < cx + rx * 0.16 && y < spineCy - 4 && tz < domeHeightR) {
    // Hepatic / Portal veins branching inside liver
    const veinNoise = Math.sin(x * 0.3 + y * 0.2) * Math.cos(tz * 18);
    if (veinNoise > 0.75) return 110; // Contrast-enhanced portal vein
    return 62; // Liver parenchyma
  }

  // Gallbladder (under visceral surface of liver)
  const gbDx = (x - (cx - rx * 0.24)) / (rx * 0.08);
  const gbDy = (y - (cy - ry * 0.16)) / (ry * 0.12);
  const gbDz = (tz - 0.48) / 0.06;
  const gbDist = Math.hypot(gbDx, gbDy, gbDz);
  if (gbDist < 1.0) {
    if (gbDist > 0.80) return 40; // Gallbladder wall
    return 12; // Bile fluid
  }

  // 9. Spleen (Left upper quadrant: smooth 3D crescentic organ)
  const spleenCx = cx + rx * 0.54;
  const spleenCy = cy + ry * 0.12;
  const spleenDx = (x - spleenCx) / (rx * 0.26);
  const spleenDy = (y - spleenCy) / (ry * 0.38);
  const spleenDz = (tz - 0.68) / 0.18; // Spans tz ~ 0.50 to 0.86 smoothly
  const spleenDist3D = Math.hypot(spleenDx, spleenDy, spleenDz);

  if (spleenDist3D < 1.0 && x > cx + rx * 0.28 && tz < domeHeightL) {
    return 52; // Spleen parenchyma
  }

  // 10. Kidneys (CT KUB specific: true 3D reniform/ellipsoid retroperitoneal organs)
  // Right Kidney: centered around tz = 0.46, slightly lower than left
  const rkCx = cx - rx * 0.44;
  const rkCy = cy + ry * 0.20;
  const rkDx = (x - rkCx) / (rx * 0.20);
  const rkDy = (y - rkCy) / (ry * 0.26);
  const rkDz = (tz - 0.46) / 0.12; // Spans tz ~ 0.34 to 0.58 smoothly
  const rkDist3D = Math.hypot(rkDx, rkDy, rkDz);

  if (rkDist3D < 1.0) {
    // Renal cortex vs medulla vs renal pelvis / sinus fat
    if (rkDist3D < 0.35) {
      const isFat = (x + y) % 2 === 0;
      return isFat ? -70 : 15; // Renal sinus fat & renal pelvis fluid
    }
    return 120; // Contrast-enhanced renal parenchyma
  }

  // Left Kidney: centered around tz = 0.50
  const lkCx = cx + rx * 0.44;
  const lkCy = cy + ry * 0.18;
  const lkDx = (x - lkCx) / (rx * 0.20);
  const lkDy = (y - lkCy) / (ry * 0.26);
  const lkDz = (tz - 0.50) / 0.12; // Spans tz ~ 0.38 to 0.62 smoothly
  const lkDist3D = Math.hypot(lkDx, lkDy, lkDz);

  if (lkDist3D < 1.0) {
    if (lkDist3D < 0.35) {
      const isFat = (x + y) % 2 === 0;
      return isFat ? -70 : 15; // Renal sinus fat & renal pelvis fluid
    }
    return 120; // Contrast-enhanced renal parenchyma
  }

  // Bilateral Ureters (descending from renal pelves along psoas to bladder)
  if (tz >= 0.16 && tz <= 0.46) {
    const ureterSpread = rx * (0.34 - (0.46 - tz) * 0.4);
    const rUreter = Math.hypot(x - (cx - ureterSpread), y - (cy + ry * 0.16));
    const lUreter = Math.hypot(x - (cx + ureterSpread), y - (cy + ry * 0.16));
    if (rUreter < 2.5 || lUreter < 2.5) {
      return 35; // Ureteric wall & lumen
    }
  }

  // 11. Urinary Bladder (CT KUB specific: smooth 3D pelvic ellipsoid)
  const bCx = cx;
  const bCy = cy - ry * 0.22;
  const bDx = (x - bCx) / (rx * 0.28);
  const bDy = (y - bCy) / (ry * 0.30);
  const bDz = (tz - 0.13) / 0.08; // Spans tz ~ 0.05 to 0.21 smoothly
  const bDist3D = Math.hypot(bDx, bDy, bDz);

  if (bDist3D < 1.0) {
    if (bDist3D > 0.84) return 42; // Bladder muscular wall
    return 12; // Urine in bladder lumen
  }

  // 12. Bowel loops & Mesenteric background (fat base with mottled gas and walls)
  const bowelPattern = Math.sin(x * 0.18) * Math.cos(y * 0.18) * Math.sin(tz * 8.0);
  if (bowelPattern > 0.50) return 32; // Bowel wall
  if (bowelPattern > 0.88) return -980; // Intraluminal gas
  return -92; // Mesenteric & retroperitoneal fat
}

export function createSyntheticDicomSliceBuffer(opts: SyntheticSliceOptions): ArrayBuffer {
  const {
    studyUid = '1.3.46.670589.33.1.63920615320101214800001.4780975902838153948',
    seriesUid = '1.3.46.670589.33.1.63921214987770565400001.5402961532441009156',
    sopUid = `${seriesUid}.${opts.instanceNumber}`,
    patientName = 'LAXMI RATHOD 61Y/F',
    patientId = 'CT JULY 6-01',
    studyDescription = 'CT KUB PLAIN',
    seriesDescription = 'CT KUB Axial Plain',
    seriesNumber = 201,
    instanceNumber,
    sliceIndex,
    sliceCount,
    sliceZ,
    rows = 256,
    columns = 256,
    sliceThickness = 1.25,
    pixelSpacing = '0.75\\0.75',
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

  // 4. Main Dataset Elements (in strict ascending DICOM tag order)
  // Group 0008
  writeStr(0x0008, 0x0016, 'UI', '1.2.840.10008.5.1.4.1.1.2'); // SOP Class UID
  writeStr(0x0008, 0x0018, 'UI', sopUid); // SOP Instance UID
  writeStr(0x0008, 0x0060, 'CS', 'CT'); // Modality
  writeStr(0x0008, 0x1030, 'LO', studyDescription); // Study Description
  writeStr(0x0008, 0x103E, 'LO', seriesDescription); // Series Description

  // Group 0010
  writeStr(0x0010, 0x0010, 'PN', patientName);
  writeStr(0x0010, 0x0020, 'LO', patientId);

  // Group 0018
  writeStr(0x0018, 0x0050, 'DS', String(sliceThickness));
  writeStr(0x0018, 0x0088, 'DS', String(sliceThickness));

  // Group 0020
  writeStr(0x0020, 0x000D, 'UI', studyUid);
  writeStr(0x0020, 0x000E, 'UI', seriesUid);
  writeStr(0x0020, 0x0011, 'IS', String(seriesNumber));
  writeStr(0x0020, 0x0013, 'IS', String(instanceNumber));
  writeStr(0x0020, 0x0032, 'DS', `0.00\\0.00\\${sliceZ.toFixed(2)}`); // Image Position Patient
  writeStr(0x0020, 0x0037, 'DS', '1.00\\0.00\\0.00\\0.00\\1.00\\0.00'); // Image Orientation Patient
  writeStr(0x0020, 0x0052, 'UI', `${studyUid}.frame`); // Frame of Reference UID

  // Group 0028
  writeU16(0x0028, 0x0002, 'US', 1); // Samples per Pixel
  writeStr(0x0028, 0x0004, 'CS', 'MONOCHROME2');
  writeU16(0x0028, 0x0010, 'US', rows);
  writeU16(0x0028, 0x0011, 'US', columns);
  writeStr(0x0028, 0x0030, 'DS', pixelSpacing);
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

export interface GenerateVolumeOptions {
  studyUid?: string;
  seriesUid?: string;
  sliceCount?: number;
  sliceThickness?: number;
  spacing?: number;
  pixelSpacing?: string;
  patientName?: string;
  patientId?: string;
  studyDescription?: string;
  seriesDescription?: string;
  seriesNumber?: number | string;
}

/**
 * Generates an array of contiguous, anatomically coherent DICOM Files for the MPR engine.
 */
export function generateSyntheticVolumeFiles(
  studyUid?: string,
  seriesUid?: string,
  sliceCount = 200,
  options?: Partial<GenerateVolumeOptions>
): File[] {
  const files: File[] = [];
  const thickness = options?.sliceThickness ?? 1.25;
  const spacing = options?.spacing ?? thickness;
  const count = Math.max(16, sliceCount);

  for (let i = 0; i < count; i++) {
    const sliceZ = i * spacing;
    const buf = createSyntheticDicomSliceBuffer({
      studyUid,
      seriesUid,
      patientName: options?.patientName,
      patientId: options?.patientId,
      studyDescription: options?.studyDescription,
      seriesDescription: options?.seriesDescription,
      seriesNumber: options?.seriesNumber,
      instanceNumber: i + 1,
      sliceIndex: i,
      sliceCount: count,
      sliceZ,
      rows: 256,
      columns: 256,
      sliceThickness: thickness,
      pixelSpacing: options?.pixelSpacing ?? '0.75\\0.75',
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
  sliceCount = 200,
  options?: Partial<GenerateVolumeOptions>
): Array<{ path: string; buffer: ArrayBuffer }> {
  const items: Array<{ path: string; buffer: ArrayBuffer }> = [];
  const thickness = options?.sliceThickness ?? 1.25;
  const spacing = options?.spacing ?? thickness;
  const count = Math.max(16, sliceCount);

  for (let i = 0; i < count; i++) {
    const sliceZ = i * spacing;
    const buf = createSyntheticDicomSliceBuffer({
      studyUid,
      seriesUid,
      patientName: options?.patientName,
      patientId: options?.patientId,
      studyDescription: options?.studyDescription,
      seriesDescription: options?.seriesDescription,
      seriesNumber: options?.seriesNumber,
      instanceNumber: i + 1,
      sliceIndex: i,
      sliceCount: count,
      sliceZ,
      rows: 256,
      columns: 256,
      sliceThickness: thickness,
      pixelSpacing: options?.pixelSpacing ?? '0.75\\0.75',
    });

    items.push({
      path: `slice_${i + 1}.dcm`,
      buffer: buf,
    });
  }

  return items;
}
