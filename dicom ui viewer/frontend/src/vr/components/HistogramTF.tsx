import { useEffect, useRef, useState, useCallback } from 'react';
import type { TransferFunction } from '@3d/rendering/transferFunction';
import { evaluateColor, normalizeTransferFunction } from '@3d/rendering/transferFunction';
import type { HistogramData } from '@3d/volume/types';

interface Props {
  tf: TransferFunction;
  histogram: HistogramData;
  huRange: [number, number];
  onChange: (tf: TransferFunction) => void;
  height?: number;
}

/**
 * Transfer-function editor: log-scaled HU histogram behind a draggable opacity ramp,
 * with the colour ramp shown as a strip underneath (§8).
 */
export function HistogramTF({ tf, histogram, huRange, onChange, height = 150 }: Props): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [width, setWidth] = useState(260);
  const [lo, hi] = huRange;

  const toX = useCallback((hu: number) => ((hu - lo) / (hi - lo)) * width, [lo, hi, width]);
  const toHU = useCallback((x: number) => lo + (x / width) * (hi - lo), [lo, hi, width]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth || 260));
    ro.observe(el);
    setWidth(el.clientWidth || 260);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const dpr = window.devicePixelRatio || 1;
    el.width = Math.max(1, Math.round(width * dpr));
    el.height = Math.round(height * dpr);
    const ctx = el.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const plotH = height - 16;

    // Histogram (log scale so soft tissue does not vanish behind the air peak).
    let max = 1;
    for (let i = 0; i < histogram.counts.length; i++) max = Math.max(max, histogram.counts[i]);
    const logMax = Math.log10(max + 1);
    ctx.fillStyle = '#2c3138';
    for (let px = 0; px < width; px++) {
      const huA = toHU(px), huB = toHU(px + 1);
      const b0 = Math.max(0, Math.floor((huA - histogram.min) / histogram.binWidth));
      const b1 = Math.min(histogram.counts.length - 1, Math.ceil((huB - histogram.min) / histogram.binWidth));
      let c = 0;
      for (let b = b0; b <= b1; b++) c = Math.max(c, histogram.counts[b]);
      const h = (Math.log10(c + 1) / logMax) * plotH;
      if (h > 0) ctx.fillRect(px, plotH - h, 1, h);
    }

    // Gridlines at clinically meaningful HU landmarks.
    ctx.strokeStyle = '#23262d'; ctx.lineWidth = 1; ctx.font = '9px ui-monospace, monospace';
    for (const hu of [-1000, -500, 0, 200, 500, 1000, 2000, 3000]) {
      if (hu < lo || hu > hi) continue;
      const x = Math.round(toX(hu)) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, plotH); ctx.stroke();
      ctx.fillStyle = '#6b7079';
      ctx.fillText(String(hu), x + 2, height - 4);
      ctx.fillStyle = '#2c3138';
    }

    // Colour strip.
    for (let px = 0; px < width; px++) {
      const c = evaluateColor(tf, toHU(px));
      ctx.fillStyle = `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;
      ctx.fillRect(px, plotH + 1, 1, 5);
    }

    // Opacity ramp.
    ctx.beginPath();
    tf.opacity.forEach((p, i) => {
      const x = toX(p.hu), y = plotH - p.opacity * plotH;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#e9edf2'; ctx.lineWidth = 1.5; ctx.stroke();

    ctx.fillStyle = 'rgba(77,156,214,0.16)';
    ctx.lineTo(toX(tf.opacity[tf.opacity.length - 1]?.hu ?? hi), plotH);
    ctx.lineTo(toX(tf.opacity[0]?.hu ?? lo), plotH);
    ctx.closePath(); ctx.fill();

    // Control points.
    tf.opacity.forEach((p, i) => {
      const x = toX(p.hu), y = plotH - p.opacity * plotH;
      ctx.beginPath(); ctx.arc(x, y, i === dragIndex ? 5 : 3.6, 0, Math.PI * 2);
      ctx.fillStyle = i === dragIndex ? '#4d9cd6' : '#e9edf2';
      ctx.fill();
      ctx.strokeStyle = '#0a0b0d'; ctx.lineWidth = 1; ctx.stroke();
    });
  }, [tf, histogram, width, height, dragIndex, lo, hi, toX, toHU]);

  const nearestPoint = (x: number, y: number): number | null => {
    const plotH = height - 16;
    let best: number | null = null, bestD = 12;
    tf.opacity.forEach((p, i) => {
      const d = Math.hypot(toX(p.hu) - x, plotH - p.opacity * plotH - y);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const idx = nearestPoint(x, y);
    if (e.altKey && idx !== null && tf.opacity.length > 2) {
      onChange(normalizeTransferFunction({ ...tf, opacity: tf.opacity.filter((_, i) => i !== idx), builtIn: false }));
      return;
    }
    if (idx === null) {
      const plotH = height - 16;
      const next = [...tf.opacity, { hu: Math.round(toHU(x)), opacity: Math.max(0, Math.min(1, (plotH - y) / plotH)) }];
      const norm = normalizeTransferFunction({ ...tf, opacity: next, builtIn: false });
      onChange(norm);
      setDragIndex(norm.opacity.findIndex((p) => Math.abs(p.hu - toHU(x)) < 1e-6));
    } else {
      setDragIndex(idx);
    }
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragIndex === null) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const plotH = height - 16;
    const opacity = Math.max(0, Math.min(1, (plotH - y) / plotH));
    const hu = Math.round(Math.max(lo, Math.min(hi, toHU(x))));
    const next = tf.opacity.map((p, i) => (i === dragIndex ? { ...p, hu, opacity } : p));
    onChange({ ...tf, opacity: next, builtIn: false });
  };

  const onUp = () => {
    if (dragIndex !== null) onChange(normalizeTransferFunction({ ...tf, builtIn: false }));
    setDragIndex(null);
  };

  return (
    <div>
      <canvas
        ref={canvasRef} className="tf-canvas" style={{ height }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
      />
      <div className="hint">
        Click to add a control point, drag to move it, Alt-click to delete. The grey curve is
        this dataset's HU histogram on a log scale; the strip below the axis is the colour ramp.
      </div>
    </div>
  );
}
