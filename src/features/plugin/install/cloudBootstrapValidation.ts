import type {
  CloudBootstrapApp,
  CloudBootstrapLicenseState,
  CloudBootstrapPayload,
  CloudBootstrapRegistrationState,
  CloudBootstrapToolAvailability,
  CloudBootstrapToolAvailabilityStatus,
  CloudBootstrapValidationIssue,
  CloudBootstrapValidationResult,
  PluginCloudReleaseSignatureAlgorithm,
  PluginCloudReleaseSignatureProof,
  RuntimeTarget,
} from "../types";

export class PluginCloudBootstrapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PluginCloudBootstrapError";
  }
}

const ALLOWED_TOOL_AVAILABILITY_STATUSES =
  new Set<CloudBootstrapToolAvailabilityStatus>([
    "available",
    "not-enabled",
    "missing",
    "unknown",
  ]);

const ALLOWED_LICENSE_STATES = new Set<CloudBootstrapLicenseState>([
  "active",
  "trial",
  "expired",
  "revoked",
  "unknown",
]);

const ALLOWED_REGISTRATION_STATES = new Set<CloudBootstrapRegistrationState>([
  "not_required",
  "required",
  "active",
  "expired",
  "revoked",
]);

const ALLOWED_SIGNATURE_ALGORITHMS =
  new Set<PluginCloudReleaseSignatureAlgorithm>([
    "RSASSA-PKCS1-v1_5-SHA256",
    "RSA-PSS-SHA256",
    "ECDSA-P256-SHA256",
    "Ed25519",
  ]);

const FORBIDDEN_BOOTSTRAP_KEYS = new Set([
  "apikey",
  "accesstoken",
  "refreshtoken",
  "secret",
  "secrets",
  "token",
  "credential",
  "credentials",
  "customerdata",
  "workspacedata",
  "storagedata",
  "knowledgecontent",
  "knowledgetext",
  "privatecontent",
  "registrationcode",
  "registrationcodehash",
]);

const ALLOWED_RUNTIME_TARGETS = new Set<RuntimeTarget>([
  "local",
  "hybrid",
  "server-assisted",
  "cloud",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized || undefined;
}

function addIssue(
  issues: CloudBootstrapValidationIssue[],
  issue: Omit<CloudBootstrapValidationIssue, "severity"> & {
    severity?: CloudBootstrapValidationIssue["severity"];
  },
): void {
  issues.push({
    severity: issue.severity ?? "blocker",
    ...issue,
  });
}

function readRequiredString(
  record: Record<string, unknown>,
  key: string,
  path: string,
  issues: CloudBootstrapValidationIssue[],
): string {
  const value = normalizeOptionalString(record[key]);
  if (!value) {
    addIssue(issues, {
      code: "FIELD_MISSING",
      path: `${path}.${key}`,
      message: `Cloud bootstrap app missing string field: ${key}`,
    });
    return "";
  }
  return value;
}

function readOptionalStringArray(
  value: unknown,
  path: string,
  issues: CloudBootstrapValidationIssue[],
): string[] {
  if (value == null) {
    return [];
  }
  if (!Array.isArray(value)) {
    addIssue(issues, {
      code: "FIELD_INVALID",
      path,
      message: "Cloud bootstrap string array field must be an array",
    });
    return [];
  }
  return value
    .map((entry, index) => {
      const normalized = normalizeOptionalString(entry);
      if (!normalized) {
        addIssue(issues, {
          code: "FIELD_INVALID",
          path: `${path}[${index}]`,
          message: "Cloud bootstrap string array item must be a non-empty string",
        });
      }
      return normalized;
    })
    .filter((entry): entry is string => Boolean(entry));
}

function readStringRecord(
  value: unknown,
  path: string,
  issues: CloudBootstrapValidationIssue[],
): Record<string, string> {
  if (value == null) {
    return {};
  }
  if (!isRecord(value)) {
    addIssue(issues, {
      code: "FIELD_INVALID",
      path,
      message: "Cloud bootstrap capability requirements must be an object",
    });
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, entry]) => {
        const normalizedKey = key.trim();
        const normalizedValue = normalizeOptionalString(entry);
        if (!normalizedKey || !normalizedValue) {
          addIssue(issues, {
            code: "FIELD_INVALID",
            path: `${path}.${key}`,
            message: "Cloud bootstrap capability requirement must be a non-empty string range",
          });
          return null;
        }
        return [normalizedKey, normalizedValue] as const;
      })
      .filter((entry): entry is readonly [string, string] => Boolean(entry)),
  );
}

