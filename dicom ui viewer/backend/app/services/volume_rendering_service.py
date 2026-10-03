import io
import time
from typing import Optional, Dict, Any, Tuple
import numpy as np
from PIL import Image
import scipy.ndimage as ndi
from fastapi import Response, HTTPException
from app.services.reconstruction_service import reconstruction_service, STANDARD_HEADERS

class VolumeRenderingService:
    def __init__(self):
        # Cache for downsampled volumes to accelerate 3D rotations
        self.preview_cache: Dict[str, Dict[str, Any]] = {}

    def _get_or_create_preview(self, entry: Dict[str, Any], quality: str = "standard") -> Dict[str, Any]:
        """Returns or prepares a resolution-optimized 3D volume for rapid rotation and raycasting"""
        vol = entry["volume"] # Shape: (Z, Y, X)
        actual_uid = entry.get("actual_series_uid", "default")
        cache_key = f"{actual_uid}:{quality}"

        if cache_key in self.preview_cache:
            return self.preview_cache[cache_key]

        dz, dy, dx = entry["dz"], entry["dy"], entry["dx"]

        if quality == "high":
            # Higher resolution volume for static high-fidelity render
            step_z = max(1, int(round(1.0 / max(dz, 0.1))))
            step_xy = 2
            sub_vol = vol[::step_z, ::step_xy, ::step_xy].astype(np.float32)
            sub_dz = dz * step_z
            sub_dy = dy * step_xy
            sub_dx = dx * step_xy
        else:
            # Standard resolution volume (optimized for smooth ~50ms interactive rotations)
            step_z = 2
            step_xy = 3
            sub_vol = vol[::step_z, ::step_xy, ::step_xy].astype(np.float32)
            sub_dz = dz * step_z
            sub_dy = dy * step_xy
            sub_dx = dx * step_xy

        # Apply circular FOV mask to eliminate rectangular scanner artifacts & bed edges
        _, ny, nx = sub_vol.shape
        cy, cx = ny / 2.0, nx / 2.0
        r_limit_sq = (min(ny, nx) * 0.485) ** 2
        y_grid, x_grid = np.ogrid[:ny, :nx]
        outside_fov = ((y_grid - cy) ** 2 + (x_grid - cx) ** 2) > r_limit_sq
        sub_vol[:, outside_fov] = -1024.0

        cached = {
            "volume": sub_vol,
            "dz": sub_dz,
            "dy": sub_dy,
            "dx": sub_dx,
            "original_shape": vol.shape
        }
        self.preview_cache[cache_key] = cached
        return cached

    def render_volume(
        self,
        study_uid: str,
        series_uid: str,
        yaw: float = 0.0,
        pitch: float = 0.0,
        preset: str = "bone",
        zoom: float = 1.0,
        quality: str = "standard",
        out_size: int = 512
    ) -> Response:
        """
        Generates clinical 3D Volumetric Reconstruction directly on the server.
        Supports 3D raycasting, shaded surface rendering, MIP, and clinical density presets.
        """
        try:
            entry = reconstruction_service.load_volume(study_uid, series_uid)
        except Exception as e:
            return self._fallback_error_frame(f"Failed to load study volume: {str(e)}", out_size)

        prev = self._get_or_create_preview(entry, quality)
        vol = prev["volume"] # (Z, Y, X)
        dz, dy, dx = prev["dz"], prev["dy"], prev["dx"]
        nz, ny, nx = vol.shape

        # 1. 3D Rotation along Yaw (around Z axis) and Pitch (tilt elevation)
        rot = vol
        if abs(yaw) > 0.5:
            rot = ndi.rotate(rot, float(yaw), axes=(1, 2), reshape=False, order=1, cval=-1024.0)

        if abs(pitch) > 0.5:
            rot = ndi.rotate(rot, float(pitch), axes=(0, 1), reshape=False, order=1, cval=-1024.0)

        preset_lower = preset.lower()

        # 2. Preset Rendering Pipelines
        if "mip" in preset_lower or "angio" in preset_lower or "vascular" in preset_lower:
            # --- 3D Maximum Intensity Projection ---
            proj = np.max(rot, axis=1) # (Z, X)
            min_hu = 120.0
            max_hu = 850.0
            norm = np.clip((proj - min_hu) / (max_hu - min_hu) * 255.0, 0, 255).astype(np.uint8)
            rgb = np.stack([norm, norm, norm], axis=-1)

        elif "lung" in preset_lower:
            # --- 3D Pulmonary Parenchyma / Airway Visualization ---
            lung_mask = (rot >= -950.0) & (rot <= -350.0)
            proj = np.sum(lung_mask, axis=1).astype(np.float32)
            max_p = np.max(proj) if np.max(proj) > 0 else 1.0
            norm = (proj / max_p * 255.0).astype(np.uint8)
            r = (norm * 0.35).astype(np.uint8)
            g = (norm * 0.85).astype(np.uint8)
            b = norm
            rgb = np.stack([r, g, b], axis=-1)

        elif "soft" in preset_lower or "abdomen" in preset_lower:
            # --- 3D Soft Tissue with Depth Shading ---
            tissue_mask = rot > -50.0
            has_hit = np.any(tissue_mask, axis=1)
            hit_depth = np.argmax(tissue_mask, axis=1).astype(np.float32)
            max_d = float(rot.shape[1])
            depth_factor = np.where(has_hit, np.clip(1.0 - (hit_depth / max_d) * 0.65, 0.2, 1.0), 0.0)

            surf_val = np.max(rot, axis=1)
            val_norm = np.clip((surf_val - 20.0) / 220.0, 0.0, 1.0)
            base_intensity = (val_norm * depth_factor * 255.0).astype(np.uint8)

            r = np.clip(base_intensity * 1.15, 0, 255).astype(np.uint8)
            g = (base_intensity * 0.72).astype(np.uint8)
            b = (base_intensity * 0.52).astype(np.uint8)
            rgb = np.stack([r, g, b], axis=-1)

        else:
            # --- 3D Bone / Skeleton Surface Rendering (Default) ---
            bone_threshold = 150.0
            bone_mask = rot >= bone_threshold
            has_hit = np.any(bone_mask, axis=1) # (Z, X)
            hit_depth = np.argmax(bone_mask, axis=1).astype(np.float32) # (Z, X)

            max_depth = float(rot.shape[1])
            depth_shading = np.where(has_hit, np.clip(1.0 - (hit_depth / max_depth) * 0.65, 0.25, 1.0), 0.0)

            # Local surface gradient for 3D diffuse directional light
            dz_grad = np.gradient(hit_depth, axis=0)
            dx_grad = np.gradient(hit_depth, axis=1)
            light_term = np.clip(0.70 - 0.22 * dz_grad + 0.25 * dx_grad, 0.35, 1.25)

            intensity = np.where(has_hit, np.clip(depth_shading * light_term * 255.0, 0, 255), 0).astype(np.uint8)

            r = np.clip(intensity * 1.02, 0, 255).astype(np.uint8)
            g = (intensity * 0.92).astype(np.uint8)
            b = (intensity * 0.80).astype(np.uint8)
            rgb = np.stack([r, g, b], axis=-1)

        # 3. Physical Aspect-Ratio Correction and Resizing
        # Invert Z axis so superior is oriented at top of screen
        rgb = rgb[::-1, :, :]
        phys_h = nz * dz
        phys_w = nx * dx
        aspect = phys_h / phys_w if phys_w > 0 else 1.0

        current_zoom = max(0.5, min(zoom, 4.0))
        target_w = int(out_size * current_zoom)
        target_h = int(out_size * aspect * current_zoom)

        img = Image.fromarray(rgb, mode='RGB')
        img = img.resize((target_w, target_h), Image.Resampling.BILINEAR)

        # Center in square canvas of size out_size x out_size
        final_canvas = Image.new('RGB', (out_size, out_size), color=(10, 12, 16))
        paste_x = (out_size - target_w) // 2
        paste_y = (out_size - target_h) // 2
        final_canvas.paste(img, (paste_x, paste_y))

        buf = io.BytesIO()
        final_canvas.save(buf, format='JPEG', quality=90)
        return Response(content=buf.getvalue(), media_type="image/jpeg", headers=STANDARD_HEADERS)

    def _fallback_error_frame(self, message: str, size: int) -> Response:
        """Synthetic fallback canvas showing informative server status"""
        from PIL import ImageDraw
        img = Image.new('RGB', (size, size), color=(12, 14, 18))
        draw = ImageDraw.Draw(img)
        draw.text((size // 6, size // 2 - 10), message, fill=(200, 70, 70))
        buf = io.BytesIO()
        img.save(buf, format='JPEG', quality=80)
        return Response(content=buf.getvalue(), media_type="image/jpeg", headers=STANDARD_HEADERS)

volume_rendering_service = VolumeRenderingService()
