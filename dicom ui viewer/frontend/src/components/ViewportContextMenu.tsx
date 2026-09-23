import React, { useEffect, useRef } from 'react';

interface ViewportContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  viewportNum: number;
  onActionCommand?: (action: string) => void;
}

export default function ViewportContextMenu({ x, y, onClose, viewportNum, onActionCommand }: ViewportContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Click outside listener to automatically close the menu
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const items = [
    { label: 'Reset View', action: () => alert(`Reset Viewport V-${viewportNum}`) },
    { label: 'Fit to Window', action: () => alert(`Fit Viewport V-${viewportNum}`) },
    { label: 'Actual Size', action: () => alert(`Actual Size Viewport V-${viewportNum}`) },
    { type: 'separator' },
    { label: 'Copy View', action: () => alert(`Copy View V-${viewportNum}`) },
    { label: 'Duplicate View', action: () => alert(`Duplicate View V-${viewportNum}`) },
    { type: 'separator' },
    { label: 'Viewport Information', action: () => alert(`Display Viewport V-${viewportNum} Information`) },
    { type: 'separator' },
    { label: 'Share Study', action: () => onActionCommand?.('shareStudy') },
    { type: 'separator' },
    { label: 'Close View', action: () => alert(`Close Viewport V-${viewportNum}`) },
  ];

  return (
    <div
      ref={menuRef}
      style={{ top: `${y}px`, left: `${x}px` }}
      className="fixed bg-[#1C1F26] border border-[#353C48] rounded-[4px] shadow-[0_8px_24px_rgba(0,0,0,0.5)] py-1 min-w-[160px] z-[9999] font-sans text-[12px] text-[#C9D1D9] pointer-events-auto select-none"
      role="menu"
      aria-label={`Viewport V-${viewportNum} Context Menu`}
    >
      {items.map((item, idx) => {
        if (item.type === 'separator') {
          return (
            <div 
              key={`sep-${idx}`} 
              className="h-[1px] bg-[#353C48] my-1 mx-1.5" 
              role="separator" 
            />
          );
        }

        return (
          <button
            key={item.label}
            onClick={() => {
              if (item.action) item.action();
              onClose();
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-[#2E7DFF] hover:text-white transition-colors duration-100 flex items-center cursor-pointer outline-none border border-transparent focus:bg-[#2E7DFF] focus:text-white"
            role="menuitem"
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