function readSignatureProof(
  value: unknown,
  path: string,
  issues: CloudBootstrapValidationIssue[],
): PluginCloudReleaseSignatureProof | undefined {
  if (value == null) {
    return undefined;
  }
  if (!isRecord(value)) {
    addIssue(issues, {
      code: "FIELD_INVALID",
      path,
      message: "Cloud bootstrap signatureProof must be an object",
    });
    return undefined;
  }

  const publicKeyId = readRequiredString(value, "publicKeyId", path, issues);
  const algorithmValue = normalizeOptionalString(value.algorithm);
  if (
    !algorithmValue ||
    !ALLOWED_SIGNATURE_ALGORITHMS.has(
      algorithmValue as PluginCloudReleaseSignatureAlgorithm,
    )
  ) {
    addIssue(issues, {
      code: "FIELD_INVALID",
      path: `${path}.algorithm`,
      message: "Cloud bootstrap signatureProof algorithm is unsupported",
    });
  }
  const signature = readRequiredString(value, "signature", path, issues);

  return {
    schemaVersion: normalizeOptionalString(value.schemaVersion),
    publicKeyId,
    algorithm: ALLOWED_SIGNATURE_ALGORITHMS.has(
      algorithmValue as PluginCloudReleaseSignatureAlgorithm,
    )
      ? (algorithmValue as PluginCloudReleaseSignatureAlgorithm)
      : "RSASSA-PKCS1-v1_5-SHA256",
    signature,
    payloadHash: normalizeOptionalString(value.payloadHash),
    signedAt: normalizeOptionalString(value.signedAt),
  };
}

function readPolicyDefaults(
  value: unknown,
  path: string,
  issues: CloudBootstrapValidationIssue[],
): Record<string, unknown> {
  if (value == null) {
    return {};
  }
  if (!isRecord(value)) {
    addIssue(issues, {
      code: "FIELD_INVALID",
      path,
      message: "Cloud bootstrap policy defaults must be an object",
    });
    return {};
  }
  if (value.allowServerAssisted === true) {
    addIssue(issues, {
      code: "SERVER_ASSISTED_DEFAULT_UNSUPPORTED",
      path: `${path}.allowServerAssisted`,
      message: "Cloud bootstrap cannot enable server-assisted runtime by default",
    });
  }
  return value;
}

function readToolAvailability(
  value: unknown,
  path: string,
  issues: CloudBootstrapValidationIssue[],
): CloudBootstrapToolAvailability[] {
  if (value == null) {
    return [];
  }
  if (!Array.isArray(value)) {
    addIssue(issues, {
      code: "FIELD_INVALID",
      path,
      message: "Cloud bootstrap tool availability must be an array",
    });
    return [];
  }

  return value
    .map((entry, index): CloudBootstrapToolAvailability | null => {
      const itemPath = `${path}[${index}]`;
      if (!isRecord(entry)) {
        addIssue(issues, {
          code: "FIELD_INVALID",
          path: itemPath,
          message: "Cloud bootstrap tool availability item must be an object",
        });
        return null;
      }

      const key = readRequiredString(entry, "key", itemPath, issues);
      const status = readRequiredString(entry, "status", itemPath, issues);
      if (
        status &&
        !ALLOWED_TOOL_AVAILABILITY_STATUSES.has(
          status as CloudBootstrapToolAvailabilityStatus,
        )
      ) {
        addIssue(issues, {
          code: "FIELD_INVALID",
          path: `${itemPath}.status`,
          message: `Unsupported tool availability status: ${status}`,
        });
      }

      if (
        !key ||
        !status ||
        !ALLOWED_TOOL_AVAILABILITY_STATUSES.has(
          status as CloudBootstrapToolAvailabilityStatus,
        )
      ) {
        return null;
      }

      return {
        key,
        status: status as CloudBootstrapToolAvailabilityStatus,
        version: normalizeOptionalString(entry.version),
        required: typeof entry.required === "boolean" ? entry.required : undefined,
        reason: normalizeOptionalString(entry.reason),
      };
    })
    .filter((entry): entry is CloudBootstrapToolAvailability => Boolean(entry));
}

function readRuntimeTargets(
  value: unknown,
  path: string,
  issues: CloudBootstrapValidationIssue[],
): RuntimeTarget[] {
  if (value == null) {
    return [];
  }
  if (!Array.isArray(value)) {
    addIssue(issues, {
      code: "FIELD_INVALID",
      path,
      message: "Cloud bootstrap runtimeTargets must be an array",
    });
    return [];
  }
  return value
    .map((entry, index) => {
      const normalized = normalizeOptionalString(entry);
      if (!normalized || !ALLOWED_RUNTIME_TARGETS.has(normalized as RuntimeTarget)) {
        addIssue(issues, {
          code: "FIELD_INVALID",
          path: `${path}[${index}]`,
          message: `Unsupported cloud bootstrap runtime target: ${String(entry)}`,
        });
        return null;
      }
      return normalized as RuntimeTarget;
    })
    .filter((entry): entry is RuntimeTarget => Boolean(entry));
}

