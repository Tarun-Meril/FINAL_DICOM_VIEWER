/**
 * Screenshot export (§30) and presentation-state serialisation (§29).
 */
import { useAppStore } from '@vr/state/store';
import { getSession } from '@vr/state/session';
import { encodeMaskRle, PRESENTATION_STATE_SCHEMA, PRESENTATION_STATE_VERSION, type PresentationState } from '@vr/state/presentationState';
import { directionFlat } from '@3d/math/vec3';
import { measure } from '@3d/measurement/measurements';
import { APP_VERSION } from '@vr/core/version';

export interface ScreenshotOptions {
  readonly format?: 'image/png' | 'image/jpeg';
  readonly scale?: number;
  readonly quality?: number;
  readonly annotate?: {
    readonly studySeries?: boolean;
    readonly orientation?: boolean;
    readonly scaleBar?: boolean;
    readonly measurements?: boolean;
    readonly preset?: boolean;
    /** Opt-in only, and never on by default (§40). */
    readonly patientIdentifiers?: { patientName?: string; patientID?: string; studyDate?: string };
  };
}

/**
 * Render at export quality, then draw the requested annotation layer on top with a 2D
 * canvas so the burned-in text is crisp at any output resolution.
 */
export async function captureScreenshot(opts: ScreenshotOptions = {}): Promise<Blob> {
  const session = getSession();
  const engine = session?.engine;
  if (!engine || !session) throw new Error('No rendered volume to export.');
  const state = useAppStore.getState();

  const dataUrl = await engine.capture({
    format: opts.format ?? 'image/png',
    quality: opts.quality ?? 0.95,
    scale: opts.scale ?? 1,
  });

  const img = await loadImage(dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('A 2D canvas could not be created for the annotation layer.');
  ctx.drawImage(img, 0, 0);

  const a = opts.annotate;
  if (a) {
    const scale = Math.max(1, img.height / 900);
    const pad = 14 * scale;
    ctx.font = `${Math.round(13 * scale)}px ui-monospace, monospace`;
    ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 4 * scale;
    ctx.fillStyle = '#dfe3e8';

    const left: string[] = [];
    if (a.studySeries) {
      const load = state.load;
      left.push(`${load?.series.modality ?? ''} · ${load?.series.seriesDescription ?? ''}`);
      left.push(`Series ${load?.series.seriesNumber ?? ''} · ${session.volume.geometry.dimensions.join(' × ')} voxels`);
      left.push(`${session.volume.geometry.spacing.map((v) => v.toFixed(3)).join(' × ')} mm`);
    }
    if (a.patientIdentifiers) {
      const p = a.patientIdentifiers;
      left.unshift([p.patientName, p.patientID, p.studyDate].filter(Boolean).join(' · '));
    }
    left.forEach((t, i) => ctx.fillText(t, pad, pad + i * 18 * scale));

    if (a.preset) {
      const right = [
        state.transferFunction.name,
        state.blendMode === 'composite' ? 'Volume Rendering' : state.blendMode.toUpperCase(),
        state.parallelProjection ? 'Orthographic' : 'Perspective',
      ];
      ctx.textAlign = 'right';
      right.forEach((t, i) => ctx.fillText(t, canvas.width - pad, pad + i * 18 * scale));
      ctx.textAlign = 'left';
    }

    if (a.orientation) {
      const { screenDirections } = await import('@3d/rendering/camera');
      const { anatomicalLabel } = await import('@3d/dicom/geometry');
      const d = screenDirections(engine.getCameraState());
      ctx.font = `600 ${Math.round(16 * scale)}px ui-sans-serif, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(anatomicalLabel(d.up), canvas.width / 2, pad);
      ctx.fillText(anatomicalLabel(d.down), canvas.width / 2, canvas.height - pad - 18 * scale);
      ctx.textAlign = 'left';
      ctx.fillText(anatomicalLabel(d.left), pad, canvas.height / 2);
      ctx.textAlign = 'right';
      ctx.fillText(anatomicalLabel(d.right), canvas.width - pad, canvas.height / 2);
      ctx.textAlign = 'left';
    }

    if (a.scaleBar) drawScaleBar(ctx, canvas, engine, scale);

    if (a.measurements && state.measurements.length > 0) {
      ctx.font = `${Math.round(12 * scale)}px ui-monospace, monospace`;
      const lines = state.measurements.filter((m) => m.visible)
        .map((m) => `${m.label || m.kind}: ${measure(m, session.volume.geometry).display}`);
      lines.forEach((t, i) => ctx.fillText(t, pad, canvas.height - pad - (lines.length - i) * 16 * scale));
    }
  }

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The screenshot could not be encoded.'))),
      opts.format ?? 'image/png', opts.quality ?? 0.95);
  });
}

function drawScaleBar(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, engine: ReturnType<typeof getSession> extends null ? never : NonNullable<ReturnType<typeof getSession>>['engine'], scale: number): void {
  if (!engine) return;
  const cam = engine.getCameraState();
  // Millimetres per pixel at the focal plane.
  const mmPerPx = cam.parallelProjection
    ? (2 * cam.parallelScale) / canvas.height
    : (2 * Math.tan((cam.viewAngle * Math.PI) / 360) *
        Math.hypot(cam.position[0] - cam.focalPoint[0], cam.position[1] - cam.focalPoint[1], cam.position[2] - cam.focalPoint[2])) / canvas.height;
  const targetPx = canvas.width * 0.18;
  const raw = targetPx * mmPerPx;
  const nice = [1, 2, 5, 10, 20, 50, 100, 150, 200, 500].reduce((a, b) => (Math.abs(b - raw) < Math.abs(a - raw) ? b : a), 1);
  const px = nice / mmPerPx;
  const x = canvas.width - 20 * scale - px;
  const y = canvas.height - 24 * scale;
  ctx.strokeStyle = '#dfe3e8'; ctx.lineWidth = 2 * scale;
  ctx.beginPath();
  ctx.moveTo(x, y); ctx.lineTo(x + px, y);
  ctx.moveTo(x, y - 5 * scale); ctx.lineTo(x, y + 5 * scale);
  ctx.moveTo(x + px, y - 5 * scale); ctx.lineTo(x + px, y + 5 * scale);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillText(`${nice} mm`, x + px / 2, y + 8 * scale);
  ctx.textAlign = 'left';
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('The rendered frame could not be decoded for annotation.'));
    img.src = src;
  });
}

/* ------------------------------------------------------ presentation state */

export function capturePresentationState(): PresentationState {
  const session = getSession();
  const state = useAppStore.getState();
  if (!session || !session.engine || !state.load) throw new Error('Nothing is loaded.');
  const g = session.volume.geometry;
  const labelCounts = session.labels.countsByLabel();

  return {
    schema: PRESENTATION_STATE_SCHEMA,
    version: PRESENTATION_STATE_VERSION,
    createdAt: new Date().toISOString(),
    application: { name: 'MedView VR', version: APP_VERSION },
    dataset: {
      studyInstanceUID: session.volume.provenance.studyInstanceUID,
      seriesInstanceUID: session.volume.provenance.seriesInstanceUID,
      frameOfReferenceUID: session.volume.provenance.frameOfReferenceUID,
      volumeId: session.volume.id,
      dimensions: g.dimensions,
      spacing: g.spacing,
      origin: g.origin,
      direction: directionFlat(g.iAxis, g.jAxis, g.kAxis),
    },
    camera: session.engine.getCameraState(),
    renderMode: state.renderMode,
    transferFunction: state.transferFunction,
    blendMode: state.blendMode,
    quality: state.quality,
    clipping: state.clipping,
    cropBox: state.cropBox,
    segmentation: {
      objects: state.segments,
      labelsRle: labelCounts.size > 0 ? encodeMaskRle(session.labels.labels) : undefined,
      visibilityRle: session.masked ? encodeMaskRle(session.visibility.values) : undefined,
    },
    measurements: state.measurements,
    surfaces: state.surfaces,
    ui: {
      orientationCubeVisible: state.orientationCubeVisible,
      directionLabelsVisible: state.directionLabelsVisible,
      backgroundColor: [0.02, 0.02, 0.03],
    },
    provenanceDigest: JSON.stringify({
      strategy: session.volume.provenance.reconstructionStrategy,
      transforms: session.volume.provenance.transforms.map((t) => t.kind),
      slices: session.volume.provenance.sourceInstanceCount,
    }),
  };
}
