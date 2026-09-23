export class ThumbnailMetrics {
  private renderTimes: number[] = [];
  private cacheHitsMemory = 0;
  private cacheHitsDB = 0;
  private cacheMisses = 0;

  public logRenderTime(ms: number) {
    this.renderTimes.push(ms);
    // Keep last 100 for average
    if (this.renderTimes.length > 100) this.renderTimes.shift();
  }

  public logCacheHitMemory() {
    this.cacheHitsMemory++;
  }

  public logCacheHitDB() {
    this.cacheHitsDB++;
  }

  public logCacheMiss() {
    this.cacheMisses++;
  }

  public getStats() {
    const totalRequests = this.cacheHitsMemory + this.cacheHitsDB + this.cacheMisses;
    const avgRender = this.renderTimes.length > 0 
      ? this.renderTimes.reduce((a, b) => a + b, 0) / this.renderTimes.length 
      : 0;
      
    return {
      totalRequests,
      memoryHitRate: totalRequests ? (this.cacheHitsMemory / totalRequests) * 100 : 0,
      dbHitRate: totalRequests ? (this.cacheHitsDB / totalRequests) * 100 : 0,
      avgRenderTimeMs: avgRender
    };
  }
}
