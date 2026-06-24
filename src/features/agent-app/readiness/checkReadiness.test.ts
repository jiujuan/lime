import { describe, expect, it } from "vitest";
import contentFactoryFixture from "../fixtures/content-factory-app.json";
import { buildPackageIdentity } from "../install/packageIdentity";
import { normalizeManifest } from "../manifest/normalizeManifest";
import { parseManifest } from "../manifest/parseManifest";
import { projectApp } from "../projection/projectApp";
import type { AgentAppSetupState, HostCapabilityProfile } from "../types";
import { checkReadiness } from "./checkReadiness";
import {
  currentAgentAppHostRuntimeVersion,
  p0HostCapabilityProfile,
} from "./hostCapabilityProfile";

function buildProjection() {
  const manifest = parseManifest(contentFactoryFixture);
  const normalized = normalizeManifest(manifest);
  const identity = buildPackageIdentity({ manifest });
  return {
    manifest: normalized,
    projection: projectApp({ manifest: normalized, identity }),
  };
}

const resolvedSetup: AgentAppSetupState = {
  knowledgeBindings: {},
  skills: {},
  tools: {},
  artifactTypes: {
    content_factory_workspace_patch: true,
  },
  evals: {},
  secrets: {},
  overlays: {},
  services: {},
  workflows: {},
};

