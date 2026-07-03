import type { PluginProjection, ReadinessResult } from "../types";
export type PluginSchemaGateIssueCode = "FIELD_MISSING" | "ARRAY_FIELD_INVALID" | "PROVENANCE_MISSING" | "READINESS_ISSUE_INVALID";
export interface PluginSchemaGateIssue {
    code: PluginSchemaGateIssueCode;
    path: string;
    message: string;
}
export interface PluginSchemaGateResult {
    status: "valid" | "invalid";
    issues: PluginSchemaGateIssue[];
}
export declare function validateProjectionSchemaCoverage(projection: PluginProjection): PluginSchemaGateResult;
export declare function validateReadinessSchemaCoverage(readiness: ReadinessResult): PluginSchemaGateResult;
