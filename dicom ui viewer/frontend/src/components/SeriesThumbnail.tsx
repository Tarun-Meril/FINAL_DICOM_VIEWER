import React, { useEffect, useRef, useState } from 'react';
import { ThumbnailStatus } from '../services/Thumbnail/ThumbnailService';
import { API_BASE_URL } from '../config';
import { imageLoader } from '@cornerstonejs/core';
import { initCornerstone } from '../initCornerstone';
import { parseDataSet } from '../vr/dicom/parser';
import { decodeFrame } from '../vr/dicom/decode/decodeFrame';
import { T } from '../vr/dicom/dictionary';

interface SeriesThumbnailProps {
  studyUID: string;
  seriesUID: string;
  imageIds?: string[];
  modality: string;
  imagesCount: number;
}

// In-memory cache so thumbnails for each sopUid/seriesUID are decoded once and rendered immediately
const thumbnailDataUrlCache = new Map<string, string>();

function parseNumeric(val: any, fallback: number): number {
  if (val === undefined || val === null) return fallback;
  if (typeof val === 'number') return isNaN(val) ? fallback : val;
  if (Array.isArray(val) && val.length > 0) return parseNumeric(val[0], fallback);
  if (typeof val === 'string') {
    const firstPart = val.split('\\')[0].trim();
    const num = parseFloat(firstPart);
    return isNaN(num) ? fallback : num;
  }
  return fallback;
}