describe("Agent App readiness P0", () => {
  it("默认 P0 host 应把 fixture 标记为 blocked 并解释缺失能力", () => {
    const { manifest, projection } = buildProjection();
    const readiness = checkReadiness({
      manifest,
      projection,
      checkedAt: "2026-05-15T00:00:00.000Z",
    });

    expect(readiness.status).toBe("blocked");
    expect(readiness.blockers.map((issue) => issue.code)).toContain("CAPABILITY_MISSING");
    expect(readiness.warnings.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "ARTIFACT_TYPE_REQUIRED",
      ]),
    );
    expect(readiness.warnings.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "STORAGE_DECLARED_BUT_DISABLED",
        "WORKER_RUNTIME_DISABLED",
      ]),
    );
    expect(
      readiness.warnings.find((issue) => issue.code === "ARTIFACT_TYPE_REQUIRED"),
    ).toHaveProperty("remediation");
    expect(readiness.installModes).toEqual([
      expect.objectContaining({
        mode: "in_lime",
        status: "ready",
        evidencePolicy: "required",
      }),
    ]);
  });

  it("能力启用后仍应进入 degraded 而不是假装 ready", () => {
    const { manifest, projection } = buildProjection();
    const profile: HostCapabilityProfile = {
      ...p0HostCapabilityProfile,
      capabilities: Object.fromEntries(
        Object.entries(p0HostCapabilityProfile.capabilities).map(([key, value]) => [
          key,
          { ...value, enabled: true, implementation: "mock" as const },
        ]),
      ),
    };
    const readiness = checkReadiness({ manifest, projection, profile });

    expect(readiness.status).toBe("degraded");
    expect(readiness.warnings.map((issue) => issue.code)).toContain(
      "ARTIFACT_TYPE_REQUIRED",
    );
    expect(readiness.missingCapabilities).toHaveLength(0);
  });

  it("setup resolver 全部满足后应回到 runtime degraded 状态", () => {
    const { manifest, projection } = buildProjection();
    const profile: HostCapabilityProfile = {
      ...p0HostCapabilityProfile,
      capabilities: Object.fromEntries(
        Object.entries(p0HostCapabilityProfile.capabilities).map(([key, value]) => [
          key,
          { ...value, enabled: true, implementation: "mock" as const },
        ]),
      ),
    };
    const readiness = checkReadiness({
      manifest,
      projection,
      profile,
      setup: resolvedSetup,
    });

    expect(readiness.status).toBe("degraded");
    expect(readiness.warnings.map((issue) => issue.code)).not.toContain(
      "KNOWLEDGE_BINDING_REQUIRED",
    );
    expect(readiness.blockers).toHaveLength(0);
  });

  it("应接受 v0.7 manifest 作为当前 Host 标准，不再按运行时版本阻断", () => {
    const rawManifest = parseManifest({
      manifestVersion: "0.7.0",
      name: "content-factory-app",
      version: "0.7.0",
      requires: {
        sdk: "@lime/app-sdk@^0.7.0",
        capabilities: ["lime.capabilities"],
      },
      entries: [{ key: "dashboard", kind: "page" }],
      requirements: {
        requirements: [{ id: "CF-R001", text: "生成内容草稿" }],
      },
      boundary: {
        boundaries: [
          {
            requirementId: "CF-R001",
            planes: { host: { requires: ["lime.agent"] } },
          },
        ],
      },
    });
    const manifest = normalizeManifest(rawManifest);
    const identity = buildPackageIdentity({ manifest: rawManifest });
    const projection = projectApp({ manifest, identity });
    const readiness = checkReadiness({ manifest, projection });

    expect(manifest.manifestVersion).toBe("0.7");
    expect(readiness.blockers.map((issue) => issue.code)).not.toContain(
      "MANIFEST_VERSION_UNSUPPORTED",
    );
  });

  it("应接受 v0.8 install modes，并把 web_host 保留为 blocked", () => {
    const rawManifest = parseManifest({
      manifestVersion: "0.8.0",
      name: "content-factory-app",
      version: "0.8.0",
      requires: {
        sdk: "@lime/app-sdk@^0.8.0",
        capabilities: ["lime.agent"],
      },
      entries: [{ key: "dashboard", kind: "page" }],
      install: {
        modes: ["standalone", "runtime_backed", "web_host"],
        runtime: { minVersion: "0.8.0" },
        standalone: { shell: "lime-app-shell" },
        runtimeBacked: { requires: "lime-runtime", minVersion: "0.8.0" },
      },
    });
    const manifest = normalizeManifest(rawManifest);
    const identity = buildPackageIdentity({ manifest: rawManifest });
    const projection = projectApp({ manifest, identity });
    const readiness = checkReadiness({ manifest, projection });

    expect(readiness.installModes).toEqual([
      expect.objectContaining({ mode: "standalone", status: "ready" }),
      expect.objectContaining({ mode: "runtime_backed", status: "ready" }),
      expect.objectContaining({
        mode: "web_host",
        status: "blocked",
        blockers: [
          expect.objectContaining({ code: "INSTALL_MODE_UNSUPPORTED" }),
        ],
      }),
    ]);
    expect(readiness.blockers.map((issue) => issue.code)).not.toContain(
      "INSTALL_MODE_UNSUPPORTED",
    );
  });

  it("应接受 v0.11 manifest 和 install runtime 作为当前 Host 标准", () => {
    const rawManifest = parseManifest({
      manifestVersion: "0.11.0",
      name: "content-factory-app",
      version: "0.11.0",
      requires: {
        sdk: "@lime/app-sdk@^0.11.0",
        capabilities: ["lime.agent", "lime.connectors", "lime.terminal"],
      },
      entries: [{ key: "dashboard", kind: "page" }],
      install: {
        modes: ["in_lime", "standalone", "runtime_backed"],
        runtime: { minVersion: currentAgentAppHostRuntimeVersion },
        standalone: { shell: "lime-app-shell" },
        runtimeBacked: {
          requires: "lime-runtime",
          minVersion: currentAgentAppHostRuntimeVersion,
        },
      },
    });
    const manifest = normalizeManifest(rawManifest);
    const identity = buildPackageIdentity({ manifest: rawManifest });
    const projection = projectApp({ manifest, identity });
    const readiness = checkReadiness({ manifest, projection });

    expect(manifest.manifestVersion).toBe("0.11");
    expect(readiness.blockers.map((issue) => issue.code)).not.toEqual(
      expect.arrayContaining([
        "MANIFEST_VERSION_UNSUPPORTED",
        "RUNTIME_VERSION_UNSUPPORTED",
      ]),
    );
  });

  it("preferred install mode 不满足 runtime 版本时应阻断 readiness", () => {
    const rawManifest = parseManifest({
      manifestVersion: "0.8.0",
      name: "future-standalone-app",
      version: "0.8.0",
      entries: [{ key: "dashboard", kind: "page" }],
      install: {
        modes: ["standalone"],
        runtime: { minVersion: "9.0.0" },
        standalone: { shell: "lime-app-shell" },
      },
    });
    const manifest = normalizeManifest(rawManifest);
    const identity = buildPackageIdentity({ manifest: rawManifest });
    const projection = projectApp({ manifest, identity });
    const readiness = checkReadiness({ manifest, projection });

    expect(readiness.status).toBe("blocked");
    expect(readiness.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "RUNTIME_VERSION_UNSUPPORTED",
          key: "standalone",
        }),
      ]),
    );
  });

  it("package verification mismatch 应产生 blocker，不能只作为 warning 继续启用", () => {
    const { manifest, projection } = buildProjection();
    const profile: HostCapabilityProfile = {
      ...p0HostCapabilityProfile,
      capabilities: Object.fromEntries(
        Object.entries(p0HostCapabilityProfile.capabilities).map(([key, value]) => [
          key,
          { ...value, enabled: true, implementation: "mock" as const },
        ]),
      ),
    };
    const readiness = checkReadiness({
      manifest,
      projection,
      profile,
      setup: resolvedSetup,
      packageVerification: {
        status: "package_hash_mismatch",
        expectedPackageHash: projection.package.packageHash,
        actualPackageHash: "package-fnv1a-badbad00",
        expectedManifestHash: projection.package.manifestHash,
        actualManifestHash: projection.package.manifestHash,
        message: "Agent App package hash does not match package identity.",
      },
    });

    expect(readiness.status).toBe("blocked");
    expect(readiness.blockers).toEqual([
      expect.objectContaining({
        code: "PACKAGE_HASH_MISMATCH",
        severity: "blocker",
      }),
    ]);
  });
});
