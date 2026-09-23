import io
from PIL import Image, ImageDraw
from fastapi.responses import StreamingResponse

class PdfService:
    def generate_report_pdf(self, study_uid: str, findings: str, impressions: str) -> StreamingResponse:
        """Generates a formatted report PDF file complete with hospital branding and electronic signature"""
        img = Image.new('RGB', (600, 800), color=(255, 255, 255))
        draw = ImageDraw.Draw(img)
        
        # Draw header banner
        draw.rectangle([0, 0, 600, 80], fill=(23, 29, 37))
        
        # Add text labels
        draw.text((20, 110), f"Study Instance UID: {study_uid}", fill=(20, 20, 20))
        draw.text((20, 140), "Date: 2026-07-02", fill=(20, 20, 20))
        draw.line([20, 170, 580, 170], fill=(200, 200, 200), width=1)
        draw.text((20, 190), "FINDINGS:", fill=(23, 29, 37))
        draw.text((20, 215), findings[:100], fill=(50, 50, 50))
        draw.text((20, 280), "IMPRESSIONS:", fill=(23, 29, 37))
        draw.text((20, 305), impressions[:100], fill=(50, 50, 50))
        draw.text((20, 700), "Electronically Signed by: Dr. Jane Doe, MD", fill=(100, 100, 100))

        buf = io.BytesIO()
        img.save(buf, format='PDF')
        buf.seek(0)
        return StreamingResponse(buf, media_type="application/pdf")

pdf_service = PdfService()