function renderDicomImageToDataUrl(image: any, modality?: string): string {
  if (!image) {
    throw new Error('No image provided to renderDicomImageToDataUrl');
  }

  // 1. If it's a color image with canvas support:
  if (image.color && typeof image.getCanvas === 'function') {
    try {
      const srcCanvas = image.getCanvas();
      if (srcCanvas && srcCanvas.width > 0 && srcCanvas.height > 0) {
        const thumbCanvas = document.createElement('canvas');
        thumbCanvas.width = 128;
        thumbCanvas.height = 128;
        const thumbCtx = thumbCanvas.getContext('2d');
        if (thumbCtx) {
          thumbCtx.imageSmoothingEnabled = true;
          thumbCtx.imageSmoothingQuality = 'medium';
          thumbCtx.drawImage(srcCanvas, 0, 0, 128, 128);
          return thumbCanvas.toDataURL('image/jpeg', 0.85);
        }
      }
    } catch (e) {
      console.warn('[SeriesThumbnail] getCanvas error for color image:', e);
    }
  }

  // 2. Extract pixel array & dimensions
  let pixelData: any = null;
  if (typeof image.getPixelData === 'function') {
    pixelData = image.getPixelData();
  } else if (image.voxelManager && typeof image.voxelManager.getScalarData === 'function') {
    pixelData = image.voxelManager.getScalarData();
  } else if (image.imageFrame && image.imageFrame.pixelData) {
    pixelData = image.imageFrame.pixelData;
  }

  if (pixelData instanceof ArrayBuffer) {
    pixelData = new Uint16Array(pixelData);
  }

  const width = Number(image.columns || image.width || (image.imageFrame && image.imageFrame.columns) || 512);
  const height = Number(image.rows || image.height || (image.imageFrame && image.imageFrame.rows) || 512);

  // If pixelData is missing, check if getCanvas is available as fallback
  if (!pixelData || pixelData.length === 0) {
    if (typeof image.getCanvas === 'function') {
      const srcCanvas = image.getCanvas();
      if (srcCanvas && srcCanvas.width > 0 && srcCanvas.height > 0) {
        const thumbCanvas = document.createElement('canvas');
        thumbCanvas.width = 128;
        thumbCanvas.height = 128;
        const thumbCtx = thumbCanvas.getContext('2d');
        if (thumbCtx) {
          thumbCtx.imageSmoothingEnabled = true;
          thumbCtx.imageSmoothingQuality = 'medium';
          thumbCtx.drawImage(srcCanvas, 0, 0, 128, 128);
          return thumbCanvas.toDataURL('image/jpeg', 0.85);
        }
      }
    }
    throw new Error('Image has no pixel data available');
  }

  // 3. Handle RGBA / 8-bit packed color image
  if (image.rgba && pixelData.length >= width * height * 4) {
    const fullCanvas = document.createElement('canvas');
    fullCanvas.width = width;
    fullCanvas.height = height;
    const fullCtx = fullCanvas.getContext('2d');
    if (fullCtx) {
      const imgData = fullCtx.createImageData(width, height);
      imgData.data.set(pixelData.subarray(0, width * height * 4));
      fullCtx.putImageData(imgData, 0, 0);

      const thumbCanvas = document.createElement('canvas');
      thumbCanvas.width = 128;
      thumbCanvas.height = 128;
      const thumbCtx = thumbCanvas.getContext('2d');
      if (thumbCtx) {
        thumbCtx.imageSmoothingEnabled = true;
        thumbCtx.imageSmoothingQuality = 'medium';
        thumbCtx.drawImage(fullCanvas, 0, 0, 128, 128);
        return thumbCanvas.toDataURL('image/jpeg', 0.85);
      }
    }
  }

  // 4. Handle 3-channel RGB packed color image
  if (image.color && pixelData.length >= width * height * 3) {
    const fullCanvas = document.createElement('canvas');
    fullCanvas.width = width;
    fullCanvas.height = height;
    const fullCtx = fullCanvas.getContext('2d');
    if (fullCtx) {
      const imgData = fullCtx.createImageData(width, height);
      const dst = imgData.data;
      let srcIdx = 0;
      let dstIdx = 0;
      for (let i = 0; i < width * height; i++) {
        dst[dstIdx++] = pixelData[srcIdx++];
        dst[dstIdx++] = pixelData[srcIdx++];
        dst[dstIdx++] = pixelData[srcIdx++];
        dst[dstIdx++] = 255;
      }
      fullCtx.putImageData(imgData, 0, 0);

      const thumbCanvas = document.createElement('canvas');
      thumbCanvas.width = 128;
      thumbCanvas.height = 128;
      const thumbCtx = thumbCanvas.getContext('2d');
      if (thumbCtx) {
        thumbCtx.imageSmoothingEnabled = true;
        thumbCtx.imageSmoothingQuality = 'medium';
        thumbCtx.drawImage(fullCanvas, 0, 0, 128, 128);
        return thumbCanvas.toDataURL('image/jpeg', 0.85);
      }
    }
  }

  // 5. Monochrome / Grayscale (CT, MR, CR, DX, etc.)
  const slope = parseNumeric(image.slope ?? (image.imageFrame && image.imageFrame.rescaleSlope), 1);
  const intercept = parseNumeric(image.intercept ?? (image.imageFrame && image.imageFrame.rescaleIntercept), 0);

  let wc = parseNumeric(image.windowCenter ?? (image.imageFrame && image.imageFrame.windowCenter), NaN);
  let ww = parseNumeric(image.windowWidth ?? (image.imageFrame && image.imageFrame.windowWidth), NaN);

  const mod = (modality || image.modality || '').toUpperCase();

  // If Window Center / Window Width not defined in metadata, compute automatic optimal window
  if (isNaN(ww) || ww <= 0 || isNaN(wc)) {
    if (mod === 'CT') {
      wc = 40;
      ww = 400;
    } else if (image.minPixelValue !== undefined && image.maxPixelValue !== undefined && image.maxPixelValue > image.minPixelValue) {
      const minHU = image.minPixelValue * slope + intercept;
      const maxHU = image.maxPixelValue * slope + intercept;
      ww = Math.max(1, maxHU - minHU);
      wc = minHU + ww / 2;
    } else {
      let minVal = Infinity;
      let maxVal = -Infinity;
      const step = Math.max(1, Math.floor(pixelData.length / 500));
      for (let i = 0; i < pixelData.length; i += step) {
        const val = pixelData[i] * slope + intercept;
        if (val < minVal) minVal = val;
        if (val > maxVal) maxVal = val;
      }
      if (isFinite(minVal) && isFinite(maxVal) && maxVal > minVal) {
        ww = maxVal - minVal;
        wc = minVal + ww / 2;
      } else {
        wc = mod === 'CT' ? 40 : 128;
        ww = mod === 'CT' ? 400 : 256;
      }
    }
  }

  const minWindow = wc - ww / 2.0;
  const invWw = 255.0 / (ww > 0 ? ww : 1);
  const invert = Boolean(image.invert);

  const fullCanvas = document.createElement('canvas');
  fullCanvas.width = width;
  fullCanvas.height = height;
  const fullCtx = fullCanvas.getContext('2d');
  if (!fullCtx) throw new Error('Cannot get 2D context for DICOM slice rendering');

  const imgData = fullCtx.createImageData(width, height);
  const data = imgData.data;
  const numPixels = Math.min(width * height, pixelData.length);

  for (let i = 0; i < numPixels; i++) {
    const hu = pixelData[i] * slope + intercept;
    let intensity = Math.round((hu - minWindow) * invWw);
    if (intensity < 0) intensity = 0;
    else if (intensity > 255) intensity = 255;
    if (invert) intensity = 255 - intensity;

    const dst = i * 4;
    data[dst] = intensity;
    data[dst + 1] = intensity;
    data[dst + 2] = intensity;
    data[dst + 3] = 255;
  }

  fullCtx.putImageData(imgData, 0, 0);

  // Downscale onto a 128x128 thumbnail canvas
  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = 128;
  thumbCanvas.height = 128;
  const thumbCtx = thumbCanvas.getContext('2d');
  if (!thumbCtx) throw new Error('Cannot get 2D context for thumbnail');

  thumbCtx.imageSmoothingEnabled = true;
  thumbCtx.imageSmoothingQuality = 'medium';
  thumbCtx.drawImage(fullCanvas, 0, 0, 128, 128);

  return thumbCanvas.toDataURL('image/jpeg', 0.85);
}

