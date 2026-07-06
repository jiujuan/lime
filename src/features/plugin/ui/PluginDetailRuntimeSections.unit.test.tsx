import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { AppCenterItem } from "./PluginsPageViewModel";
import {
  PluginDetailRuntimeRequirementSections,
  PluginDetailSubagentsSection,
} from "./PluginDetailRuntimeSections";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

type MountedSection = {
  container: HTMLDivElement;
  root: Root;
};

const mountedSections: MountedSection[] = [];

beforeAll(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  delete (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT;
});

function mount(element: JSX.Element): HTMLDivElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedSections.push({ container, root });
  act(() => {
    root.render(element);
  });
  return container;
}

function buildRuntimeItem(): AppCenterItem {
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
        skillRequirements: [
          {
            id: "runtime-skill",
            title: "Runtime Skill",
            description: "Projected skill",
            activation: "content.runtime.skill",
            required: true,
          },
        ],
        toolRequirements: [
          {
            key: "browser/search",
            title: "Browser Search",
            description: "Projected tool",
            provider: "mcp",
            bindingKind: "mcp",
            capabilities: ["content.runtime.skill"],
            required: true,
          },
        ],
        runtimeCapabilities: {
          schemaVersion: "plugin-runtime-capabilities/v0.1",
          pluginId: "runtime-plugin",
          skills: [],
          tools: [],
          mcpBindings: [
            {
              serverId: "browser",
              toolKey: "browser/search",
              provider: "mcp",
              required: true,
            },
          ],
          workflowBindings: [],
        },
      },
      manifest: {
        subagents: [
          {
            id: "research-agent",
            title: "Research Agent",
            description: "Declared subagent",
            required: true,
          },
        ],
      },
    },
  } as AppCenterItem;
}

describe("PluginDetailRuntimeSections", () => {
  afterEach(() => {
    for (const { root, container } of mountedSections.splice(0)) {
      act(() => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("渲染 subagent 详情区并保留既有 data-testid", () => {
    const container = mount(
      <PluginDetailSubagentsSection item={buildRuntimeItem()} />,
    );

    expect(
      container.querySelector("[data-testid='plugins-detail-subagents']"),
    ).not.toBeNull();
    expect(
      container.querySelector(
        "[data-testid='plugins-detail-subagent-research-agent']",
      )?.textContent,
    ).toContain("Research Agent");
  });

  it("渲染 projection skills / tools / MCP bindings 详情区", () => {
    const container = mount(
      <PluginDetailRuntimeRequirementSections item={buildRuntimeItem()} />,
    );

    expect(
      container.querySelector("[data-testid='plugins-detail-skills']")
        ?.textContent,
    ).toContain("Runtime Skill");
    expect(
      container.querySelector("[data-testid='plugins-detail-tools']")
        ?.textContent,
    ).toContain("Browser Search");
    expect(
      container.querySelector("[data-testid='plugins-detail-tools']")
        ?.textContent,
    ).toContain("content.runtime.skill");
    expect(
      container.querySelector("[data-testid='plugins-detail-mcp-bindings']")
        ?.textContent,
    ).toContain("browser/search");
  });
});
