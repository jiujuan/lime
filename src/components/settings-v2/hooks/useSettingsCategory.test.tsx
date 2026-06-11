import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import { SettingsGroupKey, SettingsTabs } from "@/types/settings";
import { useSettingsCategory, type CategoryGroup } from "./useSettingsCategory";

interface Mounted {
  container: HTMLDivElement;
  root: Root;
}

const mounted: Mounted[] = [];

function renderHookProbe(onGroups: (groups: CategoryGroup[]) => void) {
  function Probe() {
    onGroups(useSettingsCategory());
    return null;
  }

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<Probe />);
  });

  mounted.push({ container, root });
}

beforeEach(async () => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  await changeLimeLocale("en-US");
});

afterEach(async () => {
  while (mounted.length > 0) {
    const current = mounted.pop();
    if (!current) {
      break;
    }

    act(() => {
      current.root.unmount();
    });
    current.container.remove();
  }

  await changeLimeLocale("zh-CN");
});

describe("useSettingsCategory", () => {
  it("系统导航应只保留开发者与实验功能合并入口", () => {
    let groups: CategoryGroup[] = [];

    renderHookProbe((nextGroups) => {
      groups = nextGroups;
    });

    const systemGroup = groups.find(
      (group) => group.key === SettingsGroupKey.System,
    );
    const systemKeys = systemGroup?.items.map((item) => item.key) ?? [];
    const developerItem = systemGroup?.items.find(
      (item) => item.key === SettingsTabs.Developer,
    );

    expect(systemGroup?.title).toBe("System");
    expect(systemKeys).toContain(SettingsTabs.Developer);
    expect(systemKeys).not.toContain(SettingsTabs.Experimental);
    expect(developerItem?.label).toBe("Developer & Labs");
    expect(developerItem?.label).not.toBe("开发者与实验功能");
    expect(developerItem?.label).not.toContain("settings.tab.developerLab");
    expect(developerItem?.experimental).toBe(true);
  });

  it("通用导航应包含已归档对话入口", () => {
    let groups: CategoryGroup[] = [];

    renderHookProbe((nextGroups) => {
      groups = nextGroups;
    });

    const generalGroup = groups.find(
      (group) => group.key === SettingsGroupKey.General,
    );
    const archivedItem = generalGroup?.items.find(
      (item) => item.key === SettingsTabs.ArchivedConversations,
    );

    expect(generalGroup?.title).toBe("General");
    expect(archivedItem?.label).toBe("Archived Conversations");
    expect(generalGroup?.items.map((item) => item.key)).toContain(
      SettingsTabs.ArchivedConversations,
    );
  });
});
