import type { AgentAppProjection, ReadinessResult } from "../types";
export type AgentAppSchemaGateIssueCode = "FIELD_MISSING" | "ARRAY_FIELD_INVALID" | "PROVENANCE_MISSING" | "READINESS_ISSUE_INVALID";
export interface AgentAppSchemaGateIssue {
    code: AgentAppSchemaGateIssueCode;
    path: string;
    message: string;
}
export interface AgentAppSchemaGateResult {
    status: "valid" | "invalid";
    issues: AgentAppSchemaGateIssue[];
}
export declare function validateProjectionSchemaCoverage(projection: AgentAppProjection): AgentAppSchemaGateResult;
export declare function validateReadinessSchemaCoverage(readiness: ReadinessResult): AgentAppSchemaGateResult;
