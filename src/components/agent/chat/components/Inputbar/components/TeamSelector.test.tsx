import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import {
  createTeamDefinitionFromPreset,
  type TeamDefinition,
} from "../../../utils/teamDefinitions";
import { TeamSelector } from "./TeamSelector";

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

function renderTeamSelector(
  props?: Partial<ComponentProps<typeof TeamSelector>>,
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const defaultProps: ComponentProps<typeof TeamSelector> = {
    onSelectTeam: vi.fn(),
  };

  act(() => {
    root.render(<TeamSelector {...defaultProps} {...props} />);
  });

  mountedRoots.push({ root, container });
  return container;
}

describe("TeamSelector", () => {
  beforeEach(async () => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    await changeLimeLocale("zh-CN");
  });

  afterEach(() => {
    while (mountedRoots.length > 0) {
      const mounted = mountedRoots.pop();
      if (!mounted) {
        break;
      }
      act(() => {
        mounted.root.unmount();
      });
      mounted.container.remove();
    }
    vi.clearAllMocks();
  });

  it("触发按钮 chrome 文案应跟随 en-US 资源", async () => {
    await changeLimeLocale("en-US");
    const selectedTeam = createTeamDefinitionFromPreset(
      "code-triage-team",
    ) as TeamDefinition;
    const container = renderTeamSelector({ selectedTeam });

    expect(
      container.querySelector('[data-testid="team-selector-trigger"]')
        ?.textContent,
    ).toContain("Team · 代码排障团队");
    expect(container.textContent).not.toContain("分工 ·");
  });

  it("未选择分工时应展示 zh-CN 默认入口", async () => {
    const container = renderTeamSelector();

    expect(container.textContent).toContain("配置分工");
  });
});