async function decodeDicomBufferToThumbnail(fileBuffer: ArrayBuffer, modality?: string): Promise<string> {
  const bytes = new Uint8Array(fileBuffer);
  const ds = parseDataSet(bytes);
  const decoded = await decodeFrame(ds, 0);

  const { pixelData, rows, columns } = decoded;
  const width = columns;
  const height = rows;

  const slope = parseNumeric(ds.string(T.RescaleSlope) ?? ds.string('x00281053'), 1);
  const intercept = parseNumeric(ds.string(T.RescaleIntercept) ?? ds.string('x00281052'), 0);
  let wc = parseNumeric(ds.string(T.WindowCenter) ?? ds.string('x00281050'), NaN);
  let ww = parseNumeric(ds.string(T.WindowWidth) ?? ds.string('x00281051'), NaN);

  const mod = (modality || ds.string(T.Modality) || 'CT').toUpperCase();
  if (isNaN(ww) || ww <= 0 || isNaN(wc)) {
    if (mod === 'CT') {
      wc = 40;
      ww = 400;
    } else {
      let minVal = Infinity;
      let maxVal = -Infinity;
      const step = Math.max(1, Math.floor(pixelData.length / 500));
      for (let i = 0; i < pixelData.length; i += step) {
        const val = pixelData[i] * slope + intercept;
        if (val < minVal) minVal = val;
        if (val > maxVal) maxVal = val;
      }
      if (isFinite(minVal) && isFinite(maxVal) && maxVal > minVal) {
        ww = maxVal - minVal;
        wc = minVal + ww / 2;
      } else {
        wc = 128;
        ww = 256;
      }
    }
  }

  const minWindow = wc - ww / 2.0;
  const invWw = 255.0 / (ww > 0 ? ww : 1);

  const fullCanvas = document.createElement('canvas');
  fullCanvas.width = width;
  fullCanvas.height = height;
  const fullCtx = fullCanvas.getContext('2d');
  if (!fullCtx) throw new Error('Cannot get canvas 2D context');

  const imgData = fullCtx.createImageData(width, height);
  const data = imgData.data;
  const numPixels = Math.min(width * height, pixelData.length);

  for (let i = 0; i < numPixels; i++) {
    const hu = pixelData[i] * slope + intercept;
    let intensity = Math.round((hu - minWindow) * invWw);
    if (intensity < 0) intensity = 0;
    else if (intensity > 255) intensity = 255;

    const dst = i * 4;
    data[dst] = intensity;
    data[dst + 1] = intensity;
    data[dst + 2] = intensity;
    data[dst + 3] = 255;
  }

  fullCtx.putImageData(imgData, 0, 0);

  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = 128;
  thumbCanvas.height = 128;
  const thumbCtx = thumbCanvas.getContext('2d');
  if (!thumbCtx) throw new Error('Cannot get thumbnail 2D context');

  thumbCtx.imageSmoothingEnabled = true;
  thumbCtx.imageSmoothingQuality = 'medium';
  thumbCtx.drawImage(fullCanvas, 0, 0, 128, 128);

  return thumbCanvas.toDataURL('image/jpeg', 0.85);
}

