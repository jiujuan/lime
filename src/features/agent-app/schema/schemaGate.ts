import type { AgentAppProjection, ReadinessIssue, ReadinessResult } from "../types";

export type AgentAppSchemaGateIssueCode =
  | "FIELD_MISSING"
  | "ARRAY_FIELD_INVALID"
  | "PROVENANCE_MISSING"
  | "READINESS_ISSUE_INVALID";

export interface AgentAppSchemaGateIssue {
  code: AgentAppSchemaGateIssueCode;
  path: string;
  message: string;
}

export interface AgentAppSchemaGateResult {
  status: "valid" | "invalid";
  issues: AgentAppSchemaGateIssue[];
}

const REQUIRED_PROJECTION_ARRAYS = [
  "entries",
  "requiredCapabilities",
  "knowledgeBindings",
  "artifactTypes",
  "policies",
  "services",
  "workflows",
  "skillRequirements",
  "toolRequirements",
  "evals",
  "events",
  "secrets",
  "overlayTemplates",
  "readinessHints",
] as const;

const REQUIRED_PROJECTION_OBJECTS = [
  "app",
  "package",
  "runtimePackage",
  "provenance",
  "lifecycle",
] as const;

const SETUP_READINESS_CODES = new Set<string>([
  "KNOWLEDGE_BINDING_REQUIRED",
  "SKILL_REQUIRED",
  "TOOL_REQUIRED",
  "ARTIFACT_TYPE_REQUIRED",
  "EVAL_REQUIRED",
  "SECRET_REQUIRED",
  "OVERLAY_REQUIRED",
  "SERVICE_REQUIRED",
  "WORKFLOW_REQUIRED",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function addIssue(
  issues: AgentAppSchemaGateIssue[],
  issue: AgentAppSchemaGateIssue,
): void {
  issues.push(issue);
}

function validateArrayField(
  value: unknown,
  path: string,
  issues: AgentAppSchemaGateIssue[],
): void {
  if (!Array.isArray(value)) {
    addIssue(issues, {
      code: "ARRAY_FIELD_INVALID",
      path,
      message: `${path} must be an array for Agent App v0.3 projection coverage.`,
    });
  }
}

function validateObjectField(
  value: unknown,
  path: string,
  issues: AgentAppSchemaGateIssue[],
): void {
  if (!isRecord(value)) {
    addIssue(issues, {
      code: "FIELD_MISSING",
      path,
      message: `${path} must be an object for Agent App v0.3 projection coverage.`,
    });
  }
}

function validateProvenance(
  value: unknown,
  path: string,
  issues: AgentAppSchemaGateIssue[],
): void {
  if (!isRecord(value)) {
    addIssue(issues, {
      code: "PROVENANCE_MISSING",
      path,
      message: `${path} must include provenance.`,
    });
    return;
  }
  ["appId", "appVersion", "packageHash", "manifestHash"].forEach((key) => {
    if (typeof value[key] !== "string" || !value[key]) {
      addIssue(issues, {
        code: "PROVENANCE_MISSING",
        path: `${path}.${key}`,
        message: `${path}.${key} must be a non-empty string.`,
      });
    }
  });
}

export function validateProjectionSchemaCoverage(
  projection: AgentAppProjection,
): AgentAppSchemaGateResult {
  const issues: AgentAppSchemaGateIssue[] = [];
  const record = projection as unknown as Record<string, unknown>;

  REQUIRED_PROJECTION_OBJECTS.forEach((field) => {
    validateObjectField(record[field], `$.${field}`, issues);
  });
  REQUIRED_PROJECTION_ARRAYS.forEach((field) => {
    validateArrayField(record[field], `$.${field}`, issues);
  });

  validateProvenance(projection.provenance, "$.provenance", issues);
  const entries = Array.isArray(record.entries) ? projection.entries : [];
  entries.forEach((entry, index) => {
    if (!isRecord(entry)) {
      addIssue(issues, {
        code: "FIELD_MISSING",
        path: `$.entries[${index}]`,
        message: `$.entries[${index}] must be an object.`,
      });
      return;
    }
    validateProvenance(entry.provenance, `$.entries[${index}].provenance`, issues);
  });

  return {
    status: issues.length > 0 ? "invalid" : "valid",
    issues,
  };
}

function validateReadinessIssue(
  issue: ReadinessIssue,
  path: string,
  issues: AgentAppSchemaGateIssue[],
): void {
  if (!isRecord(issue)) {
    addIssue(issues, {
      code: "READINESS_ISSUE_INVALID",
      path,
      message: `${path} must be an object.`,
    });
    return;
  }
  if (!issue.code || !issue.message || !issue.severity) {
    addIssue(issues, {
      code: "READINESS_ISSUE_INVALID",
      path,
      message: `${path} must include code, severity, and message.`,
    });
  }
  if (SETUP_READINESS_CODES.has(issue.code)) {
    ["kind", "key", "remediation"].forEach((field) => {
      if (typeof issue[field as keyof ReadinessIssue] !== "string") {
        addIssue(issues, {
          code: "READINESS_ISSUE_INVALID",
          path: `${path}.${field}`,
          message: `${path}.${field} is required for setup readiness issues.`,
        });
      }
    });
  }
}

export function validateReadinessSchemaCoverage(
  readiness: ReadinessResult,
): AgentAppSchemaGateResult {
  const issues: AgentAppSchemaGateIssue[] = [];
  const record = readiness as unknown as Record<string, unknown>;

  ["blockers", "warnings", "supportedCapabilities", "missingCapabilities", "entryReadiness"].forEach(
    (field) => validateArrayField(record[field], `$.${field}`, issues),
  );

  const blockers = Array.isArray(record.blockers) ? readiness.blockers : [];
  const warnings = Array.isArray(record.warnings) ? readiness.warnings : [];
  const entryReadiness = Array.isArray(record.entryReadiness)
    ? readiness.entryReadiness
    : [];

  blockers.forEach((issue, index) => {
    validateReadinessIssue(issue, `$.blockers[${index}]`, issues);
  });
  warnings.forEach((issue, index) => {
    validateReadinessIssue(issue, `$.warnings[${index}]`, issues);
  });
  entryReadiness.forEach((entry, index) => {
    if (!isRecord(entry)) {
      addIssue(issues, {
        code: "FIELD_MISSING",
        path: `$.entryReadiness[${index}]`,
        message: `$.entryReadiness[${index}] must be an object.`,
      });
      return;
    }
    validateArrayField(entry.issues, `$.entryReadiness[${index}].issues`, issues);
    const entryIssues = Array.isArray(entry.issues) ? entry.issues : [];
    entryIssues.forEach((issue, issueIndex) => {
      validateReadinessIssue(
        issue,
        `$.entryReadiness[${index}].issues[${issueIndex}]`,
        issues,
      );
    });
  });

  return {
    status: issues.length > 0 ? "invalid" : "valid",
    issues,
  };
}
