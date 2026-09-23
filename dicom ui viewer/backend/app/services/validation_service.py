from io import BytesIO

class ValidationService:
    def validate_dicom(self, file_bytes: bytes) -> tuple[bool, str]:
        """Validates if file has standard DICOM header prefix and is readable"""
        if len(file_bytes) < 132:
            return False, "File is too small to be a valid DICOM file"
        
        # Standard DICOM format check: bytes 128-131 must contain 'DICM'
        magic = file_bytes[128:132]
        if magic != b"DICM":
            return False, "Missing 'DICM' signature at offset 128"
            
        try:
            import pydicom
            pydicom.dcmread(BytesIO(file_bytes), stop_before_pixels=True)
            return True, "Valid DICOM file"
        except Exception as e:
            return False, f"Failed to parse with pydicom: {str(e)}"

validation_service = ValidationService()