export function SeriesThumbnail({ studyUID, seriesUID, imageIds: initialImageIds, modality, imagesCount }: SeriesThumbnailProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<ThumbnailStatus>(ThumbnailStatus.Idle);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    const loadThumbnail = async () => {
      try {
        // Check cache with seriesUID first
        if (seriesUID && thumbnailDataUrlCache.has(seriesUID)) {
          if (!isCancelled) {
            setImageUrl(thumbnailDataUrlCache.get(seriesUID)!);
            setStatus(ThumbnailStatus.Ready);
          }
          return;
        }

        setStatus(ThumbnailStatus.Rendering);
        let sopUid = '';

        if (initialImageIds && initialImageIds.length > 0) {
          const midIdx = Math.floor(initialImageIds.length / 2);
          const match = initialImageIds[midIdx].match(/\/instances\/([^\/]+)\/file/);
          if (match) {
            sopUid = match[1];
          } else {
            const parts = initialImageIds[midIdx].split('/');
            sopUid = parts[parts.length - 2] || parts[parts.length - 1];
          }
        }

        const candidateBases = [
          API_BASE_URL,
          'http://127.0.0.1:3001',
          'http://localhost:3001',
          'http://127.0.0.1:8000',
          'http://localhost:8000'
        ].filter(Boolean) as string[];
        const uniqueBases = [...new Set(candidateBases)];

        if (!sopUid && seriesUID && seriesUID !== 'unknown') {
          for (const b of uniqueBases) {
            try {
              const cleanB = b.replace(/\/$/, '');
              let res = await fetch(`${cleanB}/api/series/${seriesUID}/instances`);
              if (!res.ok && studyUID && studyUID !== 'unknown') {
                res = await fetch(`${cleanB}/api/studies/${studyUID}/series/${seriesUID}/instances`);
              }
              if (res.ok) {
                const data = await res.json();
                const list = Array.isArray(data) ? data : (data?.data || data?.value || []);
                if (list.length > 0) {
                  const mid = list[Math.floor(list.length / 2)] || list[0];
                  sopUid = mid.sopInstanceUid || mid.sop_instance_uid || mid.sopUid || mid.sop_uid || mid.SOPInstanceUID || '';
                  if (sopUid) break;
                }
              }
            } catch (_) {
              // try next candidate base
            }
          }
        }

        if (!sopUid) {
          if (!isCancelled) setStatus(ThumbnailStatus.Failed);
          return;
        }

        // Check cache with sopUid
        if (thumbnailDataUrlCache.has(sopUid)) {
          const cached = thumbnailDataUrlCache.get(sopUid)!;
          if (seriesUID) thumbnailDataUrlCache.set(seriesUID, cached);
          if (!isCancelled) {
            setImageUrl(cached);
            setStatus(ThumbnailStatus.Ready);
          }
          return;
        }

        // Try direct high-speed slice fetch & decode first
        let buf: ArrayBuffer | null = null;
        let successfulBase = API_BASE_URL;
        for (const b of uniqueBases) {
          try {
            const cleanB = b.replace(/\/$/, '');
            const fileRes = await fetch(`${cleanB}/api/instances/${sopUid}/file`);
            if (fileRes.ok) {
              buf = await fileRes.arrayBuffer();
              successfulBase = cleanB;
              break;
            }
          } catch (_) {}
        }

        if (buf && buf.byteLength > 0) {
          try {
            const dataUrl = await decodeDicomBufferToThumbnail(buf, modality || 'CT');
            thumbnailDataUrlCache.set(sopUid, dataUrl);
            if (seriesUID) thumbnailDataUrlCache.set(seriesUID, dataUrl);

            if (!isCancelled) {
              setImageUrl(dataUrl);
              setStatus(ThumbnailStatus.Ready);
            }
            return;
          } catch (directErr) {
            console.warn(`[SeriesThumbnail] Direct DICOM decode notice for ${sopUid}, using Cornerstone fallback:`, directErr);
          }
        }

        // Decode and render directly from the DICOM slice via Cornerstone
        await initCornerstone();
        const imageId = `wadouri:${successfulBase}/api/instances/${sopUid}/file`;
        const image = await imageLoader.loadAndCacheImage(imageId);
        if (isCancelled) return;

        const dataUrl = renderDicomImageToDataUrl(image, modality || 'CT');

        thumbnailDataUrlCache.set(sopUid, dataUrl);
        if (seriesUID) thumbnailDataUrlCache.set(seriesUID, dataUrl);

        if (!isCancelled) {
          setImageUrl(dataUrl);
          setStatus(ThumbnailStatus.Ready);
        }
      } catch (err) {
        console.warn(`[SeriesThumbnail] Thumbnail render failed for ${seriesUID}:`, err);
        if (!isCancelled) {
          setStatus(ThumbnailStatus.Failed);
        }
      }
    };

    loadThumbnail();

    return () => {
      isCancelled = true;
    };
  }, [studyUID, seriesUID, initialImageIds?.length, modality]);

  const renderContent = () => {
    if (status === ThumbnailStatus.Ready && imageUrl) {
      return (
        <img
          src={imageUrl}
          alt="Series Thumbnail"
          className="w-full h-full object-cover"
          onError={() => setStatus(ThumbnailStatus.Failed)}
        />
      );
    }

    if (status === ThumbnailStatus.Failed) {
      return (
        <div className="flex flex-col items-center justify-center w-full h-full bg-[#15181E] relative overflow-hidden group">
          <svg className="w-7 h-7 text-sky-500/35" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="9" />
            <ellipse cx="12" cy="12" rx="5" ry="6.5" />
            <path d="M12 5v14M5 12h14" strokeOpacity="0.3" strokeDasharray="2 2" />
          </svg>
          <span className="absolute bottom-1 text-[8px] font-mono font-medium text-slate-400">{modality || 'CT'}</span>
        </div>
      );
    }

    // Skeleton/Loading states
    return (
      <div className="flex flex-col items-center justify-center w-full h-full bg-[#15181E] relative overflow-hidden">
        {/* Shimmer effect */}
        <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent" />
        <span className="text-[11px] font-sans font-bold text-[#3B82F6] opacity-50">{modality || 'IMG'}</span>
        {status === ThumbnailStatus.Rendering && <span className="absolute bottom-1 text-[8px] text-[#8B949E]">Render</span>}
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      className="w-[54px] h-[54px] bg-black border border-[#353C48] rounded-[4px] shrink-0 flex items-center justify-center relative overflow-hidden"
    >
      {renderContent()}

      {/* Overlays */}
      <span className="absolute top-[2px] left-[3px] text-[7px] text-[#3B82F6] font-bold z-10">{modality}</span>
      <span className="absolute bottom-[2px] right-[3px] text-[7px] text-green-500 font-mono-numbers z-10">{imagesCount}</span>
    </div>
  );
}

