export type CineMode = 'loop' | 'ping-pong' | 'once';

export class Timeline {
  public totalFrames = 100;
  public currentFrame = 0;
}

export class CineController {
  public isPlaying = false;
  public mode: CineMode = 'loop';
  public fps = 24;
  public timeline = new Timeline();
  private direction = 1;
  private timerId: any = null;

  public start(onFrame: (frame: number) => void): void {
    if (this.isPlaying) return;
    this.isPlaying = true;

    this.timerId = setInterval(() => {
      if (!this.isPlaying) return;

      this.timeline.currentFrame += this.direction;

      if (this.timeline.currentFrame >= this.timeline.totalFrames - 1) {
        if (this.mode === 'loop') {
          this.timeline.currentFrame = 0;
        } else if (this.mode === 'ping-pong') {
          this.direction = -1;
          this.timeline.currentFrame = this.timeline.totalFrames - 1;
        } else {
          this.stop();
        }
      } else if (this.timeline.currentFrame <= 0 && this.mode === 'ping-pong') {
        this.direction = 1;
        this.timeline.currentFrame = 0;
      }

      onFrame(this.timeline.currentFrame);
    }, 1000 / this.fps);
  }

  public stop(): void {
    this.isPlaying = false;
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  public stepForward(onFrame: (frame: number) => void): void {
    this.timeline.currentFrame = Math.min(this.timeline.totalFrames - 1, this.timeline.currentFrame + 1);
    onFrame(this.timeline.currentFrame);
  }

  public stepBackward(onFrame: (frame: number) => void): void {
    this.timeline.currentFrame = Math.max(0, this.timeline.currentFrame - 1);
    onFrame(this.timeline.currentFrame);
  }
}
