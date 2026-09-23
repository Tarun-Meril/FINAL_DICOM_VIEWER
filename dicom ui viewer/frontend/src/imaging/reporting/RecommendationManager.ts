/**
 * RecommendationManager Subsystem
 * Follow-up clinical recommendations management
 */

export class RecommendationManager {
  private recommendations: string[] = [];

  public addRecommendation(rec: string): void {
    this.recommendations.push(rec);
  }

  public getRecommendations(): string[] {
    return [...this.recommendations];
  }
}
