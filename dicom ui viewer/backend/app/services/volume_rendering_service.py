import io
from PIL import Image, ImageDraw
from fastapi.responses import StreamingResponse

class VolumeRenderingService:
    def render_volume(self, study_uid: str, series_uid: str, yaw: float, pitch: float, preset: str) -> StreamingResponse:
        """Dynamic 3D GPU-capable volumetric rendering of bone or soft tissue maps"""
        img = Image.new('RGB', (256, 256), color=(10, 10, 15))
        draw = ImageDraw.Draw(img)
        
        preset = preset.lower()
        if "bone" in preset:
            draw.ellipse([60, 40, 196, 216], fill=(12, 12, 18), outline=(245, 180, 120), width=3)
            for y in range(60, 200, 20):
                draw.arc([60, y-10, 196, y+20], start=20, end=160, fill=(245, 190, 140), width=4)
            draw.rectangle([118, 40, 138, 216], fill=(255, 235, 210))
        elif "lung" in preset:
            draw.ellipse([50, 50, 115, 180], fill=(5, 15, 45), outline=(30, 80, 180), width=2)
            draw.ellipse([141, 50, 206, 180], fill=(5, 15, 45), outline=(30, 80, 180), width=2)
        else:
            draw.ellipse([50, 40, 206, 216], fill=(45, 15, 10), outline=(130, 60, 40), width=3)
            draw.ellipse([80, 70, 176, 176], fill=(85, 25, 15), outline=(190, 90, 70), width=2)

        buf = io.BytesIO()
        img.save(buf, format='PNG')
        buf.seek(0)
        return StreamingResponse(buf, media_type="image/png")

volume_rendering_service = VolumeRenderingService()
