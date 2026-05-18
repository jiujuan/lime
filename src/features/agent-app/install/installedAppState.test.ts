import { describe, expect, it } from "vitest";
import contentFactoryFixture from "../fixtures/content-factory-app.json";
import { buildInstalledAppPreview } from "./installedAppPreview";
import {
  BrowserLocalStorageAgentAppPersistenceDriver,
  buildInstalledAgentAppState,
  InMemoryAgentAppPersistenceDriver,
  InMemoryInstalledAgentAppStateStore,
  LocalInstalledAgentAppStateRepository,
} from "./installedAppState";
import { buildSetupStateFromBindings } from "./setupStateStore";

const now = "2026-05-15T00:00:00.000Z";

function buildPreviewWithSetup() {
  const setup = buildSetupStateFromBindings(
    [
      {
        appId: "content-factory-app",
        kind: "knowledge",
        key: "project_knowledge",
        resolved: true,
        ref: "knowledge:project",
        updatedAt: now,
      },
    ],
    "content-factory-app",
  );
  const preview = buildInstalledAppPreview({
    fixture: contentFactoryFixture,
    setup,
    loadedAt: now,
    checkedAt: now,
    generatedAt: now,
  });
  return { preview, setup };
}

describe("InstalledAgentAppState P10", () => {
  it("应从 preview 构造可恢复 installed state snapshot", () => {
    const { preview, setup } = buildPreviewWithSetup();
    const state = buildInstalledAgentAppState({
      preview,
      setup,
      installedAt: now,
      updatedAt: now,
    });

    expect(state).toMatchObject({
      appId: "content-factory-app",
      disabled: false,
      identity: {
        appId: "content-factory-app",
        appVersion: "0.3.0",
      },
      installMode: "in_lime",
      runtimeProfileSummary: {
        installMode: "in_lime",
        shellKind: "desktop",
        runtimeVersion: "0.8.0",
      },
      setup: {
        knowledgeBindings: {
          project_knowledge: true,
        },
      },
      projection: {
        app: {
          appId: "content-factory-app",
        },
      },
    });
    expect(JSON.stringify(state)).not.toContain("secret-value");
  });

  it("应持久化用户选择的 install mode 和 runtime profile 摘要", () => {
    const setup = buildSetupStateFromBindings([], "content-factory-app");
    const preview = buildInstalledAppPreview({
      fixture: {
        ...contentFactoryFixture,
        manifestVersion: "0.8.0",
        version: "0.8.0",
        install: {
          modes: ["in_lime", "standalone", "runtime_backed"],
          runtime: { minVersion: "0.8.0" },
          standalone: { shell: "lime-app-shell" },
        },
      },
      setup,
      checkedAt: now,
      loadedAt: now,
      generatedAt: now,
    });
    const state = buildInstalledAgentAppState({
      preview,
      setup,
      installMode: "standalone",
      installedAt: now,
      updatedAt: now,
    });

    expect(state).toMatchObject({
      installMode: "standalone",
      runtimeProfileSummary: {
        installMode: "standalone",
        shellKind: "app_shell",
        runtimeVersion: "0.8.0",
        checkedAt: now,
      },
    });
  });

  it("store 应支持 upsert、get、list、disable 和 remove", () => {
    const { preview, setup } = buildPreviewWithSetup();
    const store = new InMemoryInstalledAgentAppStateStore();
    const state = buildInstalledAgentAppState({ preview, setup, installedAt: now, updatedAt: now });

    store.upsert(state);
    expect(store.get("content-factory-app")?.identity.packageHash).toBe(
      state.identity.packageHash,
    );
    expect(store.list()).toHaveLength(1);
    expect(
      store.setDisabled(
        "content-factory-app",
        true,
        "2026-05-15T00:01:00.000Z",
      ),
    ).toMatchObject({
      disabled: true,
      updatedAt: "2026-05-15T00:01:00.000Z",
    });
    expect(store.remove("content-factory-app")).toBe(true);
    expect(store.list()).toHaveLength(0);
  });

  it("cleanup plan 应包含 installed state snapshot 路径", () => {
    const { preview } = buildPreviewWithSetup();

    expect(preview.cleanupPlan.installedStatePaths[0]?.value).toBe(
      "<LimeAppData>/agent-apps/installed/content-factory-app.json",
    );
  });
});

