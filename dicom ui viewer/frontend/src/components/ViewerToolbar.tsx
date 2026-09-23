import React, { useState, useEffect, useRef } from 'react';
import {
  FolderOpen, Download, Upload, Server, Database, History, Printer,
  MousePointer, Hand, ZoomIn, RotateCw, ChevronsUpDown, Play, RotateCcw,
  Sun, Sliders, RefreshCw, Ruler, Circle, Square, PenTool, Type, ArrowUpRight,
  Brain, Flame, FileText, Mic, Layers, Cpu, Eye, Crosshair, MoreHorizontal,
  MessageSquare, FileCode, Folder, FileImage, FileDown, Grid, Sparkles,
  Scale, Maximize, Scissors, MapPin, Tag, Share2, Link,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════════════
 *  ADAPTIVE SCALING  –  CSS Custom Properties + Flexbox Distribution
 *
 *  Scaling: every dimension scales via clamp(min, calc(i + s·vw), max)
 *  Layout:  groups use flex-1 to SHARE available width equally —
 *           no section is ever clipped or hidden.
 *
 *  Browser zoom automatically adjusts because vw changes with zoom.
 * ═══════════════════════════════════════════════════════════════════════ */

const SCALE: Record<string, string> = {
  /* buttons */
  '--s-btn-h':     'clamp(32px, calc(17.33px + 1.389vw), 44px)',
  '--s-icon':      'clamp(14px, calc(10px    + 0.417vw), 18px)',
  '--s-font':      'clamp(8.5px, calc(5.67px + 0.278vw), 11px)',
  '--s-grp-font':  'clamp(7.5px, calc(4.67px + 0.278vw), 10px)',
  /* spacing */
  '--s-btn-gap':   'clamp(1px, calc(-4.67px + 0.556vw), 6px)',
  '--s-grp-gap':   'clamp(3px, calc(-9.33px + 1.111vw), 12px)',
  /* padding */
  '--s-pad-x':     'clamp(1px, calc(-1.33px + 0.278vw), 5px)',
  '--s-pad-y':     'clamp(1px, calc(-1.33px + 0.278vw), 4px)',
  '--s-inner-gap': 'clamp(0px, calc(-2.33px + 0.278vw), 3px)',
  /* chrome */
  '--s-height':    'clamp(52px, calc(29.33px + 2.222vw), 72px)',
};

/* ── ToolBtn ─────────────────────────────────────────────────────────── */

interface ToolBtnProps {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  tooltip: string;
  onClick:      (e: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseLeave: () => void;
  disabled?: boolean;
}

function ToolBtn({ label, icon, active, tooltip, onClick, onMouseEnter, onMouseLeave, disabled }: ToolBtnProps) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      title={tooltip}
      aria-label={tooltip}
      disabled={disabled}
      style={{
        height:  'var(--s-btn-h)',
        padding: 'var(--s-pad-y) var(--s-pad-x)',
        gap:     'var(--s-inner-gap)',
      }}
      className={[
        'flex-1 min-w-0',
        'flex flex-col items-center justify-center rounded-md',
        'outline-none border select-none',
        disabled
          ? 'opacity-30 border-transparent text-[#999] pointer-events-none'
          : active
            ? 'bg-[#D6E8FF] border-[#4C8DFF] text-[#007ACC] cursor-pointer'
            : 'bg-transparent border-transparent text-[#3A3A3A] hover:bg-[#E8EEF9] hover:text-[#007ACC] cursor-pointer',
      ].join(' ')}
    >
      <div
        className="flex items-center justify-center shrink-0"
        style={{ width: 'var(--s-icon)', height: 'var(--s-icon)' }}
      >
        {icon}
      </div>
      <span
        className="font-sans font-medium leading-tight tracking-tighter text-center whitespace-nowrap select-none w-full"
        style={{ fontSize: 'var(--s-font)', color: active ? '#007ACC' : '#3A3A3A' }}
      >
        {label}
      </span>
    </button>
  );
}

