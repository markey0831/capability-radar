import type { AnswerCode, QuestionBankRole } from '../question-bank/schema';
export declare const RATER_LEVELS: readonly ["superior", "peer", "subordinate"];
export type RaterLevel = (typeof RATER_LEVELS)[number];
export declare const RATER_LEVEL_WEIGHTS: Readonly<Record<RaterLevel, number>>;
export type QuestionnaireAnswers = Partial<Record<string, AnswerCode>>;
export interface QuestionnaireRaterResponse {
    id: string;
    level: RaterLevel;
    answers: QuestionnaireAnswers;
}
export interface IndividualDimensionScore {
    dimensionId: string;
    validAnswerCount: number;
    percentageScore: number | null;
    fivePointScore: number | null;
}
export interface LevelDimensionAggregate {
    level: RaterLevel;
    validRaterCount: number;
    percentageMean: number;
}
export interface AggregatedDimensionScore {
    dimensionId: string;
    name: string;
    percentageScore: number | null;
    fivePointScore: number | null;
    validRaterCount: number;
    levels: Partial<Record<RaterLevel, LevelDimensionAggregate>>;
}
export interface QuestionnaireAssessmentResult {
    roleId: string;
    questionnaireVersion: string;
    dimensions: AggregatedDimensionScore[];
    isComplete: boolean;
    overallFivePointScore: number | null;
    submittedRaterCounts: Record<RaterLevel, number>;
}
export interface HistoricalResultIdentity {
    personId: string;
    roleId: string;
    dimensionIds: readonly string[];
}
export type ScorableRole = Pick<QuestionBankRole, 'id' | 'dimensions'>;
