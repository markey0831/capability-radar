export declare const CAPABILITY_CATEGORIES: readonly ["通用基础能力", "专业核心能力", "职业素养能力"];
export type CapabilityCategory = (typeof CAPABILITY_CATEGORIES)[number];
export declare const RATER_LEVELS: readonly ["superior", "peer", "subordinate"];
export type RaterLevel = (typeof RATER_LEVELS)[number];
export type RoleId = 'sales' | 'business' | 'project-manager' | 'technical-delivery' | 'offline-operations' | 'ip-operations' | 'content-distribution';
export interface CapabilityDimension {
    id: string;
    name: string;
    category: CapabilityCategory;
    description: string;
}
export interface RoleModel {
    id: RoleId;
    name: string;
    titleEn: string;
    dimensions: readonly CapabilityDimension[];
}
export interface AssessmentPerson {
    name: string;
    department: string;
    roleId: RoleId | '';
    assessmentDate: string;
}
export interface RaterInput {
    id: string;
    name: string;
    scores: Record<string, string>;
}
export interface AssessmentDraft {
    person: AssessmentPerson;
    raters: Record<RaterLevel, RaterInput[]>;
}
export interface FieldError {
    path: string;
    message: string;
}
export interface DimensionResult {
    dimensionId: string;
    name: string;
    category: CapabilityCategory;
    percentageScore: number;
    score: number;
}
export interface CategoryScore {
    category: CapabilityCategory;
    score: number;
}
export interface AssessmentResult {
    person: Omit<AssessmentPerson, 'roleId'> & {
        roleId: RoleId;
    };
    roleName: string;
    roleTitleEn: string;
    dimensions: DimensionResult[];
    categoryScores: CategoryScore[];
    overallAverage: number;
    levelAverages: Partial<Record<RaterLevel, Record<string, number>>>;
    effectiveWeights: Partial<Record<RaterLevel, number>>;
}
export interface SavedDimension {
    dimensionId: string;
    name: string;
    category: CapabilityCategory;
    score: number;
}
export interface SavedAssessmentV1 {
    schemaVersion: 1;
    id: string;
    person: {
        name: string;
        department: string;
        roleId: RoleId;
        roleName: string;
    };
    assessmentDate: string;
    dimensions: SavedDimension[];
    categoryScores: CategoryScore[];
    overallAverage: number;
    savedAt: string;
}
export interface HistorySummary {
    previousAverage: number;
    biggestImprovement: {
        name: string;
        delta: number;
    } | null;
    biggestDecline: {
        name: string;
        delta: number;
    } | null;
}
