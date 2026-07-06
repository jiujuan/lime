import { describe, expect, it } from "vitest";
import type {
  PluginRuntimeMcpBinding,
  SkillRefDeclaration,
  SkillRequirementProjection,
  ToolRefDeclaration,
  ToolRequirementProjection,
} from "../types";
import type { AppCenterItem } from "./PluginsPageViewModel";
import {
  buildDetailMcpBindings,
  buildDetailSkills,
  buildDetailTools,
} from "./pluginDetailDeclarations";

function buildItemWithSkillSources(params: {
  projectionSkills?: SkillRequirementProjection[];
  manifestSkillRefs?: SkillRefDeclaration[];
  projectionTools?: ToolRequirementProjection[];
  manifestToolRefs?: ToolRefDeclaration[];
  projectionMcpBindings?: PluginRuntimeMcpBinding[];
  manifestMcpBindings?: PluginRuntimeMcpBinding[];
}): AppCenterItem {
  return {
    appId: "runtime-plugin",
    title: "Runtime Plugin",
    description: "Runtime capability test fixture",
    iconSrc: "data:image/svg+xml,fixture",
    sourceKind: "local",
    statusKind: "installed",
    entries: [],
    registrationBlocked: false,
    canReviewCloud: false,
    installedState: {
      projection: {
        skillRequirements: params.projectionSkills ?? [],
        toolRequirements: params.projectionTools ?? [],
        runtimeCapabilities: params.projectionMcpBindings
          ? {
              schemaVersion: "plugin-runtime-capabilities/v0.1",
              pluginId: "runtime-plugin",
              skills: [],
              tools: [],
              mcpBindings: params.projectionMcpBindings,
              workflowBindings: [],
            }
          : undefined,
      },
      manifest: {
        skillRefs: params.manifestSkillRefs ?? [],
        toolRefs: params.manifestToolRefs ?? [],
        runtimeCapabilities: params.manifestMcpBindings
          ? {
              schemaVersion: "plugin-runtime-capabilities/v0.1",
              pluginId: "runtime-plugin",
              skills: [],
              tools: [],
              mcpBindings: params.manifestMcpBindings,
              workflowBindings: [],
            }
          : undefined,
      },
    },
  } as AppCenterItem;
}

describe("plugin detail declarations", () => {
  it("技能详情优先消费 projection skill requirements", () => {
    const item = buildItemWithSkillSources({
      projectionSkills: [
        {
          id: "runtime-skill",
          title: "Runtime Skill",
          description: "Projected from runtime capability snapshot",
          activation: "content.runtime.skill",
          required: true,
          promptInjectionPolicy: {
            mode: "workflow_scoped",
            source: "runtimeCapabilities.skills",
          },
        },
      ],
      manifestSkillRefs: [
        {
          id: "legacy-skill",
          title: "Legacy Skill",
          description: "Legacy manifest fallback",
          required: true,
        },
      ],
    });

    expect(buildDetailSkills(item)).toEqual([
      {
        key: "runtime-skill",
        title: "Runtime Skill",
        description: "Projected from runtime capability snapshot",
        meta: "content.runtime.skill",
        required: true,
      },
    ]);
  });

  it("projection 缺失时才回退旧 skillRefs", () => {
    const item = buildItemWithSkillSources({
      manifestSkillRefs: [
        {
          id: "legacy-skill",
          title: "Legacy Skill",
          description: "Legacy manifest fallback",
          activation: "legacy.activation",
          required: false,
        },
      ],
    });

    expect(buildDetailSkills(item)).toEqual([
      {
        key: "legacy-skill",
        title: "Legacy Skill",
        description: "Legacy manifest fallback",
        meta: "legacy.activation",
        required: false,
      },
    ]);
  });

  it("工具详情优先消费 projection tool requirements", () => {
    const item = buildItemWithSkillSources({
      projectionTools: [
        {
          key: "runtime-tool",
          title: "Runtime Tool",
          description: "Projected runtime tool",
          provider: "mcp",
          bindingKind: "mcp",
          capabilities: ["content.runtime.skill"],
          required: true,
        },
      ],
      manifestToolRefs: [
        {
          key: "legacy-tool",
          title: "Legacy Tool",
          provider: "local-cli",
          capabilities: ["legacy.capability"],
          required: false,
        },
      ],
    });

    expect(buildDetailTools(item)).toEqual([
      {
        key: "runtime-tool",
        title: "Runtime Tool",
        description: "Projected runtime tool",
        meta: "mcp",
        required: true,
        aliases: ["content.runtime.skill"],
      },
    ]);
  });

  it("projection 工具缺失时才回退旧 toolRefs", () => {
    const item = buildItemWithSkillSources({
      manifestToolRefs: [
        {
          key: "legacy-tool",
          title: "Legacy Tool",
          description: "Legacy manifest tool",
          provider: "local-cli",
          capabilities: ["legacy.capability"],
          required: true,
        },
      ],
    });

    expect(buildDetailTools(item)).toEqual([
      {
        key: "legacy-tool",
        title: "Legacy Tool",
        description: "Legacy manifest tool",
        meta: "local-cli",
        required: true,
        aliases: ["legacy.capability"],
      },
    ]);
  });

  it("MCP 详情优先消费 projection runtime capability bindings", () => {
    const item = buildItemWithSkillSources({
      projectionMcpBindings: [
        {
          serverId: "browser",
          toolKey: "browser/search",
          provider: "mcp",
          required: true,
        },
      ],
      manifestMcpBindings: [
        {
          serverId: "legacy",
          toolKey: "legacy/search",
          provider: "mcp",
          required: false,
        },
      ],
    });

    expect(buildDetailMcpBindings(item)).toEqual([
      {
        key: "browser:browser/search",
        title: "browser",
        description: "browser/search",
        meta: "mcp",
        required: true,
      },
    ]);
  });

  it("projection MCP 绑定缺失时才回退 manifest runtimeCapabilities", () => {
    const item = buildItemWithSkillSources({
      manifestMcpBindings: [
        {
          serverId: "legacy",
          toolKey: "legacy/search",
          provider: "mcp",
          required: false,
        },
      ],
    });

    expect(buildDetailMcpBindings(item)).toEqual([
      {
        key: "legacy:legacy/search",
        title: "legacy",
        description: "legacy/search",
        meta: "mcp",
        required: false,
      },
    ]);
  });
});
