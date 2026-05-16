import { describe, expect, it } from "vitest";
import contentFactoryFixture from "../fixtures/content-factory-app.json";
import { normalizeManifest } from "./normalizeManifest";
import {
  AgentAppManifestError,
  mergeLayeredManifest,
  parseManifest,
} from "./parseManifest";

describe("Agent App manifest P0", () => {
  it("应解析并归一化 内容工厂 v0.3 fixture", () => {
    const manifest = parseManifest(contentFactoryFixture);
    const normalized = normalizeManifest(manifest);

    expect(normalized).toMatchObject({
      manifestVersion: "0.3",
      appId: "content-factory-app",
      displayName: "内容工厂",
      version: "0.3.0",
      runtimeTargets: ["local"],
      storage: {
        namespace: "content-factory-app",
      },
    });
    expect(normalized.entries.map((entry) => entry.kind)).toEqual([
      "page",
      "page",
      "workflow",
      "page",
      "expert-chat",
    ]);
    expect(normalized.entries.map((entry) => entry.key)).toEqual([
      "dashboard",
      "knowledge",
      "content_scenario_planning",
      "content_factory",
      "content_strategist",
    ]);
    expect(normalized.services.map((service) => service.key)).toEqual([
      "content_worker",
    ]);
    expect(normalized.workflows.map((workflow) => workflow.key)).toEqual([
      "content_scenario_planning",
    ]);
    expect(normalized.toolRefs.map((tool) => tool.key)).toEqual([
      "document_parser",
      "competitor_research",
      "creative_capability_search",
    ]);
    expect(
      normalized.toolRefs.find(
        (tool) => tool.key === "creative_capability_search",
      )?.capabilities,
    ).toEqual([
      "lime.capability.image.generate",
      "lime.capability.cover.generate",
      "lime.capability.research.search",
      "lime.capability.report.generate",
      "lime.capability.pdf.read",
      "lime.capability.summary.generate",
    ]);
    expect(normalized.evals.map((evalRule) => evalRule.key)).toEqual([
      "fact_grounding",
      "publish_readiness",
    ]);
    expect(normalized.secrets.map((secret) => secret.key)).toEqual([
      "publishing_workspace_token",
    ]);
    expect(normalized.overlayTemplates.map((overlay) => overlay.key)).toEqual([
      "workspace_content_rules",
    ]);
  });

  it("缺少 entries 时应拒绝 manifest", () => {
    expect(() =>
      parseManifest({
        manifestVersion: "0.3.0",
        name: "empty-app",
        version: "0.3.0",
        entries: [],
      }),
    ).toThrow(AgentAppManifestError);
  });

  it("应为可选字段填充 P0 默认值", () => {
    const normalized = normalizeManifest(
      parseManifest({
        manifestVersion: "0.3.0",
        name: "Simple App",
        version: "0.3.0",
        entries: [{ key: "home", kind: "page" }],
      }),
    );

    expect(normalized).toMatchObject({
      appId: "simple-app",
      status: "draft",
      appType: "domain-app",
      runtimeTargets: ["local"],
    });
    expect(normalized.entries[0]).toMatchObject({
      key: "home",
      title: "home",
      enabledByDefault: true,
    });
  });

  it("应把 v0.6 capability list 归一化为稳定 capability range", () => {
    const normalized = normalizeManifest(
      parseManifest({
        manifestVersion: "0.6.0",
        name: "Content Factory App",
        version: "0.6.0",
        requires: {
          sdk: "@lime/app-sdk@^0.6.0",
          capabilities: ["lime.agent", "lime.skills", "lime.usage"],
        },
        entries: [{ key: "home", kind: "page" }],
      }),
    );

    expect(normalized.manifestVersion).toBe("0.6");
    expect(normalized.requires.sdk).toBe("@lime/app-sdk@^0.6.0");
    expect(normalized.requires.capabilities).toMatchObject({
      "lime.agent": "*",
      "lime.skills": "*",
      "lime.usage": "*",
    });
  });

  it("应按 v0.5 分层 manifest 文件合并发现面和治理配置", () => {
    const manifest = mergeLayeredManifest(
      {
        manifestVersion: "0.5.0",
        name: "content-factory-app",
        version: "0.5.0",
        entries: [{ key: "dashboard", kind: "page", title: "首页" }],
        permissions: [{ key: "read_selected_files", reason: "读取文件" }],
      },
      [
        {
          entries: [
            {
              key: "dashboard",
              kind: "page",
              title: "内容工厂首页",
              route: "/dashboard",
            },
            { key: "settings", kind: "settings", title: "设置" },
          ],
        },
        {
          permissions: [
            {
              key: "read_selected_files",
              scope: "filesystem",
              required: true,
            },
            { key: "invoke_agent_tasks", scope: "agent", required: true },
          ],
        },
        {
          capabilities: {
            "lime.ui": {
              routes: [{ path: "/dashboard" }],
            },
          },
          errors: {
            model_setup_required: {
              severity: "setup",
            },
          },
          i18n: {
            defaultLocale: "zh-CN",
          },
          signature: {
            mode: "development",
          },
          readiness: {
            checks: [{ key: "manifest_layers", required: true }],
          },
          health: {
            probes: [{ key: "ui_entry", path: "/dashboard" }],
          },
        },
      ],
    );
    const normalized = normalizeManifest(manifest);

    expect(normalized.manifestVersion).toBe("0.5");
    expect(manifest.entries).toEqual([
      {
        key: "dashboard",
        kind: "page",
        title: "内容工厂首页",
        route: "/dashboard",
      },
      { key: "settings", kind: "settings", title: "设置" },
    ]);
    expect(manifest.permissions).toEqual([
      {
        key: "read_selected_files",
        reason: "读取文件",
        scope: "filesystem",
        required: true,
      },
      { key: "invoke_agent_tasks", scope: "agent", required: true },
    ]);
    expect(
      (manifest as unknown as Record<string, unknown>).capabilityConfig,
    ).toEqual({
      "lime.ui": {
        routes: [{ path: "/dashboard" }],
      },
    });
    expect((manifest as unknown as Record<string, unknown>).errors).toEqual({
      model_setup_required: {
        severity: "setup",
      },
    });
    expect((manifest as unknown as Record<string, unknown>).i18n).toEqual({
      defaultLocale: "zh-CN",
    });
    expect((manifest as unknown as Record<string, unknown>).signature).toEqual({
      mode: "development",
    });
    expect((manifest as unknown as Record<string, unknown>).readiness).toEqual({
      checks: [{ key: "manifest_layers", required: true }],
    });
    expect((manifest as unknown as Record<string, unknown>).health).toEqual({
      probes: [{ key: "ui_entry", path: "/dashboard" }],
    });
    expect(
      (manifest as unknown as Record<string, unknown>).agentRuntime,
    ).toBeUndefined();
  });

  it("应按 v0.6 分层 manifest 文件合并入口、权限和运行合同", () => {
    const manifest = mergeLayeredManifest(
      {
        manifestVersion: "0.6.0",
        name: "content-factory-app",
        version: "0.6.0",
        entries: [{ key: "dashboard", kind: "page", title: "首页" }],
        permissions: [{ key: "read_selected_files", reason: "读取文件" }],
      },
      [
        {
          entries: [
            {
              key: "dashboard",
              kind: "page",
              title: "内容工厂首页",
              route: "/dashboard",
            },
            { key: "settings", kind: "settings", title: "设置" },
          ],
        },
        {
          permissions: [
            {
              key: "read_selected_files",
              scope: "filesystem",
              required: true,
            },
            { key: "invoke_agent_tasks", scope: "agent", required: true },
          ],
        },
        {
          capabilities: {
            "lime.ui": {
              routes: [{ path: "/dashboard" }],
            },
          },
          i18n: {
            defaultLocale: "zh-CN",
          },
          agentRuntime: {
            agentTask: {
              eventSchema: "lime.agent-task-event.v1",
            },
          },
        },
      ],
    );

    expect(manifest.entries).toEqual([
      {
        key: "dashboard",
        kind: "page",
        title: "内容工厂首页",
        route: "/dashboard",
      },
      { key: "settings", kind: "settings", title: "设置" },
    ]);
    expect(manifest.permissions).toEqual([
      {
        key: "read_selected_files",
        reason: "读取文件",
        scope: "filesystem",
        required: true,
      },
      { key: "invoke_agent_tasks", scope: "agent", required: true },
    ]);
    expect(
      (manifest as unknown as Record<string, unknown>).capabilityConfig,
    ).toEqual({
      "lime.ui": {
        routes: [{ path: "/dashboard" }],
      },
    });
    expect((manifest as unknown as Record<string, unknown>).i18n).toEqual({
      defaultLocale: "zh-CN",
    });
    expect(
      (manifest as unknown as Record<string, unknown>).agentRuntime,
    ).toEqual({
      agentTask: {
        eventSchema: "lime.agent-task-event.v1",
      },
    });
  });

  it("应按 v0.7 分层 manifest 文件合并需求边界和能力交接", () => {
    const manifest = mergeLayeredManifest(
      {
        manifestVersion: "0.7.0",
        name: "content-factory-app",
        version: "0.7.0",
        entries: [{ key: "dashboard", kind: "page", title: "首页" }],
      },
      [
        {
          requirements: {
            requirements: [
              {
                id: "CF-R001",
                text: "生成可审核内容草稿",
                priority: "mvp",
              },
            ],
            nonGoals: ["直接保存外部系统明文凭证"],
          },
        },
        {
          boundaries: [
            {
              requirementId: "CF-R001",
              planes: {
                app: { owns: ["workflow_state"] },
                host: { requires: ["lime.agent", "lime.evidence"] },
                human: { owns: ["publish_decision"] },
              },
            },
          ],
        },
        {
          integrations: [
            {
              key: "planning_table",
              provider: "cloud.table",
              executionPlane: "hybrid",
              hostCapability: "lime.connectors",
            },
          ],
        },
        {
          operations: [
            {
              key: "write_external_draft",
              type: "external_write",
              sideEffect: "external_write",
              approvalRequired: true,
              dryRunRequired: true,
              evidenceRequired: true,
              autoExecute: false,
            },
          ],
        },
      ],
    );
    const normalized = normalizeManifest(manifest);

    expect(normalized.manifestVersion).toBe("0.7");
    expect(normalized.requirements).toEqual({
      requirements: [
        {
          id: "CF-R001",
          text: "生成可审核内容草稿",
          priority: "mvp",
        },
      ],
      nonGoals: ["直接保存外部系统明文凭证"],
    });
    expect(normalized.boundary).toEqual([
      {
        requirementId: "CF-R001",
        planes: {
          app: { owns: ["workflow_state"] },
          host: { requires: ["lime.agent", "lime.evidence"] },
          human: { owns: ["publish_decision"] },
        },
      },
    ]);
    expect(normalized.integrations).toEqual([
      {
        key: "planning_table",
        provider: "cloud.table",
        executionPlane: "hybrid",
        hostCapability: "lime.connectors",
      },
    ]);
    expect(normalized.operations).toEqual([
      {
        key: "write_external_draft",
        type: "external_write",
        sideEffect: "external_write",
        approvalRequired: true,
        dryRunRequired: true,
        evidenceRequired: true,
        autoExecute: false,
      },
    ]);
  });
});