/* ── MoreBtn (uniform size and styling with label "More") ────────────── */

interface MoreBtnProps {
  active: boolean;
  tooltip: string;
  onClick:      (e: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseLeave: () => void;
}

function MoreBtn({ active, tooltip, onClick, onMouseEnter, onMouseLeave }: MoreBtnProps) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      title={tooltip}
      aria-label={tooltip}
      style={{
        height:  'var(--s-btn-h)',
        padding: 'var(--s-pad-y) var(--s-pad-x)',
        gap:     'var(--s-inner-gap)',
      }}
      className={[
        'flex-1 min-w-0',
        'flex flex-col items-center justify-center rounded-md',
        'outline-none border cursor-pointer select-none',
        active
          ? 'bg-[#D6E8FF] border-[#4C8DFF] text-[#007ACC]'
          : 'bg-transparent border-transparent text-[#888] hover:bg-[#E8EEF9] hover:text-[#007ACC]',
      ].join(' ')}
    >
      <div
        className="flex items-center justify-center shrink-0"
        style={{ width: 'var(--s-icon)', height: 'var(--s-icon)' }}
      >
        <MoreHorizontal className="w-full h-full" />
      </div>
      <span
        className="font-sans font-medium leading-tight tracking-tighter text-center whitespace-nowrap select-none w-full"
        style={{ fontSize: 'var(--s-font)', color: active ? '#007ACC' : '#888' }}
      >
        More
      </span>
    </button>
  );
}


/* ═══════════════════════════════════════════════════════════════════════════
 *  ViewerToolbar
 * ═══════════════════════════════════════════════════════════════════════ */

interface ViewerToolbarProps {
  activeTool: string;
  setActiveTool: (tool: string) => void;
  onActionCommand: (action: string) => void;
  setTooltip: (t: { text: string; x: number; y: number } | null) => void;
  sharePermissions?: any;
}

