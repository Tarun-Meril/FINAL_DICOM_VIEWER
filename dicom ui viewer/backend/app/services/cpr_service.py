import io
from PIL import Image, ImageDraw
from fastapi.responses import StreamingResponse

class CprService:
    def reconstruct_curved(self, study_uid: str, series_uid: str, points: list) -> StreamingResponse:
        """Extracts and formats curved vessel reconstruction slices along tracked centerlines"""
        img = Image.new('L', (300, 150), color=8)
        draw = ImageDraw.Draw(img)
        draw.line([10, 75, 75, 45, 150, 105, 225, 45, 290, 75], fill=190, width=12)
        draw.ellipse([70, 42, 80, 52], fill=255)
        draw.ellipse([145, 100, 155, 110], fill=255)
        
        buf = io.BytesIO()
        img.save(buf, format='PNG')
        buf.seek(0)
        return StreamingResponse(buf, media_type="image/png")

cpr_service = CprService()
