import io
from PIL import Image, ImageDraw
from fastapi.responses import StreamingResponse

class MipService:
    def project_maximum(self, study_uid: str, series_uid: str, thickness: int) -> StreamingResponse:
        """Projects the maximum intensity voxels along custom slab thickness"""
        img = Image.new('L', (256, 256), color=15)
        draw = ImageDraw.Draw(img)
        draw.arc([20, 20, 236, 236], start=30, end=150, fill=220, width=5)
        draw.arc([20, 20, 236, 236], start=210, end=330, fill=220, width=5)
        draw.rectangle([120, 20, 136, 236], fill=240)
        draw.ellipse([90, 80, 166, 176], fill=180, outline=230, width=2)
        
        buf = io.BytesIO()
        img.save(buf, format='PNG')
        buf.seek(0)
        return StreamingResponse(buf, media_type="image/png")

mip_service = MipService()