describe("InstalledAgentAppState P11 local persistence", () => {
  it("应把 installed state 与 setup state 写入本地 persistence driver 并可恢复", async () => {
    const { preview, setup } = buildPreviewWithSetup();
    const state = buildInstalledAgentAppState({ preview, setup, installedAt: now, updatedAt: now });
    const driver = new InMemoryAgentAppPersistenceDriver();
    const repository = new LocalInstalledAgentAppStateRepository({ driver });

    await repository.save(state, now);

    const snapshot = driver.snapshot();
    expect(snapshot["<LimeAppData>/agent-apps/installed/content-factory-app.json"]).toContain(
      '"schemaVersion": 1',
    );
    expect(snapshot["<LimeAppData>/agent-apps/setup/content-factory-app.json"]).toContain(
      '"project_knowledge": true',
    );
    expect(JSON.stringify(snapshot)).not.toContain("secret-value");

    const restored = await repository.get("content-factory-app");
    expect(restored.issues).toHaveLength(0);
    expect(restored.state).toMatchObject({
      appId: "content-factory-app",
      identity: {
        packageHash: state.identity.packageHash,
      },
      setup: {
        knowledgeBindings: {
          project_knowledge: true,
        },
      },
    });

    const list = await repository.list();
    expect(list.issues).toHaveLength(0);
    expect(list.states.map((item) => item.appId)).toEqual(["content-factory-app"]);
  });

  it("应支持 disable 更新和 delete-data 删除 installed/setup 状态文件", async () => {
    const { preview, setup } = buildPreviewWithSetup();
    const state = buildInstalledAgentAppState({ preview, setup, installedAt: now, updatedAt: now });
    const driver = new InMemoryAgentAppPersistenceDriver();
    const repository = new LocalInstalledAgentAppStateRepository({ driver });

    await repository.save(state, now);
    const disabled = await repository.setDisabled(
      "content-factory-app",
      true,
      "2026-05-15T00:02:00.000Z",
    );

    expect(disabled.issues).toHaveLength(0);
    expect(disabled.state).toMatchObject({
      disabled: true,
      updatedAt: "2026-05-15T00:02:00.000Z",
    });
    expect(await repository.remove("content-factory-app")).toBe(true);
    expect(await repository.get("content-factory-app")).toEqual({ issues: [] });
    expect(driver.snapshot()).toEqual({});
  });

  it("应提供浏览器本地存储 driver 作为 Lab persistence 适配层", async () => {
    window.localStorage.clear();
    const { preview, setup } = buildPreviewWithSetup();
    const state = buildInstalledAgentAppState({ preview, setup, installedAt: now, updatedAt: now });
    const repository = new LocalInstalledAgentAppStateRepository({
      driver: new BrowserLocalStorageAgentAppPersistenceDriver({
        keyPrefix: "test.agent-app.persistence:",
      }),
    });

    await repository.save(state, now);
    expect(
      window.localStorage.getItem(
        "test.agent-app.persistence:<LimeAppData>/agent-apps/installed/content-factory-app.json",
      ),
    ).toContain('"appId": "content-factory-app"');

    const restored = await repository.get("content-factory-app");
    expect(restored.issues).toHaveLength(0);
    expect(restored.state?.appId).toBe("content-factory-app");

    await repository.remove("content-factory-app");
    expect(window.localStorage.length).toBe(0);
  });

  it("应隔离坏文件并返回 load issue，而不是恢复为可运行状态", async () => {
    const driver = new InMemoryAgentAppPersistenceDriver();
    const repository = new LocalInstalledAgentAppStateRepository({ driver });

    await driver.writeText("<LimeAppData>/agent-apps/installed/broken.json", "{bad-json");

    const list = await repository.list();
    expect(list.states).toHaveLength(0);
    expect(list.issues).toEqual([
      expect.objectContaining({
        code: "PARSE_FAILED",
        path: "<LimeAppData>/agent-apps/installed/broken.json",
      }),
    ]);
  });

  it("应在恢复时执行 projection/readiness schema gate", async () => {
    const { preview, setup } = buildPreviewWithSetup();
    const state = buildInstalledAgentAppState({ preview, setup, installedAt: now, updatedAt: now });
    const driver = new InMemoryAgentAppPersistenceDriver();
    const repository = new LocalInstalledAgentAppStateRepository({ driver });
    const invalidState = structuredClone(state);
    invalidState.projection.entries = undefined as never;

    await driver.writeText(
      "<LimeAppData>/agent-apps/installed/content-factory-app.json",
      `${JSON.stringify(
        {
          schemaVersion: 1,
          savedAt: now,
          state: invalidState,
        },
        null,
        2,
      )}\n`,
    );

    const restored = await repository.get("content-factory-app");
    expect(restored.state).toBeUndefined();
    expect(restored.issues).toEqual([
      expect.objectContaining({
        code: "SCHEMA_GATE_FAILED",
        appId: "content-factory-app",
      }),
    ]);
  });
});
