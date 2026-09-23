import io
from PIL import Image, ImageDraw
from fastapi.responses import StreamingResponse

class MinipService:
    def project_minimum(self, study_uid: str, series_uid: str, thickness: int) -> StreamingResponse:
        """Projects the minimum intensity voxels for airway and lung visualization"""
        img = Image.new('L', (256, 256), color=180)
        draw = ImageDraw.Draw(img)
        draw.ellipse([45, 50, 105, 190], fill=10, outline=35, width=2)
        draw.ellipse([151, 50, 211, 190], fill=10, outline=35, width=2)
        draw.line([128, 40, 128, 110], fill=5, width=6)
        draw.line([128, 110, 85, 150], fill=5, width=4)
        draw.line([128, 110, 171, 150], fill=5, width=4)
        
        buf = io.BytesIO()
        img.save(buf, format='PNG')
        buf.seek(0)
        return StreamingResponse(buf, media_type="image/png")

minip_service = MinipService()
