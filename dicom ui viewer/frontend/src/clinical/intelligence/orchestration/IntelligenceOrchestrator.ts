import { BiomarkerEngine, BiomarkerCalculator, QuantitativeBiomarker } from '../biomarkers/BiomarkerEngine';
import { DecisionSupportEngine, ClinicalRecommendation } from '../decisionSupport/DecisionSupportEngine';
import { ClinicalScoringEngine, ClinicalScoreResult } from '../scoring/ClinicalScoringEngine';
import { StudyQualityEngine, StudyQualityReport } from '../quality/StudyQualityEngine';
import { ClinicalSummary, ClinicalSummaryReport } from '../findings/ClinicalSummary';
import { ExplainabilityEngine, ExplanationChain } from '../explainability/ExplainabilityEngine';

export class IntelligenceOrchestrator {
  public biomarkerEngine = new BiomarkerEngine();
  public decisionEngine = new DecisionSupportEngine();

  public computeBiomarkers(): QuantitativeBiomarker[] {
    return this.biomarkerEngine.getBiomarkers();
  }

  public generateRecommendations(): ClinicalRecommendation[] {
    return this.decisionEngine.evaluateBiomarkers(this.computeBiomarkers());
  }

  public computeClinicalScore(noduleSizeMm: number): ClinicalScoreResult {
    return ClinicalScoringEngine.computeLungRads(noduleSizeMm);
  }

  public assessStudyQuality(numInstances: number, sliceSpacingMm: number): StudyQualityReport {
    return StudyQualityEngine.evaluateQuality(numInstances, sliceSpacingMm);
  }

  public generateClinicalSummary(patientId: string): ClinicalSummaryReport {
    return ClinicalSummary.generateSummary(patientId, this.computeBiomarkers(), this.generateRecommendations());
  }

  public getExplanation(rec: ClinicalRecommendation): ExplanationChain {
    return ExplainabilityEngine.buildExplanation(rec, this.computeBiomarkers());
  }
}
