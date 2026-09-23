from app.streaming.pixel_stream import pixel_stream_service

class StreamingService:
    async def stream_pixel_data(self, study_uid: str, series_uid: str, instance_uid: str, frame_number: int = 1):
        """Streams DICOM instance slices parsed by pydicom"""
        return await pixel_stream_service.get_frame_pixels(study_uid, series_uid, instance_uid, frame_number)

streaming_service = StreamingService()
