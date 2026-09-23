class StatisticsService:
    def format_hu_stats(self, mean: float, std: float) -> str:
        """Formats mean and standard deviations in standard Hounsfield Units notation"""
        return f"{mean:.1f} ± {std:.1f} HU"

statistics_service = StatisticsService()
