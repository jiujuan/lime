/* global process */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { buildAgentAppInstallReview, buildLocalAgentAppSourceState } from "../install/installReview";
import { buildInstalledAppPreview } from "../install/installedAppPreview";
import { normalizeManifest } from "../manifest/normalizeManifest";
import { parseManifest } from "../manifest/parseManifest";
import { checkReadiness } from "../readiness/checkReadiness";
import { p0HostCapabilityProfile } from "../readiness/hostCapabilityProfile";
import { projectApp } from "../projection/projectApp";
import type {
  AppManifest,
  HostCapabilityProfile,
  PackageIdentity,
  ReadinessStatus,
} from "../types";

const STANDARD_ROOT = resolve(
  process.env.LIME_AGENTAPP_STANDARD_ROOT ?? resolve(process.cwd(), "../../limecloud/agentapp"),
);
const REFERENCE_CLI = join(STANDARD_ROOT, "bin/agentapp-ref.mjs");
const STANDARD_CONTENT_FACTORY_APP = join(
  STANDARD_ROOT,
  "docs/examples/content-factory-app",
);
const PUBLIC_SCHEMAS = join(STANDARD_ROOT, "docs/public/schemas");
const LOADED_AT = "2026-05-15T00:00:00.000Z";

const SETUP_KINDS = new Set([
  "skill",
  "knowledge",
  "tool",
  "artifact",
  "eval",
  "service",
  "workflow",
  "secret",
  "overlay",
]);

interface ReferenceProjectionItem {
  key?: string;
  id?: string;
  kind?: string;
  required?: boolean;
}

interface ReferenceProjection {
  ok: boolean;
  command: "project";
  app: {
    name: string;
    description: string;
    version: string;
    status: string;
    appType: string;
    manifestVersion: string;
  };
  capabilityRequirements: {
    capabilities: Record<string, string>;
  };
  entries: ReferenceProjectionItem[];
  storage?: {
    namespace?: string;
    schema?: string;
  };
  services: ReferenceProjectionItem[];
  workflows: ReferenceProjectionItem[];
  knowledgeTemplates: ReferenceProjectionItem[];
  toolRequirements: ReferenceProjectionItem[];
  artifactTypes: ReferenceProjectionItem[];
  evals: ReferenceProjectionItem[];
  events: ReferenceProjectionItem[];
  secrets: ReferenceProjectionItem[];
  overlayTemplates: ReferenceProjectionItem[];
  permissions: ReferenceProjectionItem[];
  lifecycle: Record<string, unknown>;
  provenance: {
    appName: string;
    appVersion: string;
    packageHash: string;
    manifestHash: string;
    standard: "agentapp";
    standardVersion: string;
  };
}

interface ReferenceReadinessCheck {
  severity: "info" | "warning" | "error";
  kind: string;
  key: string;
  required?: boolean;
  message: string;
}

interface ReferenceReadiness {
  ok: boolean;
  status: "ready" | "needs-setup" | "failed";
  command: "readiness";
  app: string;
  checks: ReferenceReadinessCheck[];
}

type PublicJsonSchema = {
  required?: string[];
  properties?: Record<string, unknown>;
};

const describeIfReferenceAvailable =
  existsSync(REFERENCE_CLI) && existsSync(STANDARD_CONTENT_FACTORY_APP)
    ? describe
    : describe.skip;

function runReferenceCli<T>(command: "validate" | "project" | "readiness"): T {
  return JSON.parse(
    execFileSync("node", [REFERENCE_CLI, command, STANDARD_CONTENT_FACTORY_APP], {
      encoding: "utf8",
    }),
  ) as T;
}

function readPublicSchema(name: string): PublicJsonSchema {
  return JSON.parse(readFileSync(join(PUBLIC_SCHEMAS, name), "utf8")) as PublicJsonSchema;
}

function readStandardManifest(): AppManifest {
  const appMarkdown = readFileSync(join(STANDARD_CONTENT_FACTORY_APP, "APP.md"), "utf8");
  const frontmatter = appMarkdown.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatter) {
    throw new Error("Standard content-factory-app APP.md is missing YAML frontmatter.");
  }
  return parseManifest(parseYaml(frontmatter[1]));
}

