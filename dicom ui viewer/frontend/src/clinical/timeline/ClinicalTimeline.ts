import { ClinicalCase, ClinicalFindingData } from '../model/ClinicalCase';

export interface TimelineEvent {
  id: string;
  date: string;
  type: 'study' | 'procedure' | 'finding' | 'recommendation';
  title: string;
  description: string;
  dataRef?: any;
}

export class ClinicalTimeline {
  public static generateTimeline(clinicalCase: ClinicalCase): TimelineEvent[] {
    const events: TimelineEvent[] = [];

    if (clinicalCase.activeStudy) {
      events.push({
        id: `evt-study-${clinicalCase.activeStudy.studyUid}`,
        date: clinicalCase.activeStudy.studyDate,
        type: 'study',
        title: `Active Study: ${clinicalCase.activeStudy.description}`,
        description: `Modalities: ${clinicalCase.activeStudy.modalities.join(', ')}`,
        dataRef: clinicalCase.activeStudy
      });
    }

    clinicalCase.priorStudies.forEach(study => {
      events.push({
        id: `evt-study-${study.studyUid}`,
        date: study.studyDate,
        type: 'study',
        title: `Prior Study: ${study.description}`,
        description: `Modalities: ${study.modalities.join(', ')}`,
        dataRef: study
      });
    });

    clinicalCase.findings.forEach(f => {
      events.push({
        id: `evt-finding-${f.id}`,
        date: f.createdAt,
        type: 'finding',
        title: `Finding: ${f.title}`,
        description: `${f.category} (${f.severity}) - ${f.description}`,
        dataRef: f
      });
    });

    // Chronological sort
    events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return events;
  }
}
