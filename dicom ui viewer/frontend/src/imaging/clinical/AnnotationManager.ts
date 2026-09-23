/**
 * AnnotationManager Subsystem
 * Manages text annotations, arrow pointers, freehand notes, and bookmarks
 */

import { IAnnotation, IAnnotationManager, IEngineContext } from '../types/contracts';
import { EngineEvents } from '../types/events';

export class AnnotationManager implements IAnnotationManager {
  private engineContext: IEngineContext;
  private annotations: Map<string, IAnnotation> = new Map();

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public addAnnotation(annotation: IAnnotation): void {
    if (!annotation || !annotation.annotationId) return;

    this.annotations.set(annotation.annotationId, annotation);
    this.engineContext.logger.info('Clinical', `Added annotation ${annotation.annotationId} ("${annotation.text || annotation.type}")`);

    this.engineContext.eventBus.emit(EngineEvents.ANNOTATION_CREATED, {
      annotationId: annotation.annotationId,
      text: annotation.text,
      type: annotation.type,
    });
  }

  public removeAnnotation(annotationId: string): void {
    this.annotations.delete(annotationId);
    this.engineContext.logger.info('Clinical', `Removed annotation ${annotationId}`);
    this.engineContext.eventBus.emit(EngineEvents.ANNOTATION_DELETED, { annotationId });
  }

  public getAnnotationsForViewport(viewportId: string): IAnnotation[] {
    return Array.from(this.annotations.values()).filter((a) => a.viewportId === viewportId);
  }
}