function isCanonicalAppId(value: string): boolean {
  return /^[a-z0-9][a-z0-9._-]*$/.test(value);
}

export function isSupportedPackageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function isSha256Hash(value: string): boolean {
  return /^sha256:[a-fA-F0-9]{64}$/.test(value);
}

function normalizeSensitiveKey(value: string): string {
  return value.replace(/[-_\s]/g, "").toLowerCase();
}

function readLicenseState(
  value: unknown,
  path: string,
  issues: CloudBootstrapValidationIssue[],
): CloudBootstrapLicenseState | undefined {
  if (value == null) {
    return undefined;
  }
  const normalized = normalizeOptionalString(value);
  if (
    !normalized ||
    !ALLOWED_LICENSE_STATES.has(normalized as CloudBootstrapLicenseState)
  ) {
    addIssue(issues, {
      code: "FIELD_INVALID",
      path,
      message: "Cloud bootstrap licenseState must be active, trial, expired, revoked, or unknown",
    });
    return undefined;
  }
  return normalized as CloudBootstrapLicenseState;
}

function readRegistrationState(
  value: unknown,
  path: string,
  issues: CloudBootstrapValidationIssue[],
): CloudBootstrapRegistrationState | undefined {
  if (value == null) {
    return undefined;
  }
  const normalized = normalizeOptionalString(value);
  if (
    !normalized ||
    !ALLOWED_REGISTRATION_STATES.has(
      normalized as CloudBootstrapRegistrationState,
    )
  ) {
    addIssue(issues, {
      code: "FIELD_INVALID",
      path,
      message:
        "Cloud bootstrap registrationState must be not_required, required, active, expired, or revoked",
    });
    return undefined;
  }
  return normalized as CloudBootstrapRegistrationState;
}

function collectSensitiveFields(
  value: unknown,
  path: string,
  issues: CloudBootstrapValidationIssue[],
): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      collectSensitiveFields(entry, `${path}[${index}]`, issues);
    });
    return;
  }
  if (!isRecord(value)) {
    return;
  }

  Object.entries(value).forEach(([key, entry]) => {
    const nextPath = `${path}.${key}`;
    if (FORBIDDEN_BOOTSTRAP_KEYS.has(normalizeSensitiveKey(key))) {
      addIssue(issues, {
        code: "SENSITIVE_FIELD_FORBIDDEN",
        path: nextPath,
        message:
          "Cloud bootstrap payload must not include secrets, credentials, tokens, customer data, or local storage data",
      });
    }
    collectSensitiveFields(entry, nextPath, issues);
  });
}

function normalizeCloudBootstrapApp(
  record: Record<string, unknown>,
  path: string,
  issues: CloudBootstrapValidationIssue[],
): CloudBootstrapApp {
  const appId = readRequiredString(record, "appId", path, issues);
  const version = readRequiredString(record, "version", path, issues);
  const enabled = record.enabled;
  const registrationRequired = record.registrationRequired === true;
  const registrationState =
    readRegistrationState(
      record.registrationState,
      `${path}.registrationState`,
      issues,
    ) ?? (registrationRequired ? "required" : "not_required");
  const registrationBlocksPackage =
    registrationRequired && registrationState !== "active";
  const packageUrl = registrationBlocksPackage
    ? normalizeOptionalString(record.packageUrl) ?? ""
    : readRequiredString(record, "packageUrl", path, issues);
  const packageHash = registrationBlocksPackage
    ? normalizeOptionalString(record.packageHash) ?? ""
    : readRequiredString(record, "packageHash", path, issues);
  const manifestHash = registrationBlocksPackage
    ? normalizeOptionalString(record.manifestHash) ?? ""
    : readRequiredString(record, "manifestHash", path, issues);

  if (appId && !isCanonicalAppId(appId)) {
    addIssue(issues, {
      code: "APP_ID_INVALID",
      path: `${path}.appId`,
      message: `Cloud bootstrap appId must be canonical: ${appId}`,
    });
  }
  if (packageUrl && !isSupportedPackageUrl(packageUrl)) {
    addIssue(issues, {
      code: "PACKAGE_URL_UNSUPPORTED",
      path: `${path}.packageUrl`,
      message: "Cloud bootstrap packageUrl must use https",
    });
  }
  if (packageHash && !isSha256Hash(packageHash)) {
    addIssue(issues, {
      code: "HASH_INVALID",
      path: `${path}.packageHash`,
      message: "Cloud bootstrap packageHash must be a full sha256:<64 hex> hash",
    });
  }
  if (manifestHash && !isSha256Hash(manifestHash)) {
    addIssue(issues, {
      code: "HASH_INVALID",
      path: `${path}.manifestHash`,
      message: "Cloud bootstrap manifestHash must be a full sha256:<64 hex> hash",
    });
  }
  if (typeof enabled !== "boolean") {
    addIssue(issues, {
      code: "FIELD_MISSING",
      path: `${path}.enabled`,
      message: "Cloud bootstrap app missing boolean field: enabled",
    });
  }

  const policyDefaults = readPolicyDefaults(
    record.policyDefaults ?? record.tenantPolicyDefaults,
    `${path}.policyDefaults`,
    issues,
  );

  return {
    appId,
    displayName: normalizeOptionalString(record.displayName),
    version,
    runtimeTargets: readRuntimeTargets(
      record.runtimeTargets,
      `${path}.runtimeTargets`,
      issues,
    ),
    icon: normalizeOptionalString(record.icon),
    iconUrl: normalizeOptionalString(record.iconUrl),
    logo: normalizeOptionalString(record.logo),
    logoUrl: normalizeOptionalString(record.logoUrl),
    presentation: isRecord(record.presentation)
      ? record.presentation
      : undefined,
    releaseId: normalizeOptionalString(record.releaseId),
    tenantId: normalizeOptionalString(record.tenantId),
    tenantEnablementRef: normalizeOptionalString(record.tenantEnablementRef),
    channel: normalizeOptionalString(record.channel),
    signatureRef: normalizeOptionalString(record.signatureRef),
    signatureProof: readSignatureProof(
      record.signatureProof,
      `${path}.signatureProof`,
      issues,
    ),
    licenseState: readLicenseState(
      record.licenseState,
      `${path}.licenseState`,
      issues,
    ),
    registrationRequired,
    registrationState,
    registrationHint: normalizeOptionalString(record.registrationHint),
    enabled: enabled === true,
    disabledReason: normalizeOptionalString(record.disabledReason),
    packageUrl,
    packageHash,
    manifestHash,
    capabilityRequirements: readStringRecord(
      record.capabilityRequirements,
      `${path}.capabilityRequirements`,
      issues,
    ),
    defaultEntries: readOptionalStringArray(
      record.defaultEntries,
      `${path}.defaultEntries`,
      issues,
    ),
    policyDefaults,
    toolAvailability: readToolAvailability(
      record.toolAvailability,
      `${path}.toolAvailability`,
      issues,
    ),
  };
}

