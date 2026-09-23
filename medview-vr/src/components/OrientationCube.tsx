import { useMemo } from 'react';
import type { CameraState } from '@/rendering/camera';
import { screenDirections } from '@/rendering/camera';
import type { Vec3 } from '@/math/vec3';
import { dot } from '@/math/vec3';

/**
 * Anatomical orientation cube (§9, §24).
 *
 * Drawn as an orthographic SVG projection of a cube whose faces are labelled in DICOM
 * patient (LPS) terms. It is driven directly by the camera basis, so it can never drift
 * out of sync with the rendering, and it costs nothing on the GPU — which matters on
 * software rasterisers where a second vtk renderer would halve the frame rate.
 */
interface Face {
  readonly label: 'R' | 'L' | 'A' | 'P' | 'S' | 'I';
  readonly normal: Vec3;
  readonly corners: readonly Vec3[];
  readonly tint: string;
}

const H = 1;
const FACES: readonly Face[] = [
  { label: 'L', normal: [1, 0, 0], tint: '#3a5a78', corners: [[H, -H, -H], [H, H, -H], [H, H, H], [H, -H, H]] },
  { label: 'R', normal: [-1, 0, 0], tint: '#3a5a78', corners: [[-H, -H, -H], [-H, -H, H], [-H, H, H], [-H, H, -H]] },
  { label: 'P', normal: [0, 1, 0], tint: '#3f6b50', corners: [[-H, H, -H], [-H, H, H], [H, H, H], [H, H, -H]] },
  { label: 'A', normal: [0, -1, 0], tint: '#3f6b50', corners: [[-H, -H, -H], [H, -H, -H], [H, -H, H], [-H, -H, H]] },
  { label: 'S', normal: [0, 0, 1], tint: '#6e5233', corners: [[-H, -H, H], [H, -H, H], [H, H, H], [-H, H, H]] },
  { label: 'I', normal: [0, 0, -1], tint: '#6e5233', corners: [[-H, -H, -H], [-H, H, -H], [H, H, -H], [H, -H, -H]] },
];

interface Props { camera: CameraState | null; size?: number; onPick?: (label: Face['label']) => void }

export function OrientationCube({ camera, size = 104, onPick }: Props): JSX.Element | null {
  const projected = useMemo(() => {
    if (!camera) return null;
    const d = screenDirections(camera);
    const half = size / 2;
    const scale = size * 0.27;
    const project = (p: Vec3): [number, number] => [
      half + dot(p, d.right) * scale,
      half - dot(p, d.up) * scale,
    ];
    return FACES
      .map((f) => ({
        face: f,
        depth: dot(f.normal, d.towardsViewer),
        points: f.corners.map(project),
        centre: project([f.normal[0] * H, f.normal[1] * H, f.normal[2] * H]),
      }))
      .sort((a, b) => a.depth - b.depth);
  }, [camera, size]);

  if (!projected) return null;

  return (
    <svg width={size} height={size} style={{ pointerEvents: onPick ? 'auto' : 'none' }} aria-label="Anatomical orientation cube">
      {projected.map(({ face, depth, points, centre }) => {
        const front = depth > 0.02;
        const shade = 0.35 + 0.65 * Math.max(0, depth);
        return (
          <g key={face.label} opacity={front ? 1 : 0.22}
            style={{ cursor: onPick && front ? 'pointer' : 'default' }}
            onClick={() => front && onPick?.(face.label)}>
            <polygon
              points={points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')}
              fill={face.tint} fillOpacity={shade} stroke="#0e1013" strokeWidth={1} strokeLinejoin="round" />
            {front && (
              <text x={centre[0]} y={centre[1]} textAnchor="middle" dominantBaseline="central"
                fontSize={Math.round(size * 0.17)} fontWeight={700} fill="#eef1f5"
                style={{ paintOrder: 'stroke', stroke: '#0e1013', strokeWidth: 2.5 }}>
                {face.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
