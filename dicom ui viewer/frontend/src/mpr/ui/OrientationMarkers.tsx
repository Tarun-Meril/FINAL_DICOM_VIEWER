import { memo } from 'react';
import type { Vec3 } from '../core/math/vec';
import { viewportOrientationLabels } from '../core/geometry/orientation';

interface Props {
  viewUp: Vec3;
  viewRight: Vec3;
}

/**
 * Orientation markers are computed from the viewport's live camera basis, so
 * they follow rotation, flips and oblique reformats instead of being fixed to
 * the plane name.
 */
export const OrientationMarkers = memo(function OrientationMarkers({
  viewUp,
  viewRight,
}: Props) {
  const labels = viewportOrientationLabels(viewUp, viewRight);
  return (
    <>
      <div className="orientation-marker top">{labels.top}</div>
      <div className="orientation-marker bottom">{labels.bottom}</div>
      <div className="orientation-marker left">{labels.left}</div>
      <div className="orientation-marker right">{labels.right}</div>
    </>
  );
});