function buildReferenceAlignedProfile(
  referenceProjection: ReferenceProjection,
): HostCapabilityProfile {
  const capabilities: HostCapabilityProfile["capabilities"] = {
    ...p0HostCapabilityProfile.capabilities,
  };

  Object.keys(referenceProjection.capabilityRequirements.capabilities).forEach(
    (capability) => {
      capabilities[capability] = {
        version: "0.3.0",
        enabled: true,
        implementation: "mock",
      };
    },
  );

  return {
    ...p0HostCapabilityProfile,
    runtimeTargets: ["local", "hybrid"],
    capabilities,
    featureFlags: {
      ...p0HostCapabilityProfile.featureFlags,
      localStorageEnabled: true,
      uiRuntimeEnabled: true,
      workerRuntimeEnabled: true,
    },
  };
}

function buildClientArtifacts(referenceProjection: ReferenceProjection) {
  const manifest = readStandardManifest();
  const normalized = normalizeManifest(manifest);
  const identity: PackageIdentity = {
    sourceKind: "local_folder",
    sourceUri: STANDARD_CONTENT_FACTORY_APP,
    appId: normalized.appId,
    appVersion: normalized.version,
    packageHash: referenceProjection.provenance.packageHash,
    manifestHash: referenceProjection.provenance.manifestHash,
    loadedAt: LOADED_AT,
  };
  const profile = buildReferenceAlignedProfile(referenceProjection);
  const projection = projectApp({ manifest: normalized, identity });
  const readiness = checkReadiness({
    manifest: normalized,
    projection,
    profile,
    checkedAt: LOADED_AT,
  });
  const preview = buildInstalledAppPreview({
    fixture: manifest,
    identity,
    profile,
    loadedAt: LOADED_AT,
    checkedAt: LOADED_AT,
    generatedAt: LOADED_AT,
  });
  const review = buildAgentAppInstallReview({
    preview,
    sourceState: buildLocalAgentAppSourceState(),
    generatedAt: LOADED_AT,
  });

  return { manifest, normalized, identity, projection, readiness, review };
}

function keys(items: ReferenceProjectionItem[]): string[] {
  return items.map((item) => String(item.key ?? item.id)).sort();
}

function setupCheckKey(item: { kind?: string; key?: string; required?: boolean }): string {
  return `${item.kind}:${item.key}:${item.required === true}`;
}

function toReferenceReadinessStatus(status: ReadinessStatus): ReferenceReadiness["status"] {
  if (status === "ready") {
    return "ready";
  }
  if (status === "blocked") {
    return "failed";
  }
  return "needs-setup";
}