export function validateCloudBootstrapPayload(
  input: unknown,
): CloudBootstrapValidationResult {
  const issues: CloudBootstrapValidationIssue[] = [];
  let raw: unknown = input;

  if (typeof input === "string") {
    try {
      raw = JSON.parse(input);
    } catch {
      addIssue(issues, {
        code: "PAYLOAD_INVALID",
        path: "$",
        message: "Cloud bootstrap payload string must be valid JSON",
      });
    }
  }

  if (!isRecord(raw)) {
    addIssue(issues, {
      code: "PAYLOAD_INVALID",
      path: "$",
      message: "Cloud bootstrap payload must be an object",
    });
    return {
      status: "invalid",
      blockers: issues,
      warnings: [],
    };
  }

  const appsValue = raw.apps;
  if (!Array.isArray(appsValue)) {
    addIssue(issues, {
      code: "APPS_INVALID",
      path: "$.apps",
      message: "Cloud bootstrap payload must include apps array",
    });
    return {
      status: "invalid",
      blockers: issues,
      warnings: [],
    };
  }

  collectSensitiveFields(raw, "$", issues);
  const apps = appsValue
    .map((entry, index): CloudBootstrapApp | null => {
      const path = `$.apps[${index}]`;
      if (!isRecord(entry)) {
        addIssue(issues, {
          code: "APP_INVALID",
          path,
          message: "Cloud bootstrap app item must be an object",
        });
        return null;
      }
      return normalizeCloudBootstrapApp(entry, path, issues);
    })
    .filter((entry): entry is CloudBootstrapApp => Boolean(entry));
  const blockers = issues.filter((issue) => issue.severity === "blocker");
  const warnings = issues.filter((issue) => issue.severity === "warning");

  return {
    status: blockers.length > 0 ? "invalid" : "valid",
    payload:
      blockers.length > 0
        ? undefined
        : {
            schemaVersion: normalizeOptionalString(raw.schemaVersion),
            tenantId: normalizeOptionalString(raw.tenantId),
            generatedAt:
              normalizeOptionalString(raw.generatedAt) ??
              normalizeOptionalString(raw.fetchedAt),
            fetchedAt: normalizeOptionalString(raw.fetchedAt),
            apps,
          },
    blockers,
    warnings,
  };
}

export function parseCloudBootstrapPayload(input: unknown): CloudBootstrapPayload {
  const result = validateCloudBootstrapPayload(input);
  if (result.status === "invalid" || !result.payload) {
    throw new PluginCloudBootstrapError(
      result.blockers.map((issue) => `${issue.path}: ${issue.message}`).join("; "),
    );
  }
  return result.payload;
}
