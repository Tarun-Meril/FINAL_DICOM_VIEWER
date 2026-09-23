import io
import logging
import pydicom
from fastapi import HTTPException
from app.dicom.dicomweb_client import DicomWebClient

logger = logging.getLogger("medview_pro.pixel_stream")

class PixelStreamService:
    def __init__(self):
        self.dicom_client = DicomWebClient()

    async def get_frame_pixels(self, study_uid: str, series_uid: str, instance_uid: str, frame_number: int = 1):
        """Extracts and parses pixel_array from raw DICOM instance to stream to browser canvas"""
        try:
            # 1. Fetch raw dcm file bytes
            dicom_bytes = await self.dicom_client.retrieve_instance(study_uid, series_uid, instance_uid)
            if not dicom_bytes:
                raise Exception("Empty DICOM file bytes retrieved")
            
            try:
                # 2. Parse DICOM file using pydicom
                with pydicom.dcmread(io.BytesIO(dicom_bytes)) as ds:
                    rows = getattr(ds, "Rows", 512)
                    columns = getattr(ds, "Columns", 512)
                    photo = getattr(ds, "PhotometricInterpretation", "MONOCHROME2")
                    
                    try:
                        if not hasattr(ds, "pixel_array"):
                            raise Exception("No pixel_array in dataset")
                        pixel_array = ds.pixel_array
                        
                        # Dynamic frame slice selection for multi-frame instances
                        if len(pixel_array.shape) == 3:  # (frames, rows, cols)
                            if frame_number > pixel_array.shape[0] or frame_number < 1:
                                frame_number = 1
                            pixel_frame = pixel_array[frame_number - 1]
                        else:
                            pixel_frame = pixel_array
                        
                        return {
                            "rows": pixel_frame.shape[0],
                            "columns": pixel_frame.shape[1],
                            "photometric_interpretation": photo,
                            "pixel_data_min": int(pixel_frame.min()),
                            "pixel_data_max": int(pixel_frame.max()),
                            "frame": pixel_frame.tolist()
                        }
                    except Exception as parse_err:
                        logger.warning(f"Failed decoding pixel array for SOPInstanceUID {instance_uid}: {str(parse_err)}")
                        # Return an 'X' crossed placeholder grid to indicate decode failure visual indicator
                        import numpy as np
                        fallback_grid = np.zeros((rows, columns), dtype=np.int16)
                        for i in range(min(rows, columns)):
                            fallback_grid[i, i] = 100
                            fallback_grid[i, columns - 1 - i] = 100
                        return {
                            "rows": rows,
                            "columns": columns,
                            "photometric_interpretation": photo,
                            "pixel_data_min": 0,
                            "pixel_data_max": 100,
                            "frame": fallback_grid.tolist(),
                            "corrupted": True,
                            "error_message": str(parse_err)
                        }
            except Exception as read_err:
                logger.error(f"Failed parsing DICOM file bytes for {instance_uid}: {str(read_err)}")
                return {
                    "rows": 512,
                    "columns": 512,
                    "photometric_interpretation": "MONOCHROME2",
                    "pixel_data_min": 0,
                    "pixel_data_max": 0,
                    "frame": [[0]*512 for _ in range(512)],
                    "corrupted": True,
                    "error_message": f"Read failed: {str(read_err)}"
                }
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Pixel streaming failed: {str(e)}")

pixel_stream_service = PixelStreamService()