describeIfReferenceAvailable("Agent App P17.2.5 standard reference cross-check", () => {
  it("应能运行上游 reference CLI，并读取 public schema 作为字段事实源", () => {
    const validation = runReferenceCli<{
      ok: boolean;
      status: string;
      manifestHash: string;
      findings: unknown[];
    }>("validate");
    const projectionSchema = readPublicSchema("app-projection.schema.json");
    const readinessSchema = readPublicSchema("app-readiness.schema.json");

    expect(validation).toMatchObject({
      ok: true,
      status: "passed",
      findings: [],
    });
    expect(validation.manifestHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(projectionSchema.required).toEqual(
      expect.arrayContaining(["app", "entries", "provenance"]),
    );
    expect(readinessSchema.required).toEqual(
      expect.arrayContaining(["ok", "status", "checks"]),
    );
  });

  it("应把上游 projection schema 字段映射到 Lime projection，缺口必须显式登记", () => {
    const projectionSchema = readPublicSchema("app-projection.schema.json");
    const referenceProjection = runReferenceCli<ReferenceProjection>("project");
    const { projection } = buildClientArtifacts(referenceProjection);
    const limeProjectionFieldMap: Record<string, keyof typeof projection> = {
      app: "app",
      capabilityRequirements: "requiredCapabilities",
      entries: "entries",
      ui: "ui",
      storage: "storage",
      services: "services",
      workflows: "workflows",
      knowledgeTemplates: "knowledgeBindings",
      toolRequirements: "toolRequirements",
      artifactTypes: "artifactTypes",
      evals: "evals",
      events: "events",
      secrets: "secrets",
      overlayTemplates: "overlayTemplates",
      lifecycle: "lifecycle",
      provenance: "provenance",
    };
    const acceptedDivergences: Record<string, string> = {
      ok: "reference CLI envelope field; Lime projection is not a CLI response.",
      command: "reference CLI envelope field; Lime projection is not a CLI response.",
      permissions:
        "P17.2 exposes permissions through install review permissionCount; full permission projection is deferred to P17.3/P18.",
    };
    const schemaFields = Object.keys(projectionSchema.properties ?? {});
    const unmappedFields = schemaFields.filter(
      (field) => !limeProjectionFieldMap[field] && !acceptedDivergences[field],
    );

    expect(unmappedFields).toEqual([]);
    expect(projection.app).toMatchObject({
      appId: referenceProjection.app.name,
      version: referenceProjection.app.version,
      status: referenceProjection.app.status,
      appType: referenceProjection.app.appType,
      description: referenceProjection.app.description,
    });
    expect(projection.provenance).toMatchObject({
      appId: referenceProjection.provenance.appName,
      appVersion: referenceProjection.provenance.appVersion,
      packageHash: referenceProjection.provenance.packageHash,
      manifestHash: referenceProjection.provenance.manifestHash,
    });
    expect(projection.entries.map((entry) => entry.key).sort()).toEqual(
      keys(referenceProjection.entries),
    );
    expect(projection.requiredCapabilities.map((item) => item.capability).sort()).toEqual(
      Object.keys(referenceProjection.capabilityRequirements.capabilities).sort(),
    );
    expect(projection.knowledgeBindings.map((item) => item.key).sort()).toEqual(
      keys(referenceProjection.knowledgeTemplates),
    );
    expect(projection.toolRequirements.map((item) => item.key).sort()).toEqual(
      keys(referenceProjection.toolRequirements),
    );
    expect(projection.artifactTypes.map((item) => item.key).sort()).toEqual(
      keys(referenceProjection.artifactTypes),
    );
    expect(projection.evals.map((item) => item.key).sort()).toEqual(
      keys(referenceProjection.evals),
    );
    expect(projection.services.map((item) => item.key).sort()).toEqual(
      keys(referenceProjection.services),
    );
    expect(projection.workflows.map((item) => item.key).sort()).toEqual(
      keys(referenceProjection.workflows),
    );
    expect(projection.secrets.map((item) => item.key).sort()).toEqual(
      keys(referenceProjection.secrets),
    );
    expect(projection.overlayTemplates.map((item) => item.key).sort()).toEqual(
      keys(referenceProjection.overlayTemplates),
    );
    expect(projection.storage?.namespace).toBe(referenceProjection.storage?.namespace);
  });

  it("应把 reference readiness checks 映射到 Lime readiness 和 install review descriptor", () => {
    const referenceProjection = runReferenceCli<ReferenceProjection>("project");
    const referenceReadiness = runReferenceCli<ReferenceReadiness>("readiness");
    const { readiness, review } = buildClientArtifacts(referenceProjection);
    const referenceSetupChecks = referenceReadiness.checks
      .filter((check) => SETUP_KINDS.has(check.kind))
      .map(setupCheckKey)
      .sort();
    const limeSetupChecks = readiness.warnings
      .filter((issue) => issue.kind && SETUP_KINDS.has(issue.kind))
      .map(setupCheckKey)
      .sort();

    expect(toReferenceReadinessStatus(readiness.status)).toBe(referenceReadiness.status);
    expect(limeSetupChecks).toEqual(referenceSetupChecks);
    expect(readiness.supportedCapabilities.map((item) => item.capability).sort()).toEqual(
      referenceReadiness.checks
        .filter((check) => check.kind === "capability")
        .map((check) => check.key)
        .sort(),
    );
    expect(review).toMatchObject({
      appId: referenceProjection.app.name,
      version: referenceProjection.app.version,
      manifestVersion: "0.3",
      packageHash: referenceProjection.provenance.packageHash,
      manifestHash: referenceProjection.provenance.manifestHash,
      entryCount: referenceProjection.entries.length,
      permissionCount: referenceProjection.permissions.length,
      storageNamespace: referenceProjection.storage?.namespace,
      readinessStatus: readiness.status,
    });
    expect(review.requiredCapabilityKeys.sort()).toEqual(
      Object.keys(referenceProjection.capabilityRequirements.capabilities).sort(),
    );
  });
});
