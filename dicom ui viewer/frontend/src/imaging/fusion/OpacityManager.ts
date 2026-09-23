/**
 * OpacityManager Subsystem
 * Alpha opacity fusion blending curves
 */

export class OpacityManager {
  private opacity: number = 0.5;

  public setOpacity(opacity: number): void {
    this.opacity = Math.max(0, Math.min(1, opacity));
  }

  public getOpacity(): number {
    return this.opacity;
  }
}
