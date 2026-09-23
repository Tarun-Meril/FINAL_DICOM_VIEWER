import pydicom
from typing import Dict, Any
from io import BytesIO

class DicomParserService:
    def parse_meta(self, file_bytes: bytes) -> Dict[str, Any]:
        """Extract standard DICOM tags from raw bytes using pydicom"""
        try:
            with pydicom.dcmread(BytesIO(file_bytes), stop_before_pixels=True) as ds:
                def get_val(tag, default=""):
                    if tag in ds:
                        val = ds[tag].value
                        if isinstance(val, (pydicom.valuerep.DSfloat, pydicom.valuerep.DSdecimal)):
                            return float(val)
                        if isinstance(val, pydicom.valuerep.IS):
                            return int(val)
                        if isinstance(val, pydicom.multival.MultiValue):
                            return [str(v) for v in val]
                        if isinstance(val, bytes):
                            return val.decode('utf-8', errors='ignore')
                        return str(val)
                    return default

                patient_name = get_val(0x00100010, "Anonymous")
                # Handle alphabetic representations inside patient name elements
                if hasattr(patient_name, "components"):
                    patient_name = "^".join([str(c) for c in patient_name.components])
                elif hasattr(patient_name, "original_string"):
                    patient_name = patient_name.original_string
                elif isinstance(patient_name, bytes):
                    patient_name = patient_name.decode('utf-8', errors='ignore')
                
                return {
                    "patient_name": str(patient_name),
                    "patient_id": get_val(0x00100020, "PID_UNKNOWN"),
                    "patient_birth_date": get_val(0x00100030, None),
                    "patient_sex": get_val(0x00100040, "O"),
                    "study_instance_uid": get_val(0x0020000d, ""),
                    "series_instance_uid": get_val(0x0020000e, ""),
                    "sop_instance_uid": get_val(0x00080018, ""),
                    "modality": get_val(0x00080060, "CT"),
                    "study_date": get_val(0x00080020, None),
                    "study_time": get_val(0x00080030, None),
                    "accession_number": get_val(0x00080050, None),
                    "study_description": get_val(0x00081030, "(No Description)"),
                    "series_description": get_val(0x0008103e, ""),
                    "institution": get_val(0x00080080, None),
                    "manufacturer": get_val(0x00080070, None),
                    "slice_thickness": float(get_val(0x00180050, 1.25)) if get_val(0x00180050, None) else 1.25,
                    "pixel_spacing": get_val(0x00280030, [0.68, 0.68]),
                    "window_width": float(get_val(0x00281051, 400)) if get_val(0x00281051, None) else 400,
                    "window_level": float(get_val(0x00281050, 40)) if get_val(0x00281050, None) else 40,
                    "rows": int(get_val(0x00280010, 512)) if get_val(0x00280010, None) else 512,
                    "columns": int(get_val(0x00280011, 512)) if get_val(0x00280011, None) else 512,
                    "transfer_syntax": str(ds.file_meta.TransferSyntaxUID) if hasattr(ds, 'file_meta') and hasattr(ds.file_meta, 'TransferSyntaxUID') else "1.2.840.10008.1.2.1"
                }
        except Exception as e:
            raise ValueError(f"DICOM parsing failed: {str(e)}")

dicom_parser_service = DicomParserService()
