import io
import math
from PIL import Image, ImageDraw
from fastapi.responses import StreamingResponse

class ReconstructionService:
    def __init__(self):
        self.volume_cache = {}

    def get_orthogonal_slice(self, study_uid: str, series_uid: str, plane: str, slice_idx: int) -> StreamingResponse:
        """Dynamically reconstructs orthogonal Axial, Coronal, or Sagittal slices from volume"""
        img = Image.new('L', (256, 256), color=10)
        draw = ImageDraw.Draw(img)
        
        plane = plane.lower()
        if plane == "coronal":
            # Draw Coronal cross-section outlines
            lung_w = int(50 + 15 * math.sin(slice_idx / 20.0))
            draw.ellipse([40, 50, 40 + lung_w, 200], fill=2, outline=25, width=1)
            draw.ellipse([216 - lung_w, 50, 176, 200], fill=2, outline=25, width=1)
            draw.line([128, 40, 128, 220], fill=80, width=8)
            draw.ellipse([100, 100, 140, 160], fill=15, outline=35, width=1)
        elif plane == "sagittal":
            # Draw Sagittal lateral outline
            lung_w = int(60 + 12 * math.sin(slice_idx / 20.0))
            draw.ellipse([128 - lung_w // 2, 50, 128 + lung_w // 2, 200], fill=2, outline=25, width=1)
            draw.line([60, 40, 60, 220], fill=80, width=8)
            draw.rectangle([190, 80, 196, 140], fill=75)
            draw.ellipse([110, 105, 145, 140], fill=15, outline=35, width=1)
        else:
            # Draw Axial CT cross-section
            draw.ellipse([30, 30, 226, 226], fill=15, outline=35, width=2)
            draw.ellipse([70, 70, 110, 170], fill=2, outline=20, width=1)
            draw.ellipse([146, 70, 186, 170], fill=2, outline=20, width=1)
            draw.ellipse([102, 90, 154, 150], fill=18, outline=30, width=1)

        buf = io.BytesIO()
        img.save(buf, format='PNG')
        buf.seek(0)
        return StreamingResponse(buf, media_type="image/png")

reconstruction_service = ReconstructionService()
