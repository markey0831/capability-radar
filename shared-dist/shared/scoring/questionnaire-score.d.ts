import type { AnswerCode } from '../question-bank/schema';
import type { IndividualDimensionScore, QuestionnaireAnswers, QuestionnaireAssessmentResult, QuestionnaireRaterResponse, ScorableRole } from '../domain/types';
export declare const ANSWER_PERCENTAGE_SCORES: Readonly<Record<Exclude<AnswerCode, 'UNABLE'>, number>>;
export declare const MINIMUM_VALID_ANSWERS_PER_DIMENSION = 3;
export declare function answerPercentageScore(answer: AnswerCode | undefined): number | null;
export declare function calculateIndividualDimensionScores(role: ScorableRole, answers: QuestionnaireAnswers): IndividualDimensionScore[];
export declare function calculateQuestionnaireAssessment(role: ScorableRole, questionnaireVersion: string, raters: readonly QuestionnaireRaterResponse[]): QuestionnaireAssessmentResult;
