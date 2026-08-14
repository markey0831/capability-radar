export declare function normalizeIdentityText(value: string): string;
export interface NormalizedRaterIdentity {
    displayName: string;
    displayDepartment: string;
    normalizedName: string;
    normalizedDepartment: string;
}
export declare function normalizeRaterIdentity(name: string, department: string): NormalizedRaterIdentity;
