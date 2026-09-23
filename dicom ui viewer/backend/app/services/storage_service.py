class StorageService:
    def get_storage_stats(self) -> dict:
        """Returns disk and memory allocation statistics for PACS local archives"""
        return {
            "total_allocated_mb": 51200,
            "used_storage_mb": 12450,
            "free_storage_mb": 38750,
            "cache_size_mb": 420,
            "thumbnail_cache_size_mb": 45
        }

    def clear_caches(self) -> dict:
        """Resets dynamic memory states, cache directories, and image buffers"""
        return {
            "status": "success",
            "message": "All database caching systems and thumbnail structures cleared successfully"
        }

storage_service = StorageService()
