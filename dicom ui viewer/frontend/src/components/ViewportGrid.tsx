import React, { useState, useEffect } from 'react';
import Viewport from './Viewport';

interface ViewportGridProps {
  layout: string;
  activeTool: string;
  viewportCommand: { type: string; viewportId: number; timestamp: number } | null;
  onActiveViewportChange: (id: number) => void;
  onStatsChange?: (stats: any) => void;
  study?: any | null;
  vizMode?: string;
  metadataOverlayOpen?: boolean;
  onActionCommand?: (action: string) => void;
  readOnly?: boolean;
  sharePermissions?: any;
}

export default function ViewportGrid({ 
  layout, activeTool, vizMode, viewportCommand, onActiveViewportChange, onStatsChange, study, metadataOverlayOpen, onActionCommand, readOnly, sharePermissions
}: ViewportGridProps) {
  const [activeViewport, setActiveViewport] = useState(1);
  const [focusedViewport, setFocusedViewport] = useState<number | null>(null);
  const [maximizedViewportId, setMaximizedViewportId] = useState<number | null>(null);

  // Reset active viewport selection bounds on layout changes
  useEffect(() => {
    const maxViewports = getViewportCount(layout);
    if (activeViewport > maxViewports) {
      setActiveViewport(1);
    }
    if (focusedViewport !== null && focusedViewport > maxViewports) {
      setFocusedViewport(null);
    }
    setMaximizedViewportId(null);
  }, [layout]);

  // Synchronize active viewport changes back to App state context
  useEffect(() => {
    onActiveViewportChange(activeViewport);
  }, [activeViewport, onActiveViewportChange]);

  // Programmatically transfer DOM focus when focusedViewport state updates
  useEffect(() => {
    if (focusedViewport !== null) {
      const element = document.getElementById(`viewport-${focusedViewport}`);
      if (element && document.activeElement !== element) {
        element.focus();
      }
    }
  }, [focusedViewport]);

  const getViewportCount = (layoutStr: string) => {
    switch (layoutStr) {
      case '1x1 Single': return 1;
      case '1x2 Split': return 2;
      case '2x2 Quad': return 4;
      case '3x3 Matrix': return 9;
      default: return 4; // fallback 2x2
    }
  };

  const getGridClasses = (layoutStr: string) => {
    switch (layoutStr) {
      case '1x1 Single': return 'grid grid-cols-1 grid-rows-1';
      case '1x2 Split': return 'grid grid-cols-2 grid-rows-1';
      case '2x2 Quad': return 'grid grid-cols-2 grid-rows-2';
      case '3x3 Matrix': return 'grid grid-cols-3 grid-rows-3';
      default: return 'grid grid-cols-2 grid-rows-2';
    }
  };

  const handleGridKeyDown = (e: React.KeyboardEvent) => {
    const maxVal = getViewportCount(layout);
    let nextFocus = focusedViewport !== null ? focusedViewport : activeViewport;

    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        if (layout === '1x2 Split' || layout === '2x2 Quad') {
          if (nextFocus % 2 === 1 && nextFocus + 1 <= maxVal) nextFocus += 1;
        } else if (layout === '3x3 Matrix') {
          if (nextFocus % 3 !== 0 && nextFocus + 1 <= maxVal) nextFocus += 1;
        }
        setFocusedViewport(nextFocus);
        break;

      case 'ArrowLeft':
        e.preventDefault();
        if (layout === '1x2 Split' || layout === '2x2 Quad') {
          if (nextFocus % 2 === 0) nextFocus -= 1;
        } else if (layout === '3x3 Matrix') {
          if (nextFocus % 3 !== 1) nextFocus -= 1;
        }
        setFocusedViewport(nextFocus);
        break;

      case 'ArrowDown':
        e.preventDefault();
        if (layout === '2x2 Quad') {
          if (nextFocus <= 2 && nextFocus + 2 <= maxVal) nextFocus += 2;
        } else if (layout === '3x3 Matrix') {
          if (nextFocus <= 6 && nextFocus + 3 <= maxVal) nextFocus += 3;
        }
        setFocusedViewport(nextFocus);
        break;

      case 'ArrowUp':
        e.preventDefault();
        if (layout === '2x2 Quad') {
          if (nextFocus > 2) nextFocus -= 2;
        } else if (layout === '3x3 Matrix') {
          if (nextFocus > 3) nextFocus -= 3;
        }
        setFocusedViewport(nextFocus);
        break;

      case 'Enter':
      case ' ':
        e.preventDefault();
        if (focusedViewport !== null) {
          setActiveViewport(focusedViewport);
        }
        break;

      case 'Escape':
        e.preventDefault();
        setFocusedViewport(null);
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        break;
      
      default:
        break;
    }
  };

  const count = getViewportCount(layout);
  const gridClass = getGridClasses(layout);
  const isMaximized = maximizedViewportId !== null;

  return (
    <div 
      onKeyDown={handleGridKeyDown}
      className={`w-full h-full bg-[#000000] p-1 gap-1 ${isMaximized ? 'grid grid-cols-1 grid-rows-1' : gridClass}`}
      role="grid"
      aria-label={`DICOM Grid Layout ${layout}`}
    >
      {Array.from({ length: count }).map((_, idx) => {
        const viewportIndex = idx + 1;
        const isHidden = maximizedViewportId !== null && maximizedViewportId !== viewportIndex;
        return (
          <div
            key={viewportIndex}
            style={{ display: isHidden ? 'none' : 'block' }}
            className={isMaximized && maximizedViewportId === viewportIndex ? 'w-full h-full col-span-full row-span-full' : 'w-full h-full'}
          >
            <Viewport
              index={viewportIndex}
              active={activeViewport === viewportIndex}
              focused={focusedViewport === viewportIndex}
              activeTool={activeTool}
              vizMode={vizMode}
              viewportCommand={viewportCommand}
              onSelect={() => {
                setActiveViewport(viewportIndex);
                setFocusedViewport(viewportIndex);
              }}
              onFocus={() => setFocusedViewport(viewportIndex)}
              onBlur={() => {
                // Only clear if the active element is no longer a viewport in our grid
                setTimeout(() => {
                  if (!document.activeElement?.id.startsWith('viewport-')) {
                     setFocusedViewport(null);
                  }
                }, 50);
              }}
              onStatsChange={onStatsChange}
              study={study}
              metadataOverlayOpen={metadataOverlayOpen}
              onDoubleClick={() => {
                if (maximizedViewportId === viewportIndex) {
                  setMaximizedViewportId(null);
                } else {
                  setMaximizedViewportId(viewportIndex);
                }
              }}
              onActionCommand={onActionCommand}
              readOnly={readOnly}
            />
          </div>
        );
      })}
    </div>
  );
}
