/**
 * AnnotationRepository Tracker
 * In-memory repository for storing and querying text and arrow annotations
 */

import { IAnnotation } from '../types/contracts';

export class AnnotationRepository {
  private repoMap: Map<string, IAnnotation> = new Map();

  public saveAnnotation(annotation: IAnnotation): void {
    if (!annotation || !annotation.annotationId) return;
    this.repoMap.set(annotation.annotationId, annotation);
  }

  public getAnnotation(annotationId: string): IAnnotation | undefined {
    return this.repoMap.get(annotationId);
  }

  public clear(): void {
    this.repoMap.clear();
  }
}
