import React, { useState, useEffect, useRef, useMemo } from 'react';
import ViewportOverlay, { ViewportOverlayData } from './ViewportOverlay';
import ViewportPlaceholder from './ViewportPlaceholder';
import ViewportContextMenu from './ViewportContextMenu';
import { API_BASE_URL } from '../config';
import { addInstanceMetadata, initCornerstone } from '../initCornerstone';
import { getCatalogSeries, generateCatalogInstances } from '../sampleStudyCatalog';

import {
  RenderingEngine,
  type Types,
  Enums,
  getRenderingEngine,
  eventTarget,
} from '@cornerstonejs/core';
import {
  ToolGroupManager,
  Enums as ToolsEnums,
  annotation as cornerstoneAnnotation,
  utilities as toolsUtilities,
} from '@cornerstonejs/tools';

const formatDicomDate = (dateStr?: string) => {
  if (!dateStr || dateStr.length !== 8) return dateStr || '-';
  const year = dateStr.substring(0, 4);
  const month = dateStr.substring(4, 6);
  const day = dateStr.substring(6, 8);
  return `${year}-${month}-${day}`;
};

const calculateAge = (birthDate?: string) => {
  if (!birthDate || birthDate.length !== 8) return '48Y';
  const birthYear = parseInt(birthDate.substring(0, 4), 10);
  const currentYear = new Date().getFullYear();
  return `${currentYear - birthYear}Y`;
};

interface ViewportProps {
  index: number;
  active: boolean;
  focused: boolean;
  activeTool: string;
  vizMode?: string;
  viewportCommand: { type: string; viewportId: number; timestamp: number } | null;
  onSelect: () => void;
  onFocus: () => void;
  onBlur: () => void;
  onStatsChange?: (stats: any) => void;
  study?: any | null;
  metadataOverlayOpen?: boolean;
  onDoubleClick?: () => void;
  onActionCommand?: (action: string) => void;
  readOnly?: boolean;
}

const getViewportData = (index: number): ViewportOverlayData => {
  const planes = ['Axial', 'Sagittal', 'Coronal'];
  const plane = planes[(index - 1) % 3];

  const seriesNum = (index % 2 === 1) ? 2 : 3;
  const totalImages = 183;

  let orientation = { top: 'A', bottom: 'P', left: 'R', right: 'L' };
  if (plane === 'Sagittal') {
    orientation = { top: 'S', bottom: 'I', left: 'A', right: 'P' };
  } else if (plane === 'Coronal') {
    orientation = { top: 'S', bottom: 'I', left: 'R', right: 'L' };
  }

  let windowWidth = 1213;
  let windowLevel = 698;

  return {
    patientName: '-',
    patientId: '-',
    age: '-',
    gender: '-',
    studyDescription: '',
    studyDate: '-',
    studyTime: '-',
    seriesNumber: seriesNum,
    imageNumber: 63,
    totalImages: totalImages,
    zoom: '100%',
    sliceThickness: '1.25 mm',
    compression: 'Lossless',
    windowWidth: windowWidth,
    windowLevel: windowLevel,
    resolution: '512 × 512',
    plane: plane,
    orientation: orientation,
    spacing: '0.68 mm'
  };
};

