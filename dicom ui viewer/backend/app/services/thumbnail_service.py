import io
from PIL import Image, ImageDraw
from fastapi.responses import StreamingResponse
from app.services.cache_service import cache_service

class ThumbnailService:
    async def get_series_thumbnail(self, series_uid: str) -> StreamingResponse:
        """Generates a compact, fast loading grayscale PNG thumbnail representing a CT slice"""
        img = Image.new('L', (80, 80), color=5)
        draw = ImageDraw.Draw(img)
        
        # Render a simple chest CT cross section schema
        draw.ellipse([10, 10, 70, 70], fill=15, outline=35, width=1)
        draw.ellipse([22, 22, 34, 52], fill=2, outline=20, width=1)
        draw.ellipse([46, 22, 58, 52], fill=2, outline=20, width=1)
        draw.ellipse([32, 28, 48, 50], fill=18, outline=30, width=1)
        
        buf = io.BytesIO()
        img.save(buf, format='PNG')
        buf.seek(0)
        
        return StreamingResponse(buf, media_type="image/png")

thumbnail_service = ThumbnailService()