export default function ViewerToolbar({
  activeTool, setActiveTool, onActionCommand, setTooltip, sharePermissions,
}: ViewerToolbarProps) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (openMenu && menuRef.current && !menuRef.current.contains(e.target as Node))
        setOpenMenu(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openMenu]);

  const tip = (text: string, e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltip({ text, x: r.left + r.width / 2, y: r.bottom + 6 });
  };
  const noTip = () => setTooltip(null);

  const isToolDisabled = (id: string): boolean => {
    // Permanently enable Open, Import, Export, and Share buttons
    if (['open', 'import', 'export', 'shareStudy', 'manageShares'].includes(id)) return false;

    if (!sharePermissions) return false;

    // Download/export tools
    const downloadTools = ['export', 'export_jpeg', 'export_pdf', 'print'];
    if (downloadTools.includes(id) && !sharePermissions.download) return true;

    // Annotation tools
    const annotationTools = ['text', 'arrow', 'freehand', 'ellipse', 'rect', 'polygon', 'cobb_angle'];
    if (annotationTools.includes(id) && !sharePermissions.annotation) return true;

    // Measurement tools
    const measurementTools = ['length', 'angle', 'pixel_probe'];
    if (measurementTools.includes(id)) {
      if (!sharePermissions.measure) return true;
      if (!sharePermissions.annotation) return true; // read-only blocks measurements as well
    }

    // Share links management
    if (['shareStudy', 'manageShares'].includes(id)) return true;

    return false;
  };

  const isActive = (id: string) => {
    return activeTool === id;
  };

  const handleClick = (id: string) => {
    const stateIds = [
      'pan','zoom','wl','scroll','select','length','angle','text','arrow','freehand','ellipse','polygon','rect',
      'cobb_angle', 'pixel_probe'
    ];
    if (stateIds.includes(id)) { setActiveTool(id); return; }
    onActionCommand(id);
  };

  const toggleMenu = (title: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenMenu(prev => (prev === title ? null : title));
  };

  /* ── SVG icons ──────────────────────────────────────────────────────── */
  const ic = (C: React.FC<{ className?: string }>) => <C className="w-full h-full" />;
  const svgAngle = <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 22H2M2 22L16 8"/><path d="M11.5 22c0-3-2.5-5.5-5.5-5.5"/></svg>;
  const svgFlipH = <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3m8-20h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3M12 2v20"/></svg>;
  const svgFlipV = <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3m-20 8v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3M3 12h18"/></svg>;
  const svgMPR = <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.3 8L12 13M20.7 8L12 13M12 22V13"/></svg>;
  const svgCobb = <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v18M3 12h18M6 6l12 12"/></svg>;
  const svgCPR = <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12c4-6 8-6 12 0s8 6 12 0M12 2v20"/></svg>;

  /* ── groups config ─────────────────────────────────────────────────── */
  type Tool = { id: string; label: string; icon: React.ReactNode; tooltip: string };
  type Group = { title: string; primary: Tool[]; extra: Tool[] };

  const groups: Group[] = [
    {
      title: 'Study',
      primary: [
        { id: 'open',   label: 'Open',   icon: ic(FolderOpen), tooltip: 'Open DICOM Study (Ctrl+O)' },
        { id: 'import', label: 'Import', icon: ic(Download),   tooltip: 'Import DICOM Files (Ctrl+I)' },
        { id: 'export', label: 'Export', icon: ic(Upload),     tooltip: 'Export Images / Data' },
        { id: 'shareStudy', label: 'Share', icon: ic(Share2),   tooltip: 'Share Study (Ctrl+Shift+S)' },
      ],
      extra: [
        { id: 'pacs',          label: 'PACS Query',     icon: ic(Server),    tooltip: 'PACS Server Query (Ctrl+Q)' },
        { id: 'db',            label: 'Database',       icon: ic(Database),  tooltip: 'Local DICOM Database' },
        { id: 'recent',        label: 'Recent Studies', icon: ic(History),   tooltip: 'Recent Studies List' },
        { id: 'dicomdir',      label: 'DICOMDIR',       icon: ic(FileCode),  tooltip: 'Open DICOMDIR File' },
        { id: 'import_folder', label: 'Import Folder',  icon: ic(Folder),    tooltip: 'Import Directory' },
        { id: 'export_jpeg',   label: 'Export Image',   icon: ic(FileImage), tooltip: 'Export Slice as JPEG' },
        { id: 'export_pdf',    label: 'Export PDF',     icon: ic(FileDown),  tooltip: 'Export Report as PDF' },
        { id: 'print',         label: 'Print',          icon: ic(Printer),   tooltip: 'Print Active Study' },
        { id: 'manageShares',  label: 'Manage Shares',  icon: ic(Link),      tooltip: 'Manage Shared Links' },
      ]
    },
    {
      title: 'Navigation',
      primary: [
        { id: 'select', label: 'Select', icon: ic(MousePointer), tooltip: 'Select & Edit Annotation' },
        { id: 'pan',    label: 'Pan',    icon: ic(Hand),          tooltip: 'Pan Image (P)' },
        { id: 'zoom',   label: 'Zoom',   icon: ic(ZoomIn),        tooltip: 'Zoom Tool (Z)' },
      ],
      extra: [
        { id: 'reset',  label: 'Reset View', icon: ic(RotateCcw), tooltip: 'Reset Viewport Defaults' },
        { id: 'rotate', label: 'Rotate',        icon: ic(RotateCw),      tooltip: 'Rotate 90° Clockwise' },
        { id: 'fliph',  label: 'Flip H',        icon: svgFlipH,          tooltip: 'Flip Horizontally' },
        { id: 'flipv',  label: 'Flip V',        icon: svgFlipV,          tooltip: 'Flip Vertically' },
        { id: 'scroll', label: 'Scroll',        icon: ic(ChevronsUpDown),tooltip: 'Scroll Slices (S)' },
        { id: 'cine',   label: 'Cine Play',     icon: ic(Play),          tooltip: 'Toggle CINE Playback' },
        { id: 'reset_all', label: 'Reset All',  icon: ic(RefreshCw),     tooltip: 'Reset All Viewports' },
        { id: 'fit',    label: 'Fit to Screen', icon: ic(Maximize),      tooltip: 'Fit Image to Viewport' },
        { id: 'actual', label: 'Actual Size',   icon: ic(Scale),         tooltip: 'Show 1:1 Pixel Ratio' },
      ],
    },
    {
      title: 'Windowing',
      primary: [
        { id: 'wl',       label: 'Window', icon: ic(Sun),       tooltip: 'Window Width / Level (W)' },
        { id: 'presets',   label: 'Preset', icon: ic(Sliders),   tooltip: 'W/L Presets Dropdown' },
        { id: 'reset_wl', label: 'Reset',  icon: ic(RefreshCw), tooltip: 'Reset Contrast Defaults' },
      ],
      extra: [
        { id: 'auto_wl',       label: 'Auto Window',    icon: ic(Sparkles), tooltip: 'Auto Calculate Contrast' },
        { id: 'ct_presets',     label: 'CT Presets',     icon: ic(Sliders),  tooltip: 'CT Window Presets' },
        { id: 'mr_presets',     label: 'MR Presets',     icon: ic(Sliders),  tooltip: 'MR Window Presets' },
        { id: 'pet_presets',    label: 'PET Presets',    icon: ic(Sliders),  tooltip: 'PET Window Presets' },
        { id: 'custom_presets', label: 'Custom Presets', icon: ic(Sliders),  tooltip: 'Custom Contrast Presets' },
        { id: 'save_preset',   label: 'Save Preset',    icon: ic(Download), tooltip: 'Save Current Preset' },
      ],
    },
    {
      title: 'Measurements',
      primary: [
        { id: 'length', label: 'Length', icon: ic(Ruler),  tooltip: 'Linear Distance Measurement' },
        { id: 'angle',  label: 'Angle',  icon: svgAngle,   tooltip: 'Angle Measurement' },
        { id: 'ellipse',label: 'ROI',    icon: ic(Circle), tooltip: 'Circular ROI Area' },
      ],
      extra: [
        { id: 'rect',        label: 'Rectangle ROI', icon: ic(Square),       tooltip: 'Rectangle Measurement ROI' },
        { id: 'polygon',     label: 'Polygon ROI',   icon: ic(PenTool),      tooltip: 'Polygon Measurement ROI' },
        { id: 'cobb_angle',  label: 'Cobb Angle',    icon: svgCobb,          tooltip: 'Spinal Cobb Angle' },
        { id: 'pixel_probe', label: 'Pixel Probe',   icon: ic(Crosshair),    tooltip: 'Pixel Density & Location' },
        { id: 'area',        label: 'Area',          icon: ic(Square),       tooltip: 'Calculate Area' },
        { id: 'mean_value',  label: 'Mean Value',    icon: ic(Sliders),      tooltip: 'Mean HU / Pixel Value' },
      ],
    },
    {
      title: 'Annotation',
      primary: [
        { id: 'text',     label: 'Text',     icon: ic(Type),         tooltip: 'Place Text Annotation' },
        { id: 'arrow',    label: 'Arrow',    icon: ic(ArrowUpRight), tooltip: 'Place Arrow Pointer' },
        { id: 'freehand', label: 'Freehand', icon: ic(PenTool),      tooltip: 'Freehand Draw' },
      ],
      extra: [
        { id: 'callout',     label: 'Callout',       icon: ic(MessageSquare),tooltip: 'Speech Callout Label' },
        { id: 'label',       label: 'Label',         icon: ic(Tag),          tooltip: 'Preset Label Tag' },
        { id: 'marker',      label: 'Marker',        icon: ic(MapPin),       tooltip: 'Anatomical Marker' },
        { id: 'numbering',   label: 'Numbering',     icon: ic(Type),         tooltip: 'Sequential Numbering' },
        { id: 'stamp',       label: 'Stamp',         icon: ic(Square),       tooltip: 'Predefined Stamp Overlay' },
      ],
    },
    {
      title: 'AI',
      primary: [
        { id: 'detect',  label: 'Detect',  icon: ic(Brain),    tooltip: 'AI Pathology Detection' },
        { id: 'heatmap', label: 'Heatmap', icon: ic(Flame),    tooltip: 'AI Probability Density Map' },
        { id: 'summary', label: 'Summary', icon: ic(FileText), tooltip: 'Structured Report Summary' },
      ],
      extra: [
        { id: 'voice',      label: 'Voice Dictation', icon: ic(Mic),           tooltip: 'Voice Dictation / Control' },
        { id: 'ai_chat',    label: 'AI Chat',         icon: ic(MessageSquare), tooltip: 'Chat with Study AI' },
        { id: 'auto_meas',  label: 'Auto Measure',    icon: ic(Ruler),         tooltip: 'AI Automatic Measurements' },
        { id: 'findings',   label: 'Auto Findings',   icon: ic(FileText),      tooltip: 'Pathology Findings List' },
        { id: 'report_gen', label: 'Report Gen',      icon: ic(FileText),      tooltip: 'Generate PDF Report' },
        { id: 'compare',    label: 'Compare Studies', icon: ic(Layers),        tooltip: 'AI Compare Historical Studies' },
      ],
    },
    {
      title: '3D',
      primary: [
        { id: 'mpr', label: 'MPR', icon: svgMPR,     tooltip: 'Multiplanar Reconstruction' },
        { id: 'mip', label: 'MIP', icon: ic(Layers),  tooltip: 'Maximum Intensity Projection' },
        { id: 'vr',  label: 'VR',  icon: ic(Cpu),     tooltip: '3D Volume Rendering' },
      ],
      extra: [
        { id: 'cpr',       label: 'CPR',            icon: svgCPR,        tooltip: 'Curved Planar Reconstruction' },
        { id: 'srf_rend',  label: 'Surface Render', icon: ic(Cpu),       tooltip: '3D Surface Rendering' },
        { id: 'vol_rend',  label: 'Volume Render',  icon: ic(Cpu),       tooltip: 'Volume Rendering Params' },
        { id: 'slab',      label: 'Slab Thickness', icon: ic(Layers),    tooltip: 'Slab Thickness Settings' },
        { id: 'clipping',  label: 'Clipping Plane', icon: ic(Scissors),  tooltip: 'Clipping Plane Tool' },
        { id: 'segment',   label: 'Segmentation',   icon: ic(Brain),     tooltip: 'Segment Tissue Classes' },
      ],
    },
    {
      title: 'Display',
      primary: [
        { id: 'overlay',   label: 'Overlay',   icon: ic(Eye),       tooltip: 'Toggle Info Overlays' },
        { id: 'crosshair', label: 'Crosshair', icon: ic(Crosshair), tooltip: 'Reference Crosshairs' },
        { id: 'layout',    label: 'Layout',    icon: ic(Layers),    tooltip: 'Change Viewport Layout' },
      ],
      extra: [
        { id: 'orientation', label: 'Orientation', icon: ic(Eye),       tooltip: 'Toggle Orientation Markers' },
        { id: 'scale_ov',   label: 'Scale',       icon: ic(Scale),     tooltip: 'Toggle Medical Scales' },
        { id: 'grid',       label: 'Grid',        icon: ic(Grid),      tooltip: 'Toggle Overlay Grid' },
        { id: 'ref_lines',  label: 'Ref Lines',   icon: ic(Crosshair), tooltip: 'Cross Reference Lines' },
        { id: 'fullscreen', label: 'Full Screen', icon: ic(Maximize),  tooltip: 'Toggle Full Screen' },
        { id: 'color_maps', label: 'Color Maps',  icon: ic(Flame),     tooltip: 'Color Lookup Tables' },
        { id: 'fusion',     label: 'Fusion',      icon: ic(Layers),    tooltip: 'Fuse CT / PET / MRI' },
        { id: 'ruler_ov',   label: 'Ruler',       icon: ic(Ruler),     tooltip: 'Toggle Desktop Ruler' },
      ],
    },
  ];

  /* ── render ────────────────────────────────────────────────────────── */

  return (
    <div
      role="toolbar"
      aria-label="Viewer Toolbar"
      style={{ ...(SCALE as React.CSSProperties), height: 'var(--s-height)' }}
      className="flex items-center w-full bg-[#F7F8FA] border-b border-[#D9DCE3] select-none shrink-0"
    >
      {/* All groups share available width equally via flex-1 */}
      <div className="flex items-center flex-nowrap w-full h-full px-1">
        {groups.map((g, gi) => {
          const anyHiddenActive = g.extra.some(t => isActive(t.id));

          return (
            <React.Fragment key={g.title}>
              {/* ── group: flex-1 ensures equal width sharing ──── */}
              <div className="relative flex flex-col items-center justify-center flex-1 min-w-0 overflow-visible">
                {/* buttons row */}
                <div
                  className="flex items-center w-full overflow-visible"
                  style={{ gap: 'var(--s-btn-gap)' }}
                >
                  {g.primary.map(t => (
                    <ToolBtn
                      key={t.id}
                      label={t.label}
                      icon={t.icon}
                      active={isActive(t.id)}
                      tooltip={t.tooltip}
                      onClick={() => handleClick(t.id)}
                      onMouseEnter={e => tip(t.tooltip, e)}
                      onMouseLeave={noTip}
                      disabled={isToolDisabled(t.id)}
                    />
                  ))}

                  <MoreBtn
                    active={openMenu === g.title || anyHiddenActive}
                    tooltip={`More ${g.title} tools`}
                    onClick={e => toggleMenu(g.title, e)}
                    onMouseEnter={e => tip(`More ${g.title} tools`, e)}
                    onMouseLeave={noTip}
                  />

                  {/* dropdown */}
                  {openMenu === g.title && (
                    <div
                      ref={menuRef}
                      className={[
                        'absolute top-[calc(var(--s-btn-h)+8px)] z-[100]',
                        'min-w-[180px] bg-white border border-[#D9DCE3] rounded-lg',
                        'shadow-[0_8px_24px_rgba(0,0,0,0.15)] py-1 select-none',
                        gi >= 4 ? 'right-0' : 'left-0',
                      ].join(' ')}
                    >
                      {g.extra.map(t => {
                        const a = isActive(t.id);
                        const disabled = isToolDisabled(t.id);
                        return (
                          <button
                            key={t.id}
                            disabled={disabled}
                            onClick={() => {
                              if (!disabled) {
                                handleClick(t.id);
                                setOpenMenu(null);
                              }
                            }}
                            className={[
                              'w-full flex items-center gap-2.5 h-[30px] px-3',
                              'text-left text-[12px] font-sans outline-none',
                              disabled
                                ? 'opacity-35 text-[#999] pointer-events-none'
                                : 'cursor-pointer hover:bg-[#E8EEF9] hover:text-[#007ACC]',
                              a && !disabled ? 'bg-[#D6E8FF] text-[#007ACC] font-semibold' : 'text-[#3A3A3A]',
                            ].join(' ')}
                          >
                            <div className="w-4 h-4 flex items-center justify-center shrink-0">{t.icon}</div>
                            <span className="truncate">{t.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* group label */}
                <span
                  className="font-sans font-bold uppercase tracking-[0.06em] text-[#777] text-center select-none leading-none whitespace-nowrap"
                  style={{ fontSize: 'var(--s-grp-font)', marginTop: 'var(--s-inner-gap)' }}
                >
                  {g.title}
                </span>
              </div>

              {/* divider */}
              {gi < groups.length - 1 && (
                <div
                  className="shrink-0 bg-[#D8D8D8] self-center"
                  style={{
                    width: '1px',
                    height: 'var(--s-btn-h)',
                    marginLeft:  'var(--s-grp-gap)',
                    marginRight: 'var(--s-grp-gap)',
                  }}
                  role="presentation"
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
