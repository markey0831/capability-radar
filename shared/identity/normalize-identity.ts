export function normalizeIdentityText(value: string): string {
  return value.replaceAll('\u3000', ' ').trim().replace(/\s+/g, ' ')
}

export interface NormalizedRaterIdentity {
  displayName: string
  displayDepartment: string
  normalizedName: string
  normalizedDepartment: string
}

export function normalizeRaterIdentity(name: string, department: string): NormalizedRaterIdentity {
  return {
    displayName: name.trim(),
    displayDepartment: department.trim(),
    normalizedName: normalizeIdentityText(name),
    normalizedDepartment: normalizeIdentityText(department),
  }
}
