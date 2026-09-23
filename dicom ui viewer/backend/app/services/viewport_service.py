class ViewportService:
    def get_viewport_load_settings(self) -> dict:
        """Returns standard render properties for the frontend viewport canvas engine"""
        return {
            "status": "success",
            "viewport_engine": "Cornerstone3D",
            "gpu_accelerated": True,
            "interpolation": "trilinear",
            "rendering_pipelines": ["stack", "volume"]
        }

viewport_service = ViewportService()