export default function Viewport({
  index, active, focused, activeTool, vizMode = '2d', viewportCommand, onSelect, onFocus, onBlur, onStatsChange, study, metadataOverlayOpen, onDoubleClick, onActionCommand, readOnly
}: ViewportProps) {
  const [currentSeriesId, setCurrentSeriesId] = useState<string | null>(null);
  const [instancesList, setInstancesList] = useState<any[]>([]);
  const instancesListRef = useRef<any[]>([]);
  instancesListRef.current = instancesList;
  const [currentSlice, setCurrentSlice] = useState(1);
  const [totalImages, setTotalImages] = useState(183);
  const [studyDesc, setStudyDesc] = useState('');
  const [seriesNum, setSeriesNum] = useState(index);
  const [windowWidth, setWindowWidth] = useState(400);
  const [windowLevel, setWindowLevel] = useState(40);
  const [zoom, setZoom] = useState(1);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const hasCenteredInitialCameraRef = useRef<boolean>(false);

  const [cinePlaying, setCinePlaying] = useState(false);
  const [cineFps, setCineFps] = useState(15);

  const [isScrubbing, setIsScrubbing] = useState(false);
  const [showScrollTooltip, setShowScrollTooltip] = useState(false);
  const scrollbarTrackRef = useRef<HTMLDivElement>(null);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [viewportReady, setViewportReady] = useState(false);

  const elementRef = useRef<HTMLDivElement>(null);
  const renderingEngineId = 'medview-rendering-engine';
  const viewportId = `viewport-${index}`;
  const toolGroupId = `toolgroup-${index}`;

  const isEmpty = !study || !currentSeriesId;
  const lastCommandTimestamp = useRef(0);
  const lastImageIndexRef = useRef<number>(-1);
  const isProgrammaticUpdateRef = useRef<boolean>(false);
  const currentWwRef = useRef<number>(400);
  const currentWcRef = useRef<number>(40);
  const currentZoomRef = useRef<number>(1);


  const baseData = useMemo(() => {
    const data = getViewportData(index);
    if (study) {
      data.patientName = study.patientName;
      data.patientId = study.patientId;
      data.age = calculateAge(study.patientBirthDate);
      data.gender = study.patientSex || 'O';
      data.studyDescription = study.studyDescription || data.studyDescription;
      data.studyDate = formatDicomDate(study.studyDate);
      data.studyTime = study.studyTime ? `${study.studyTime.substring(0, 2)}:${study.studyTime.substring(2, 4)}:${study.studyTime.substring(4, 6)}` : data.studyTime;
    }
    return data;
  }, [index, study]);

  const studyUid = study?.studyInstanceUid || study?.study_instance_uid;
  const prevStudyUidRef = useRef<string | null>(null);

  // Reset viewport only when study UID actually changes
  useEffect(() => {
    if (studyUid !== prevStudyUidRef.current) {
      prevStudyUidRef.current = studyUid || null;
      setCurrentSeriesId(null);
      setInstancesList([]);
      setCurrentSlice(1);
      setLoadingError(null);
      hasCenteredInitialCameraRef.current = false;
    }
  }, [studyUid]);

  // Reset initial centered flag whenever current series changes
  useEffect(() => {
    hasCenteredInitialCameraRef.current = false;
  }, [currentSeriesId]);

  // Auto-initialize series list with endpoint fallback
  useEffect(() => {
    if (studyUid && !currentSeriesId) {
      setIsLoading(true);
      setLoadingError(null);

      const fetchSeries = async () => {
        const dynamicPacs = typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:3001` : 'http://127.0.0.1:3001';
        const endpoints = [
          `${API_BASE_URL}/api/studies/${studyUid}/series`,
          `${dynamicPacs}/api/studies/${studyUid}/series`,
          `http://127.0.0.1:8000/api/studies/${studyUid}/series`,
          `http://127.0.0.1:3001/api/studies/${studyUid}/series`
        ];
        const uniqueEndpoints = [...new Set(endpoints)];
        let seriesList: any[] = [];
        let lastErr: any = null;

        for (const ep of uniqueEndpoints) {
          try {
            const res = await fetch(ep);
            if (res.ok) {
              const data = await res.json();
              const list = Array.isArray(data) ? data : (data?.data || []);
              if (list.length > 0) {
                seriesList = list;
                break;
              }
            }
          } catch (e) {
            lastErr = e;
          }
        }

        // Resilient fallback to sample catalog if remote backend cannot be reached directly
        if (seriesList.length === 0) {
          const catalogSeries = getCatalogSeries(studyUid);
          if (catalogSeries && catalogSeries.length > 0) {
            seriesList = catalogSeries;
          }
        }

        if (seriesList.length > 0) {
          const seriesIndex = (index - 1) % seriesList.length;
          const targetSeries = seriesList[seriesIndex];
          if (targetSeries) {
            const targetSeriesUid = targetSeries.series_instance_uid || targetSeries.seriesInstanceUid;
            setCurrentSeriesId(targetSeriesUid);
            setTotalImages(targetSeries.number_of_series_related_instances || targetSeries.numberOfSeriesRelatedInstances || targetSeries.num_instances || 183);
            setStudyDesc(targetSeries.series_description || targetSeries.seriesDescription || baseData.studyDescription);
            setSeriesNum(targetSeries.series_number ?? targetSeries.seriesNumber ?? index);
          }
        } else {
          setIsLoading(false);
          setLoadingError(`Could not find series for study ${studyUid}. Check PACS connection: ${lastErr?.message || 'Empty list'}`);
        }
      };

      fetchSeries();
    }
  }, [studyUid, currentSeriesId, index]);

  // Fetch SOP Instances list with dual-endpoint fallback
  useEffect(() => {
    if (currentSeriesId) {
      setIsLoading(true);
      setLoadingError(null);

      const fetchInstances = async () => {
        const dynamicPacs = typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:3001` : 'http://127.0.0.1:3001';
        const endpoints = [
          `${API_BASE_URL}/api/series/${currentSeriesId}/instances`,
          `${dynamicPacs}/api/series/${currentSeriesId}/instances`,
          `http://127.0.0.1:8000/api/series/${currentSeriesId}/instances`,
          `http://127.0.0.1:3001/api/series/${currentSeriesId}/instances`
        ];
        const uniqueEndpoints = [...new Set(endpoints)];
        let instances: any[] = [];
        let lastErr: any = null;

        for (const ep of uniqueEndpoints) {
          try {
            const res = await fetch(ep);
            if (res.ok) {
              const data = await res.json();
              const list = Array.isArray(data) ? data : (data?.data || []);
              if (list.length > 0) {
                instances = list;
                break;
              }
            }
          } catch (e) {
            lastErr = e;
          }
        }

        // Resilient fallback to catalog instances if server is offline or on public cloud
        if (instances.length === 0) {
          instances = generateCatalogInstances(currentSeriesId, totalImages || 175);
        }

        if (instances.length > 0) {
          setInstancesList(instances);
          setTotalImages(instances.length);
          setCurrentSlice(1);
          setIsLoading(false);
        } else {
          setIsLoading(false);
          setLoadingError(`No DICOM instances found for series ${currentSeriesId}. ${lastErr?.message || 'Check server status.'}`);
        }
      };

      fetchInstances();
    } else {
      setInstancesList([]);
      setIsLoading(false);
    }
  }, [currentSeriesId]);

  // Initialize Cornerstone Viewport
  useEffect(() => {
    if (!elementRef.current) return;
    let isMounted = true;

    const element = elementRef.current;

    // Use the global rendering engine created during initCornerstone().
    // Never create a new one per-viewport — that causes ID collisions when
    // multiple viewports share the same renderingEngineId.
    let renderingEngine = getRenderingEngine(renderingEngineId);
    if (!renderingEngine) {
      // Fallback: only create if the global init somehow missed it
      renderingEngine = new RenderingEngine(renderingEngineId);
    }

    // Disable stale element if the DOM node changed (e.g. React remount)
    try {
      const existingViewport = renderingEngine.getViewport(viewportId);
      if (existingViewport && existingViewport.element !== element) {
        renderingEngine.disableElement(viewportId);
      }
    } catch (e) {
      console.warn('[Cornerstone3D] disableElement notice:', e);
    }

    // Enable this viewport's canvas
    const ensureViewportReady = () => {
      if (!isMounted) return;
      try {
        if (!renderingEngine.getViewport(viewportId)) {
          if (element.clientWidth === 0 || element.clientHeight === 0) {
            console.log(`[Viewport] Waiting for dimensions on ${viewportId}...`);
            setTimeout(ensureViewportReady, 50);
            return;
          }
          console.log(`[Viewport] Enabling element ${viewportId} with size ${element.clientWidth}x${element.clientHeight}`);
          const viewportInput = {
            viewportId,
            type: Enums.ViewportType.STACK,
            element,
            defaultOptions: {
              background: [0, 0, 0] as Types.Point3,
            },
          };
          renderingEngine.enableElement(viewportInput);
          setViewportReady(true);
        } else {
          setViewportReady(true);
        }
      } catch (e) {
        console.warn('[Cornerstone3D] enableElement notice:', e);
      }
    };

    initCornerstone().then(() => {
      if (isMounted) ensureViewportReady();
    }).catch((err) => {
      console.warn('[Viewport] initCornerstone warning:', err);
      if (isMounted) ensureViewportReady();
    });

    // Create/reuse per-viewport tool group
    let toolGroup = ToolGroupManager.getToolGroup(toolGroupId);
    if (!toolGroup) {
      toolGroup = ToolGroupManager.createToolGroup(toolGroupId)!;
      // These tool names must match the global addTool() calls in initCornerstone.ts
      toolGroup.addTool('Pan');
      toolGroup.addTool('Zoom');
      toolGroup.addTool('WindowLevel');
      toolGroup.addTool('StackScroll');
      toolGroup.addTool('Length');
      toolGroup.addTool('Angle');
      toolGroup.addTool('CobbAngle');
      toolGroup.addTool('EllipticalROI');
      toolGroup.addTool('RectangleROI');
      toolGroup.addTool('Probe');
      toolGroup.addTool('Bidirectional');
      toolGroup.addTool('ArrowAnnotate', {
        configuration: {
          getTextCallback: (callback: (text: string) => void) => {
            const text = window.prompt('Enter annotation text:');
            callback(text || 'Annotation');
          },
          changeTextCallback: (data: any, eventData: any, callback: (text: string) => void) => {
            const text = window.prompt('Change annotation text:', data?.text || '');
            callback(text || 'Annotation');
          }
        }
      });
      toolGroup.addTool('PlanarFreehandROI');

      // Activate default navigation tools so the viewport is immediately interactive.
      // Touch bindings enable natural 1-finger pan and 2-finger pinch zoom on mobile devices.
      toolGroup.setToolActive('Pan', {
        bindings: [
          { mouseButton: ToolsEnums.MouseBindings.Primary },
          { numTouchPoints: 1 }
        ],
      });
      toolGroup.setToolActive('Zoom', {
        bindings: [
          { mouseButton: ToolsEnums.MouseBindings.Secondary },
          { numTouchPoints: 2 }
        ],
      });
      toolGroup.setToolActive('WindowLevel', {
        bindings: [{ mouseButton: ToolsEnums.MouseBindings.Auxiliary }],
      });
      // StackScroll is passive — wheel scrolling is handled by the custom handleWheel listener below
      toolGroup.setToolPassive('StackScroll');
    }
    toolGroup.addViewport(viewportId, renderingEngineId);

    // High performance smooth slice sliding wheel listener (RAF throttled to prevent update storm)
    let wheelRaf: number | null = null;
    let accumulatedWheelDelta = 0;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      accumulatedWheelDelta += e.deltaY > 0 ? 1 : -1;

      if (wheelRaf !== null) return;
      wheelRaf = requestAnimationFrame(() => {
        wheelRaf = null;
        if (!isMounted) return;
        const delta = accumulatedWheelDelta;
        accumulatedWheelDelta = 0;
        if (delta === 0) return;

        const viewport = getRenderingEngine(renderingEngineId)?.getViewport(viewportId) as Types.IStackViewport;
        if (viewport) {
          const currentIdx = viewport.getCurrentImageIdIndex();
          const imageIds = viewport.getImageIds();
          if (imageIds && imageIds.length > 0) {
            const newIdx = Math.max(0, Math.min(imageIds.length - 1, currentIdx + delta));
            if (newIdx !== currentIdx) {
              lastImageIndexRef.current = newIdx;
              isProgrammaticUpdateRef.current = true;
              viewport.setImageIdIndex(newIdx).finally(() => {
                setTimeout(() => {
                  isProgrammaticUpdateRef.current = false;
                }, 50);
              });
              setCurrentSlice(newIdx + 1);
            }
          }
        }
      });
    };
    element.addEventListener('wheel', handleWheel, { passive: false });

    // Sync slice index to local react state on stack new image events (RAF-throttled to break render feedback loops)
    let newImageRaf: number | null = null;
    const onNewImage = (evt: any) => {
      const { imageIdIndex } = evt.detail;
      if (typeof imageIdIndex === 'number') {
        if (lastImageIndexRef.current === imageIdIndex) return;
        lastImageIndexRef.current = imageIdIndex;
        if (newImageRaf !== null) cancelAnimationFrame(newImageRaf);
        newImageRaf = requestAnimationFrame(() => {
          newImageRaf = null;
          if (!isMounted) return;
          setCurrentSlice(prev => (prev !== imageIdIndex + 1 ? imageIdIndex + 1 : prev));
        });
      }
    };
    element.addEventListener(Enums.Events.STACK_NEW_IMAGE, onNewImage);

    // Sync window/level changes to local react state (throttled via RAF to prevent infinite update depth)
    let cameraModifiedRaf: number | null = null;
    const onCameraModified = () => {
      if (!isMounted || isProgrammaticUpdateRef.current) return;
      if (cameraModifiedRaf !== null) return;
      cameraModifiedRaf = requestAnimationFrame(() => {
        cameraModifiedRaf = null;
        if (!isMounted || isProgrammaticUpdateRef.current) return;
        const activeViewport = getRenderingEngine(renderingEngineId)?.getViewport(viewportId) as Types.IStackViewport;
        if (activeViewport) {
          const { lower, upper } = activeViewport.getProperties().voiRange || { lower: 0, upper: 400 };
          const newWw = Math.round(upper - lower);
          const newWc = Math.round(lower + (upper - lower) / 2);
          const rawZoom = activeViewport.getZoom();
          const newZoom = !isNaN(rawZoom) && rawZoom > 0 ? Math.round(rawZoom * 100) / 100 : 1;

          if (Math.abs(currentWwRef.current - newWw) > 2) {
            currentWwRef.current = newWw;
            setWindowWidth(newWw);
          }
          if (Math.abs(currentWcRef.current - newWc) > 2) {
            currentWcRef.current = newWc;
            setWindowLevel(newWc);
          }
          if (Math.abs(currentZoomRef.current - newZoom) > 0.05) {
            currentZoomRef.current = newZoom;
            setZoom(newZoom);
          }
        }
      });
    };
    element.addEventListener(Enums.Events.CAMERA_MODIFIED, onCameraModified);
    element.addEventListener(Enums.Events.VOI_MODIFIED, onCameraModified);

    const onImageRendered = () => {
      if (!isMounted) return;
      const activeEngine = getRenderingEngine(renderingEngineId);
      if (!activeEngine) return;
      const activeViewport = activeEngine.getViewport(viewportId) as Types.IStackViewport;
      if (!activeViewport) return;

      const imgData = activeViewport.getImageData();
      if (imgData && imgData.dimensions && imgData.dimensions[0] > 0) {
        if (!hasCenteredInitialCameraRef.current) {
          hasCenteredInitialCameraRef.current = true;
          const targetIndex = activeViewport.getCurrentImageIdIndex();
          const targetInst = instancesListRef.current?.[targetIndex];
          let rawWc = targetInst?.window_center ?? targetInst?.windowCenter;
          let rawWw = targetInst?.window_width ?? targetInst?.windowWidth;
          if (Array.isArray(rawWc)) rawWc = rawWc[0];
          if (Array.isArray(rawWw)) rawWw = rawWw[0];
          const numWc = Number(rawWc);
          const numWw = Number(rawWw);

          activeViewport.resetCamera();
          if (!isNaN(numWc) && !isNaN(numWw) && numWw > 0) {
            const ww = Math.round(numWw);
            const wc = Math.round(numWc);
            activeViewport.setProperties({ voiRange: { lower: wc - ww / 2, upper: wc + ww / 2 } });
            setWindowWidth(ww);
            setWindowLevel(wc);
          }
          activeViewport.render();
        }
      }
    };
    element.addEventListener(Enums.Events.IMAGE_RENDERED, onImageRendered);

    const onImageLoadFailed = (evt: any) => {
      console.error(`[Cornerstone3D] Image load failed on ${viewportId}:`, evt.detail);
      setLoadingError(`Image decode failed: ${evt.detail?.error || 'Unsupported or corrupted DICOM slice'}`);
    };
    element.addEventListener(Enums.Events.IMAGE_LOAD_FAILED, onImageLoadFailed);

    // Attach ResizeObserver to handle element size changes & grid layout updates (guard against sub-pixel loops)
    let lastObservedWidth = 0;
    let lastObservedHeight = 0;
    const resizeObserver = new ResizeObserver((entries) => {
      if (!isMounted) return;
      let targetWidth = 0;
      let targetHeight = 0;
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (Math.abs(width - lastObservedWidth) < 2 && Math.abs(height - lastObservedHeight) < 2) {
          return;
        }
        targetWidth = width;
        targetHeight = height;
        lastObservedWidth = width;
        lastObservedHeight = height;
      }
      if (targetWidth <= 0 || targetHeight <= 0) {
        // Element is collapsed or hidden; do not resize or render WebGL to 0x0
        return;
      }
      try {
        const engine = getRenderingEngine(renderingEngineId);
        if (engine) {
          engine.resize(true, true);
          const vp = engine.getViewport(viewportId);
          if (vp) {
            vp.render();
          }
        }
      } catch (e) {
        // ignore
      }
    });
    resizeObserver.observe(element);

    return () => {
      isMounted = false;
      if (wheelRaf !== null) {
        cancelAnimationFrame(wheelRaf);
        wheelRaf = null;
      }
      if (newImageRaf !== null) {
        cancelAnimationFrame(newImageRaf);
        newImageRaf = null;
      }
      if (cameraModifiedRaf !== null) {
        cancelAnimationFrame(cameraModifiedRaf);
        cameraModifiedRaf = null;
      }
      resizeObserver.disconnect();
      element.removeEventListener('wheel', handleWheel);
      element.removeEventListener(Enums.Events.STACK_NEW_IMAGE, onNewImage);
      element.removeEventListener(Enums.Events.CAMERA_MODIFIED, onCameraModified);
      element.removeEventListener(Enums.Events.VOI_MODIFIED, onCameraModified);
      element.removeEventListener(Enums.Events.IMAGE_RENDERED, onImageRendered);
      element.removeEventListener(Enums.Events.IMAGE_LOAD_FAILED, onImageLoadFailed);
      try {
        const tg = ToolGroupManager.getToolGroup(toolGroupId);
        if (tg) {
          tg.removeViewports(renderingEngineId, viewportId);
        }
      } catch (e) {
        // ignore
      }
      try {
        const engine = getRenderingEngine(renderingEngineId);
        if (engine && engine.getViewport(viewportId)) {
          engine.disableElement(viewportId);
        }
      } catch (e) {
        // ignore
      }
    };
  }, [viewportId, toolGroupId]);

  // Set local stack imageIds inside Cornerstone Stack Viewport
  // NOTE: Guard only on instancesList.length — do NOT use isEmpty here because
  // isEmpty depends on currentSeriesId which may be set slightly after instancesList fills.
  useEffect(() => {
    let isMounted = true;
    let retryTimer: any = null;
    let retries = 0;
    if (!elementRef.current || instancesList.length === 0 || !viewportReady) return;

    const checkAndSetStack = () => {
      if (!isMounted) return;
      const renderingEngine = getRenderingEngine(renderingEngineId);
      if (!renderingEngine) {
        if (retries++ < 20) retryTimer = setTimeout(checkAndSetStack, 50);
        return;
      }

      const viewport = renderingEngine.getViewport(viewportId) as Types.IStackViewport;
      if (!viewport) {
        if (retries++ < 20) retryTimer = setTimeout(checkAndSetStack, 50);
        return;
      }

      const imageIds = instancesList.map((inst, idx) => {
        const sopUid = inst.sop_instance_uid || inst.sopInstanceUid;
        const imgId = `wadouri:${API_BASE_URL}/api/instances/${sopUid}/file`;
        const rawIpp = inst.image_position || inst.imagePositionPatient;
        const rawIop = inst.image_orientation || inst.imageOrientationPatient;
        const rawPs = inst.pixel_spacing || inst.pixelSpacing;
        const meta: any = {
          imagePositionPatient: (Array.isArray(rawIpp) && rawIpp.length >= 3) ? rawIpp : [0, 0, idx * 1.25],
          imageOrientationPatient: (Array.isArray(rawIop) && rawIop.length >= 6) ? rawIop : [1, 0, 0, 0, 1, 0],
          sliceThickness: Number(inst.slice_thickness || inst.sliceThickness || 1.25) || 1.25,
        };
        if (inst.bits_allocated !== undefined || inst.bitsAllocated !== undefined) meta.bitsAllocated = inst.bits_allocated ?? inst.bitsAllocated;
        if (inst.bits_stored !== undefined || inst.bitsStored !== undefined) meta.bitsStored = inst.bits_stored ?? inst.bitsStored;
        if (inst.high_bit !== undefined || inst.highBit !== undefined) meta.highBit = inst.high_bit ?? inst.highBit;
        if (inst.pixel_representation !== undefined || inst.pixelRepresentation !== undefined) meta.pixelRepresentation = inst.pixel_representation ?? inst.pixelRepresentation;
        if (inst.samples_per_pixel !== undefined || inst.samplesPerPixel !== undefined) meta.samplesPerPixel = inst.samples_per_pixel ?? inst.samplesPerPixel;
        if (Array.isArray(rawPs) && rawPs.length >= 2) {
          meta.pixelSpacing = rawPs;
        } else {
          meta.pixelSpacing = [1.0, 1.0];
        }
        if (inst.rows) meta.rows = inst.rows;
        const modality = inst.modality || inst.Modality || 'CT';
        meta.modality = modality;
        if (inst.window_center !== undefined || inst.windowCenter !== undefined) meta.windowCenter = inst.window_center ?? inst.windowCenter;
        if (inst.window_width !== undefined || inst.windowWidth !== undefined) meta.windowWidth = inst.window_width ?? inst.windowWidth;

        if (inst.rescale_intercept !== undefined || inst.rescaleIntercept !== undefined) {
          meta.rescaleIntercept = inst.rescale_intercept ?? inst.rescaleIntercept;
        } else {
          meta.rescaleIntercept = 0;
        }
        if (inst.rescale_slope !== undefined || inst.rescaleSlope !== undefined) {
          meta.rescaleSlope = inst.rescale_slope ?? inst.rescaleSlope;
        } else {
          meta.rescaleSlope = 1;
        }
        if (inst.photometric_interpretation || inst.photometricInterpretation) meta.photometricInterpretation = inst.photometric_interpretation || inst.photometricInterpretation;
        addInstanceMetadata(imgId, meta);
        return imgId;
      });

      const initialIndex = Math.min(Math.max(0, currentSlice - 1), imageIds.length - 1);
      lastImageIndexRef.current = initialIndex;

      isProgrammaticUpdateRef.current = true;
      viewport.setStack(imageIds, initialIndex).then(() => {
        if (!isMounted) return;
        try {
          const activeEngine = getRenderingEngine(renderingEngineId);
          if (!activeEngine || !activeEngine.getViewport(viewportId)) return;

          const targetIndex = initialIndex;
          let rawWc = instancesList[targetIndex]?.window_center ?? instancesList[targetIndex]?.windowCenter;
          let rawWw = instancesList[targetIndex]?.window_width ?? instancesList[targetIndex]?.windowWidth;
          if (Array.isArray(rawWc)) rawWc = rawWc[0];
          if (Array.isArray(rawWw)) rawWw = rawWw[0];
          let numWc = Number(rawWc);
          let numWw = Number(rawWw);
          if (!isNaN(numWc) && !isNaN(numWw) && numWw > 0) {
            const ww = Math.round(numWw);
            const wc = Math.round(numWc);
            viewport.setProperties({ voiRange: { lower: wc - ww / 2, upper: wc + ww / 2 } });
            setWindowWidth(ww);
            setWindowLevel(wc);
          } else {
            const props = viewport.getProperties();
            if (props && props.voiRange && !isNaN(props.voiRange.lower) && !isNaN(props.voiRange.upper)) {
              const ww = Math.round(props.voiRange.upper - props.voiRange.lower);
              const wc = Math.round(props.voiRange.lower + (props.voiRange.upper - props.voiRange.lower) / 2);
              setWindowWidth(prev => (Math.abs(prev - ww) > 1 ? ww : prev));
              setWindowLevel(prev => (Math.abs(prev - wc) > 1 ? wc : prev));
            } else {
              setWindowWidth(prev => (prev !== 400 ? 400 : prev));
              setWindowLevel(prev => (prev !== 40 ? 40 : prev));
            }
          }

          viewport.resetCamera();
          viewport.render();

          // Camera bounding box is 0 until the image is decoded by the worker.
          // Schedule camera reset checks to ensure parallelScale is adjusted from 1 to slice dimensions.
          const scheduleCameraReset = (delay: number) => {
            setTimeout(() => {
              if (!isMounted) return;
              const vp = getRenderingEngine(renderingEngineId)?.getViewport(viewportId) as Types.IStackViewport;
              if (vp) {
                const img = vp.getImageData();
                if (img && img.dimensions && img.dimensions[0] > 0) {
                  const cam = vp.getCamera();
                  if (cam.parallelScale <= 1.05 || !hasCenteredInitialCameraRef.current) {
                    hasCenteredInitialCameraRef.current = true;
                    vp.resetCamera();
                    if (!isNaN(numWc) && !isNaN(numWw) && numWw > 0) {
                      vp.setProperties({ voiRange: { lower: numWc - numWw / 2, upper: numWc + numWw / 2 } });
                    }
                    vp.render();
                  }
                }
              }
            }, delay);
          };
          scheduleCameraReset(60);
          scheduleCameraReset(200);
          scheduleCameraReset(500);

          // Defer background stack prefetching until visible slices have rendered
          if (elementRef.current) {
            setTimeout(() => {
              if (!isMounted || !elementRef.current) return;
              try {
                toolsUtilities.stackPrefetch.enable(elementRef.current);
              } catch (e) {
                // ignore
              }
            }, 3000);
          }
        } catch (err) {
          console.warn('[Cornerstone3D] Viewport setStack callback ignored (likely unmounted):', err);
        } finally {
          setTimeout(() => { isProgrammaticUpdateRef.current = false; }, 100);
        }
      }).catch((err) => {
        console.warn('[Cornerstone3D] Viewport setStack failed (likely unmounted):', err);
        isProgrammaticUpdateRef.current = false;
      });
    };

    checkAndSetStack();

    return () => {
      isMounted = false;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [instancesList, isEmpty, viewportReady]);

  // Update current slice when slide index changes
  useEffect(() => {
    if (isEmpty) return;
    const targetIndex = currentSlice - 1;
    // Skip if viewport is already showing or loading this index
    if (lastImageIndexRef.current === targetIndex) return;

    const renderingEngine = getRenderingEngine(renderingEngineId);
    if (!renderingEngine) return;

    const viewport = renderingEngine.getViewport(viewportId) as Types.IStackViewport;
    if (!viewport) return;

    const imageIds = viewport.getImageIds();
    if (imageIds && imageIds.length > 0) {
      const currentIdx = viewport.getCurrentImageIdIndex();
      if (currentIdx !== targetIndex && targetIndex >= 0 && targetIndex < imageIds.length) {
        lastImageIndexRef.current = targetIndex;
        viewport.setImageIdIndex(targetIndex);
      }
    }
  }, [currentSlice, isEmpty]);

  // When returning to 2D from 3D modes (MPR, VR), re-affirm the stack and re-render the current slice
  const prevVizModeRef = useRef<string>(vizMode);
  useEffect(() => {
    if (prevVizModeRef.current !== '2d' && vizMode === '2d') {
      const timer = setTimeout(() => {
        const renderingEngine = getRenderingEngine(renderingEngineId);
        if (!renderingEngine) return;
        const viewport = renderingEngine.getViewport(viewportId) as Types.IStackViewport;
        if (!viewport) return;
        const imageIds = viewport.getImageIds();
        if (imageIds && imageIds.length > 0) {
          const targetIndex = Math.min(Math.max(0, currentSlice - 1), imageIds.length - 1);
          viewport.setStack(imageIds, targetIndex).then(() => {
            viewport.render();
          }).catch((err) => {
            console.warn(`[Viewport ${viewportId}] setStack on 2D return notice:`, err);
          });
        }
      }, 100);
      return () => clearTimeout(timer);
    }
    prevVizModeRef.current = vizMode;
  }, [vizMode, currentSlice, viewportId]);

  // Wire tool bindings change to cornerstone ToolGroup manager
  useEffect(() => {
    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);
    if (!toolGroup) return;

    // Annotation-only tools — these get primary binding when active
    const annotationTools = ['Length', 'Angle', 'CobbAngle', 'EllipticalROI', 'RectangleROI', 'Probe', 'ArrowAnnotate', 'PlanarFreehandROI', 'Bidirectional'];
    // Navigation tools — always stay active with their respective bindings
    const navigationTools = ['Pan', 'Zoom', 'WindowLevel', 'StackScroll'];

    // Determine active Cornerstone tool name from our internal activeTool string
    let activeCornerstoneTool = 'Pan';
    if (activeTool === 'pan') activeCornerstoneTool = 'Pan';
    else if (activeTool === 'zoom') activeCornerstoneTool = 'Zoom';
    else if (activeTool === 'wl') activeCornerstoneTool = 'WindowLevel';
    else if (activeTool === 'scroll') activeCornerstoneTool = 'StackScroll';
    else if (activeTool === 'length') activeCornerstoneTool = 'Length';
    else if (activeTool === 'angle') activeCornerstoneTool = 'Angle';
    else if (activeTool === 'cobb_angle') activeCornerstoneTool = 'CobbAngle';
    else if (activeTool === 'ellipse') activeCornerstoneTool = 'EllipticalROI';
    else if (activeTool === 'rect') activeCornerstoneTool = 'RectangleROI';
    else if (activeTool === 'pixel_probe') activeCornerstoneTool = 'Probe';
    else if (['arrow', 'arrow_meas', 'text', 'annot_meas'].includes(activeTool)) activeCornerstoneTool = 'ArrowAnnotate';
    else if (['freehand', 'freehand_m', 'polygon'].includes(activeTool)) activeCornerstoneTool = 'PlanarFreehandROI';

    // Deactivate all annotation tools first
    annotationTools.forEach(t => {
      try { toolGroup.setToolPassive(t); } catch (_) {/* ignore */ }
    });

    if (annotationTools.includes(activeCornerstoneTool)) {
      // Deactivate all navigation tools first so they don't steal primary binding
      navigationTools.forEach(t => {
        try { toolGroup.setToolPassive(t); } catch (_) {/* ignore */ }
      });

      // User switched to an annotation tool: activate it on primary mouse button and 1-finger touch
      toolGroup.setToolActive(activeCornerstoneTool, {
        bindings: [
          { mouseButton: ToolsEnums.MouseBindings.Primary },
          { numTouchPoints: 1 }
        ],
      });
      // Keep navigation tools on secondary/auxiliary bindings
      toolGroup.setToolActive('Zoom', {
        bindings: [
          { mouseButton: ToolsEnums.MouseBindings.Secondary },
          { numTouchPoints: 2 }
        ],
      });
      toolGroup.setToolActive('WindowLevel', {
        bindings: [{ mouseButton: ToolsEnums.MouseBindings.Auxiliary }],
      });
    } else {
      // Navigation mode: assign primary LMB and 1-finger touch to the chosen nav tool
      navigationTools.forEach(t => {
        try { toolGroup.setToolPassive(t); } catch (_) {/* ignore */ }
      });
      toolGroup.setToolActive(activeCornerstoneTool, {
        bindings: [
          { mouseButton: ToolsEnums.MouseBindings.Primary },
          { numTouchPoints: 1 }
        ],
      });
      // Keep zoom on RMB and 2-finger pinch on mobile
      if (activeCornerstoneTool !== 'Zoom') {
        toolGroup.setToolActive('Zoom', {
          bindings: [
            { mouseButton: ToolsEnums.MouseBindings.Secondary },
            { numTouchPoints: 2 }
          ],
        });
      }
      if (activeCornerstoneTool !== 'WindowLevel') {
        toolGroup.setToolActive('WindowLevel', {
          bindings: [{ mouseButton: ToolsEnums.MouseBindings.Auxiliary }],
        });
      }
    }
  }, [activeTool, toolGroupId]);

  // Map database annotations loading
  useEffect(() => {
    if (study && currentSeriesId && elementRef.current) {
      fetch(`${API_BASE_URL}/api/measurements/${study.studyInstanceUid}`)
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) {
            // Register tools metadata/state inside Cornerstone Annotation Manager
            data.forEach((item: any) => {
              const imageId = `wadouri:${API_BASE_URL}/api/instances/${item.sop_instance_uid}/file`;

              let toolName = 'Length';
              if (item.tool_type === 'angle') toolName = 'Angle';
              else if (item.tool_type === 'cobb_angle') toolName = 'CobbAngle';
              else if (item.tool_type === 'ellipse') toolName = 'EllipticalROI';
              else if (item.tool_type === 'rect') toolName = 'RectangleROI';
              else if (item.tool_type === 'probe') toolName = 'Probe';
              else if (['freehand', 'freehand_m', 'polygon', 'planarfreehand'].includes(item.tool_type)) toolName = 'PlanarFreehandROI';
              else if (['arrow', 'arrow_meas', 'text', 'annot_meas', 'arrowannotate'].includes(item.tool_type)) toolName = 'ArrowAnnotate';

              const cornerstoneAnn = {
                annotationUID: item.id,
                metadata: {
                  toolName,
                  referencedImageId: imageId,
                  FrameOfReferenceUID: `${currentSeriesId}.frameOfRef`,
                },
                data: {
                  handles: {
                    points: (item.points || []).map((p: any) => [p.x, p.y, 0]),
                  },
                  cachedStats: {
                    [toolName]: {
                      value: item.calculated_value,
                    }
                  }
                }
              };
              cornerstoneAnnotation.state.addAnnotation(cornerstoneAnn, elementRef.current!);
            });
          }
        })
        .catch(err => console.error("Error loading annotations:", err));
    }
  }, [study, currentSeriesId]);

  // Hook drawing added/modified/removed triggers to database sync calls
  useEffect(() => {
    if (!study || !currentSeriesId || !elementRef.current) return;

    const onAnnotationAddedOrModified = (evt: any) => {
      if (readOnly) return;
      const { annotation: ann } = evt.detail;
      const points = (ann.data?.handles?.points || []).map((p: any) => ({ x: p[0], y: p[1] }));

      let tool_type = ann.metadata.toolName.toLowerCase().replace('roi', '');
      if (ann.metadata.toolName === 'PlanarFreehandROI') tool_type = 'freehand';
      if (ann.metadata.toolName === 'ArrowAnnotate') tool_type = 'arrow';

      const payload = {
        id: ann.annotationUID,
        tool_type,
        points,
        calculated_value: ann.data?.cachedStats?.[ann.metadata.toolName]?.value || 0,
        mean_hu: 0,
        study_instance_uid: study.studyInstanceUid,
        series_instance_uid: currentSeriesId,
        sop_instance_uid: instancesList[currentSlice - 1]?.sop_instance_uid || `${currentSeriesId}.1`
      };

      fetch(`${API_BASE_URL}/api/measurements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(err => console.error("Failed to save annotation:", err));
    };

    const onAnnotationRemoved = (evt: any) => {
      if (readOnly) return;
      const { annotation: ann } = evt.detail;
      fetch(`${API_BASE_URL}/api/measurements/${ann.annotationUID}`, {
        method: 'DELETE'
      }).catch(err => console.error("Failed to delete annotation:", err));
    };

    eventTarget.addEventListener(ToolsEnums.Events.ANNOTATION_ADDED, onAnnotationAddedOrModified);
    eventTarget.addEventListener(ToolsEnums.Events.ANNOTATION_MODIFIED, onAnnotationAddedOrModified);
    eventTarget.addEventListener(ToolsEnums.Events.ANNOTATION_REMOVED, onAnnotationRemoved);

    return () => {
      eventTarget.removeEventListener(ToolsEnums.Events.ANNOTATION_ADDED, onAnnotationAddedOrModified);
      eventTarget.removeEventListener(ToolsEnums.Events.ANNOTATION_MODIFIED, onAnnotationAddedOrModified);
      eventTarget.removeEventListener(ToolsEnums.Events.ANNOTATION_REMOVED, onAnnotationRemoved);
    };
  }, [study, currentSeriesId, instancesList, currentSlice, readOnly]);

  // WebSocket / cross-viewport session synchronizer broadcast dispatcher
  useEffect(() => {
    if (!active || isEmpty || isProgrammaticUpdateRef.current) return;
    if (localStorage.getItem('medview-sync-enabled') === 'false') return;

    const handler = setTimeout(() => {
      if (isProgrammaticUpdateRef.current) return;
      window.dispatchEvent(new CustomEvent('viewport-sync', {
        detail: {
          originIndex: index,
          zoom,
          windowWidth,
          windowLevel,
          currentSlice
        }
      }));
    }, 50);

    return () => clearTimeout(handler);
  }, [active, index, zoom, windowWidth, windowLevel, currentSlice, isEmpty]);

  // Sync listener applying properties onto viewport
  useEffect(() => {
    const handleSync = (e: any) => {
      if (localStorage.getItem('medview-sync-enabled') === 'false') return;
      if (e.detail.originIndex === index || isEmpty) return;

      const renderingEngine = getRenderingEngine(renderingEngineId);
      if (!renderingEngine) return;
      const viewport = renderingEngine.getViewport(viewportId) as Types.IStackViewport;
      if (!viewport) return;

      isProgrammaticUpdateRef.current = true;
      try {
        if (e.detail.currentSlice !== undefined) {
          const targetSlice = Math.min(totalImages, e.detail.currentSlice);
          setCurrentSlice(prev => (prev !== targetSlice ? targetSlice : prev));
        }
        if (e.detail.zoom !== undefined) {
          currentZoomRef.current = e.detail.zoom;
          setZoom(e.detail.zoom);
          viewport.setZoom(e.detail.zoom);
        }
        if (e.detail.windowWidth !== undefined && e.detail.windowLevel !== undefined) {
          currentWwRef.current = e.detail.windowWidth;
          currentWcRef.current = e.detail.windowLevel;
          setWindowWidth(e.detail.windowWidth);
          setWindowLevel(e.detail.windowLevel);
          const lower = e.detail.windowLevel - e.detail.windowWidth / 2;
          const upper = e.detail.windowLevel + e.detail.windowWidth / 2;
          viewport.setProperties({ voiRange: { lower, upper } });
        }
        viewport.render();
      } finally {
        setTimeout(() => {
          isProgrammaticUpdateRef.current = false;
        }, 120);
      }
    };

    window.addEventListener('viewport-sync', handleSync);
    return () => window.removeEventListener('viewport-sync', handleSync);
  }, [index, totalImages, isEmpty]);

  // Stats bar callback integration (cached to prevent duplicate parent re-renders)
  const lastStatsJsonRef = useRef<string>('');
  useEffect(() => {
    if (active && onStatsChange && !isEmpty) {
      const statsPayload = {
        imageIndex: currentSlice,
        totalImages: totalImages,
        zoom: `${Math.round(zoom * 100)}%`,
        windowWidth: Math.round(windowWidth),
        windowLevel: Math.round(windowLevel),
        resolution: baseData.resolution || '512 × 512',
        spacing: baseData.spacing || '0.68 mm',
        plane: baseData.plane,
        seriesNumber: seriesNum,
        seriesDescription: studyDesc,
        seriesInstanceUid: currentSeriesId
      };
      const statsJson = JSON.stringify(statsPayload);
      if (lastStatsJsonRef.current !== statsJson) {
        lastStatsJsonRef.current = statsJson;
        onStatsChange(statsPayload);
      }
    }
  }, [active, currentSlice, zoom, windowWidth, windowLevel, totalImages, onStatsChange, seriesNum, studyDesc, currentSeriesId, isEmpty]);

  // Cine Loop controller
  useEffect(() => {
    if (!cinePlaying || isEmpty) return;

    let lastTime = performance.now();
    const interval = 1000 / cineFps;
    let requestRef: number;

    const animate = (time: number) => {
      if (time - lastTime >= interval) {
        setCurrentSlice((prev) => (prev >= totalImages ? 1 : prev + 1));
        lastTime = time;
      }
      requestRef = requestAnimationFrame(animate);
    };

    requestRef = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef);
  }, [cinePlaying, cineFps, isEmpty, totalImages]);

  // Keyboard slice navigation listener
  useEffect(() => {
    if (!active || isEmpty || totalImages <= 1) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((document.activeElement as HTMLElement)?.tagName)) return;

      switch (e.key) {
        case 'ArrowUp':
        case 'ArrowLeft':
          e.preventDefault();
          setCurrentSlice(prev => Math.max(1, prev - 1));
          break;
        case 'ArrowDown':
        case 'ArrowRight':
          e.preventDefault();
          setCurrentSlice(prev => Math.min(totalImages, prev + 1));
          break;
        case 'PageUp':
          e.preventDefault();
          setCurrentSlice(prev => Math.max(1, prev - 10));
          break;
        case 'PageDown':
          e.preventDefault();
          setCurrentSlice(prev => Math.min(totalImages, prev + 10));
          break;
        case 'Home':
          e.preventDefault();
          setCurrentSlice(1);
          break;
        case 'End':
          e.preventDefault();
          setCurrentSlice(totalImages);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [active, isEmpty, totalImages]);

  // Interactive Slice Scrollbar mouse drag / scrubbing handler
  const handleScrollbarMouseDown = (e: React.MouseEvent) => {
    if (isEmpty || totalImages <= 1 || !scrollbarTrackRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    setIsScrubbing(true);

    const updateSliceFromMouse = (mouseY: number) => {
      if (!scrollbarTrackRef.current) return;
      const rect = scrollbarTrackRef.current.getBoundingClientRect();
      const relativeY = Math.max(0, Math.min(mouseY - rect.top, rect.height));
      const percentage = rect.height > 0 ? relativeY / rect.height : 0;
      const targetSlice = Math.max(1, Math.min(totalImages, Math.round(percentage * (totalImages - 1)) + 1));
      setCurrentSlice(targetSlice);
    };

    updateSliceFromMouse(e.clientY);

    const handleMouseMove = (moveEvt: MouseEvent) => {
      updateSliceFromMouse(moveEvt.clientY);
    };

    const handleMouseUp = () => {
      setIsScrubbing(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedSeriesUid = e.dataTransfer.getData('application/x-dicom-series') || e.dataTransfer.getData('text/plain');
    if (droppedSeriesUid) {
      setCurrentSeriesId(droppedSeriesUid);
      setCurrentSlice(1);
    }
  };

  // Process viewport command signals
  useEffect(() => {
    if (viewportCommand && (viewportCommand.viewportId === index || viewportCommand.viewportId === -1) && viewportCommand.timestamp > lastCommandTimestamp.current) {
      lastCommandTimestamp.current = viewportCommand.timestamp;

      if (viewportCommand.type.startsWith('loadSeries:')) {
        const parts = viewportCommand.type.split(':');
        const label = parts[1] || '';
        const maxSlices = parseInt(parts[2], 10) || 183;
        const seriesId = parts[3] || '';
        const seriesNumVal = parseInt(parts[4], 10) || index;
        if (seriesId) {
          setCurrentSeriesId(seriesId);
          setStudyDesc(label);
          setSeriesNum(seriesNumVal);
          setTotalImages(maxSlices);
          setCurrentSlice(1);
        }
        return;
      }

      const renderingEngine = getRenderingEngine(renderingEngineId);
      if (!renderingEngine) return;
      const viewport = renderingEngine.getViewport(viewportId) as Types.IStackViewport;
      if (!viewport) return;

      switch (viewportCommand.type) {
        case 'rotate':
          viewport.setViewPresentation({ rotation: (viewport.getRotation() || 0) + 90 });
          break;
        case 'fliph':
          viewport.setCamera({ flipHorizontal: !viewport.getCamera().flipHorizontal });
          break;
        case 'flipv':
          viewport.setCamera({ flipVertical: !viewport.getCamera().flipVertical });
          break;
        case 'cine':
          setCinePlaying((prev) => !prev);
          break;
        case 'reset':
        case 'reset_all':
          setZoom(1);
          setWindowWidth(1213);
          setWindowLevel(698);
          cornerstoneAnnotation.state.removeAllAnnotations();
          if (viewport) {
            viewport.resetCamera();
          }
          break;
        case 'fit':
        case 'resetZoom':
        case 'actualSize':
        case 'actual':
          setZoom(1);
          if (viewport) {
            viewport.resetCamera();
          }
          break;
        case 'zoomIn':
          setZoom(prev => Math.min(10, Math.round(prev * 1.15 * 100) / 100));
          break;
        case 'zoomOut':
          setZoom(prev => Math.max(0.2, Math.round((prev / 1.15) * 100) / 100));
          break;
        case 'deleteSelected':
          const selection = cornerstoneAnnotation.selection.getAnnotationsSelected();
          if (selection && selection.length > 0) {
            selection.forEach(annUID => {
              cornerstoneAnnotation.state.removeAnnotation(annUID);
            });
            cornerstoneAnnotation.selection.deselectAnnotation();
            if (viewport) viewport.render();
          }
          break;
        case 'clearMeasurements':
          cornerstoneAnnotation.state.removeAllAnnotations();
          break;
        case 'reset_wl': {
          const inst = instancesList[currentSlice - 1];
          if (inst) {
            let numWc = Number(inst.window_center ?? inst.windowCenter);
            let numWw = Number(inst.window_width ?? inst.windowWidth);
            if (Array.isArray(inst.window_center ?? inst.windowCenter)) numWc = Number((inst.window_center ?? inst.windowCenter)[0]);
            if (Array.isArray(inst.window_width ?? inst.windowWidth)) numWw = Number((inst.window_width ?? inst.windowWidth)[0]);

            if (!isNaN(numWc) && !isNaN(numWw) && numWw > 0) {
              const lower = numWc - numWw / 2;
              const upper = numWc + numWw / 2;
              viewport.setProperties({ voiRange: { lower, upper } });
              setWindowWidth(Math.round(numWw));
              setWindowLevel(Math.round(numWc));
            } else {
              const lower = 698 - 1213 / 2;
              const upper = 698 + 1213 / 2;
              viewport.setProperties({ voiRange: { lower, upper } });
              setWindowWidth(1213);
              setWindowLevel(698);
            }
          }
          break;
        }
        case 'auto_wl':
          viewport.setProperties({ voiRange: { lower: -1000, upper: 2000 } });
          setWindowWidth(3000);
          setWindowLevel(500);
          break;
        case 'ct_presets':
          viewport.setProperties({ voiRange: { lower: -160, upper: 240 } });
          setWindowWidth(400);
          setWindowLevel(40);
          break;
        case 'mr_presets':
          viewport.setProperties({ voiRange: { lower: 0, upper: 2000 } });
          setWindowWidth(2000);
          setWindowLevel(1000);
          break;
        case 'pet_presets':
          viewport.setProperties({ voiRange: { lower: 0, upper: 50 } });
          setWindowWidth(50);
          setWindowLevel(25);
          break;
        default:
          if (viewportCommand.type.startsWith('slabThickness:')) {
            const thickness = parseFloat(viewportCommand.type.split(':')[1]) || 5;
            if (typeof (viewport as any).setSlabThickness === 'function') {
              (viewport as any).setSlabThickness(thickness);
              viewport.render();
            }
          } else if (viewportCommand.type.startsWith('cineFps:')) {
            const fps = parseInt(viewportCommand.type.split(':')[1], 10) || 15;
            setCineFps(fps);
          }
          break;
      }
      if (viewport) viewport.render();
    }
  }, [viewportCommand]);

  const handleDoubleClick = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setZoom(1);
    const activeViewport = getRenderingEngine(renderingEngineId)?.getViewport(viewportId) as Types.IStackViewport;
    if (activeViewport) {
      activeViewport.resetCamera();
      activeViewport.render();
    }
    if (onDoubleClick) {
      onDoubleClick();
    }
  };


  const overlayData = {
    ...baseData,
    seriesNumber: seriesNum,
    studyDescription: studyDesc || baseData.studyDescription,
    imageNumber: currentSlice,
    totalImages: totalImages,
    zoom: `${Math.round(zoom * 100)}%`,
    windowWidth: Math.round(windowWidth),
    windowLevel: Math.round(windowLevel)
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isEmpty) return;
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const thumbHeight = Math.max(16, Math.min(60, (1 / Math.max(1, totalImages)) * 300 + 14));
  const thumbTopPercent = totalImages > 1 ? ((currentSlice - 1) / (totalImages - 1)) * 100 : 0;
  const thumbTopOffset = totalImages > 1 ? (((currentSlice - 1) / (totalImages - 1)) * thumbHeight) : 0;

  return (
    <div
      id={viewportId}
      onClick={() => {
        onSelect();
        onFocus();
      }}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={`relative flex-1 h-full min-w-0 bg-[#070708] border select-none overflow-hidden outline-none ${active ? 'border-[#2E7DFF] shadow-[inset_0_0_8px_rgba(46,125,255,0.3)]' : 'border-[#1E222B]'
        }`}
    >
      {/* Cornerstone element viewport mount target & WebGL DICOM Canvas */}
      <div
        ref={elementRef}
        onDoubleClick={handleDoubleClick}
        className={`w-full h-full relative flex items-center justify-center bg-black overflow-hidden touch-none ${activeTool === 'pan' ? 'cursor-grab active:cursor-grabbing' :
            activeTool === 'zoom' ? 'cursor-ns-resize' :
              activeTool === 'wl' ? 'cursor-move' : 'cursor-crosshair'
          }`}
      >
      </div>

      {/* Viewport Overlay System (Metadata logs) */}
      {!isEmpty && metadataOverlayOpen !== false ? (
        <ViewportOverlay
          data={overlayData}
          viewportNum={index}
          active={active}
          readOnly={readOnly}
        />
      ) : (
        isEmpty ? <ViewportPlaceholder /> : null
      )}

      {/* Keyboard focus outline ring */}
      {focused && (
        <div
          className="absolute inset-[1.5px] border-2 border-dashed border-white/60 pointer-events-none rounded-[3px] z-30"
          role="presentation"
        />
      )}

      {/* Interactive Vertical Slice Scrollbar Overlay */}
      {!isEmpty && totalImages > 1 && (
        <div
          ref={scrollbarTrackRef}
          onMouseDown={handleScrollbarMouseDown}
          onMouseEnter={() => setShowScrollTooltip(true)}
          onMouseLeave={() => setShowScrollTooltip(false)}
          className="absolute right-1.5 top-12 bottom-12 w-2.5 bg-white/10 hover:bg-white/20 active:bg-white/25 rounded-full z-20 cursor-pointer transition-colors group flex items-center justify-center select-none"
          title={`Scrollbar: Slice ${currentSlice} of ${totalImages}`}
        >
          {/* Scrollbar Thumb */}
          <div
            className={`absolute w-3.5 rounded-full transition-all duration-75 shadow-md ${isScrubbing ? 'bg-[#2E7DFF] scale-110' : 'bg-[#2E7DFF]/80 group-hover:bg-[#2E7DFF]'
              }`}
            style={{
              height: `${thumbHeight}px`,
              top: `calc(${thumbTopPercent}% - ${thumbTopOffset}px)`
            }}
          />

          {/* Hover / Scrubbing Tooltip Badge */}
          {(showScrollTooltip || isScrubbing) && (
            <div className="absolute right-5 bg-[#14181E]/95 border border-[#353C48] text-white text-[10px] font-mono px-2 py-0.5 rounded shadow-lg whitespace-nowrap pointer-events-none z-30 tracking-wide">
              {currentSlice} / {totalImages}
            </div>
          )}
        </div>
      )}

      {/* Error Finding Diagnostic Banner */}
      {loadingError && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm pointer-events-auto">
          <div className="bg-[#14171D] border border-red-500/60 rounded-lg p-5 max-w-sm text-center shadow-2xl">
            <div className="flex items-center justify-center gap-2 text-red-400 font-semibold mb-2">
              <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>Viewport Diagnostic Finding</span>
            </div>
            <p className="text-xs text-gray-300 mb-3 break-words font-mono bg-black/60 p-2.5 rounded border border-gray-800">
              {loadingError}
            </p>
            <div className="text-[11px] text-gray-400 mb-4">
              Tested Endpoints: {API_BASE_URL} &amp; http://127.0.0.1:3001
            </div>
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => {
                  setLoadingError(null);
                  setCurrentSeriesId(null);
                  setInstancesList([]);
                }}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-medium rounded transition shadow"
              >
                Retry Series
              </button>
              <button
                onClick={() => onActionCommand?.('diagnostics')}
                className="px-3 py-1.5 bg-[#232833] hover:bg-[#2E3544] active:bg-[#1D212B] text-gray-200 text-xs font-medium rounded transition border border-[#3B4456]"
              >
                Open Error Finder
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading progress spinner */}
      {isLoading && !loadingError && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 pointer-events-none">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[#12151A]/90 border border-blue-500/30 rounded-full text-xs text-blue-300 shadow-lg">
            <div className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            <span>Loading DICOM Series…</span>
          </div>
        </div>
      )}

      {contextMenu && (
        <ViewportContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          viewportNum={index}
          onClose={() => setContextMenu(null)}
          onActionCommand={onActionCommand}
        />
      )}
    </div>
  );
}
