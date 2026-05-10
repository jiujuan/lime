import { describe, expect, it } from "vitest";

import {
  CORE_NAMESPACES,
  hasBundledNamespace,
  loadBundledI18nResources,
  loadNamespaceResource,
} from "../loadNamespace";
import { SUPPORTED_LOCALES } from "../locales";

describe("i18n namespace loader", () => {
  it("应为每个支持 locale 内联核心 namespace", () => {
    const resources = loadBundledI18nResources();

    expect(Object.keys(resources).sort()).toEqual(
      [...SUPPORTED_LOCALES].sort(),
    );
    for (const locale of SUPPORTED_LOCALES) {
      expect(Object.keys(resources[locale]).sort()).toEqual(
        [...CORE_NAMESPACES].sort(),
      );
      expect(resources[locale].common).toHaveProperty("common.save");
    }
  });

  it("应能检测已打包 namespace，并把旧 locale 归一后查询", () => {
    expect(hasBundledNamespace("en", "settings")).toBe(true);
    expect(hasBundledNamespace("zh-Hant", "common")).toBe(true);
  });

  it("应在 locale 不支持时回落到 zh-CN resource", () => {
    expect(loadNamespaceResource("fr-FR", "common")["common.save"]).toBe(
      "保存",
    );
  });

  it("应内联主导航 namespace 的首屏文案", () => {
    expect(
      loadNamespaceResource("en-US", "navigation")[
        "navigation.sidebar.items.homeGeneral"
      ],
    ).toBe("New Task");
    expect(
      loadNamespaceResource("zh-CN", "navigation")[
        "navigation.sidebar.items.knowledge"
      ],
    ).toBe("项目资料");
  });
});
