// Branded / constrained entity identifiers.
// TypeScript rejects cross-entity ID mixups at compile time; the guards below
// validate untrusted strings (route params, form input) at runtime.

export type AccountId = `ACC-${string}`;
export type UserId = `USR-${string}`;
export type SolutionId = `SOL-${string}`;
export type MomentEventId = `ME-${string}`;
export type OpportunityId = `OPP-${string}`;
export type OrganizationId = `ORG-${string}`;
export type IndustryId = `IND-${string}`;
export type ProjectTypeId = `PT-${string}`;

export function isAccountId(v: string): v is AccountId {
  return v.startsWith("ACC-");
}

export function isUserId(v: string): v is UserId {
  return v.startsWith("USR-");
}

export function isSolutionId(v: string): v is SolutionId {
  return v.startsWith("SOL-");
}

export function isMomentEventId(v: string): v is MomentEventId {
  return v.startsWith("ME-");
}

export function isOpportunityId(v: string): v is OpportunityId {
  return v.startsWith("OPP-");
}

export function isIndustryId(v: string): v is IndustryId {
  return v.startsWith("IND-");
}

export function isProjectTypeId(v: string): v is ProjectTypeId {
  return v.startsWith("PT-");
}
