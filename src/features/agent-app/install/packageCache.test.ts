import { describe, expect, it } from "vitest";
import contentFactoryFixture from "../fixtures/content-factory-app.json";
import { buildPackageIdentity } from "./packageIdentity";
import {
  buildAgentAppPackageCacheEntry,
  InMemoryAgentAppPackageCacheRepository,
  verifyAgentAppPackageCacheEntry,
} from "./packageCache";

const now = "2026-05-15T00:00:00.000Z";

function buildIdentity(manifest: unknown = contentFactoryFixture) {
  return buildPackageIdentity({
    manifest: manifest as never,
    loadedAt: now,
  });
}

function buildManifestVersion(version: string) {
  return {
    ...contentFactoryFixture,
    version,
  };
}

describe("Agent App package cache P12", () => {
  it("应缓存并恢复已验证 package entry，支撑断网 fallback", () => {
    const identity = buildIdentity();
    const entry = buildAgentAppPackageCacheEntry({
      identity,
      manifestSnapshot: contentFactoryFixture,
      cachedAt: now,
    });
    const repository = new InMemoryAgentAppPackageCacheRepository();

    const save = repository.saveVerified(entry);
    expect(save.status).toBe("cached");
    expect(save.verification.status).toBe("verified");

    const cached = repository.resolve(identity);
    expect(cached).toMatchObject({
      status: "cache_hit",
      verification: {
        status: "verified",
      },
    });
    expect(cached.entry?.cachePath).toContain(identity.packageHash);
  });

  it("hash mismatch 应阻断新 package 且不覆盖旧可用 package", () => {
    const identity = buildIdentity();
    const repository = new InMemoryAgentAppPackageCacheRepository();
    const entry = buildAgentAppPackageCacheEntry({
      identity,
      manifestSnapshot: contentFactoryFixture,
      cachedAt: now,
    });
    repository.saveVerified(entry);

    const badEntry = buildAgentAppPackageCacheEntry({
      identity,
      manifestSnapshot: contentFactoryFixture,
      actualPackageHash: "package-fnv1a-badbad00",
      cachedAt: "2026-05-15T00:01:00.000Z",
    });
    const staged = repository.stageUpgrade(badEntry);

    expect(staged.status).toBe("blocked");
    expect(staged.verification.status).toBe("package_hash_mismatch");
    expect(repository.resolve(identity).entry?.packageHash).toBe(identity.packageHash);
  });

  it("upgrade staging 不覆盖旧 package，commit 后可 rollback", () => {
    const oldIdentity = buildIdentity();
    const newManifest = buildManifestVersion("0.3.1");
    const newIdentity = buildIdentity(newManifest);
    const repository = new InMemoryAgentAppPackageCacheRepository();
    const oldEntry = buildAgentAppPackageCacheEntry({
      identity: oldIdentity,
      manifestSnapshot: contentFactoryFixture,
      cachedAt: now,
    });
    const newEntry = buildAgentAppPackageCacheEntry({
      identity: newIdentity,
      manifestSnapshot: newManifest,
      cachedAt: "2026-05-15T00:02:00.000Z",
    });
    repository.saveVerified(oldEntry);

    const staged = repository.stageUpgrade(newEntry);
    expect(staged.status).toBe("staged");
    expect(repository.resolve(oldIdentity).entry?.identity.appVersion).toBe("0.3.0");

    const committed = repository.commitStaged("content-factory-app");
    expect(committed).toMatchObject({
      status: "committed",
      activeEntry: {
        identity: {
          appVersion: "0.3.1",
        },
      },
      previousEntry: {
        identity: {
          appVersion: "0.3.0",
        },
      },
    });

    const rolledBack = repository.rollback("content-factory-app");
    expect(rolledBack).toMatchObject({
      status: "rolled_back",
      activeEntry: {
        identity: {
          appVersion: "0.3.0",
        },
      },
      evidence: {
        sourceKind: "agent_app",
        appId: "content-factory-app",
        packageHash: oldIdentity.packageHash,
      },
    });
  });

  it("缺失 cache entry 应生成 missing verification result", () => {
    const identity = buildIdentity();

    expect(verifyAgentAppPackageCacheEntry(undefined, identity)).toMatchObject({
      status: "missing",
      expectedPackageHash: identity.packageHash,
    });
  });
});
