from typing import Dict, Any

class HangingProtocolService:
    def determine_protocol(self, modality: str, body_part: str = "", description: str = "") -> Dict[str, Any]:
        """Automatically assigns the optimal viewport layout grid using tag inputs"""
        mod = modality.upper()
        desc = description.upper()
        
        if "CT" in mod and "CHEST" in desc:
            return {"layout": "2x2 Quad", "modality": "CT", "protocol": "CT Chest Standard"}
        elif "MR" in mod or "MRI" in mod:
            return {"layout": "1x2 Split", "modality": "MR", "protocol": "MR Brain Standard"}
        elif "DX" in mod or "CR" in mod or "PX" in mod:
            return {"layout": "1x1 Single", "modality": "DX", "protocol": "X-Ray Standard"}
            
        return {"layout": "2x2 Quad", "modality": "CT", "protocol": "CT General Standard"}

    def get_protocols(self) -> list:
        """Returns standard hanging protocols catalog"""
        return [
            {"id": "ct_chest", "name": "CT Chest Protocol", "modality": "CT", "preferred_layout": "2x2 Quad"},
            {"id": "mr_brain", "name": "MR Brain Protocol", "modality": "MR", "preferred_layout": "1x2 Split"},
            {"id": "xr_general", "name": "X-Ray General Protocol", "modality": "DX", "preferred_layout": "1x1 Single"}
        ]

hanging_protocol_service = HangingProtocolService()
