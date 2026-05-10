import i18n from "i18next";
import { describe, expect, it } from "vitest";

function assertI18nKeyTypes() {
  i18n.t("common.save", { ns: "common" });
  i18n.t("navigation.sidebar.items.homeGeneral", { ns: "navigation" });
  i18n.t("settings.appearance.language.title", { ns: "settings" });

  // @ts-expect-error i18next key 必须来自已迁移的 zh-CN source resource。
  i18n.t("common.__missing__", { ns: "common" });
}

describe("i18n type binding", () => {
  it("应把类型断言保留在 tsc 覆盖范围内", () => {
    expect(typeof assertI18nKeyTypes).toBe("function");
  });
});
